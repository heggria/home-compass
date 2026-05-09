/**
 * DistrictsLayer — extruded 小区 polygons.
 *
 * Height encodes 均价 (price-per-㎡); color encodes the active baseMode
 * (price ramp / 综合分 / metro accessibility / policy boost).
 *
 * One Mesh per district to keep picking trivial; we batch geometry via
 * BufferGeometryUtils.mergeGeometries in PR2 if perf demands it.
 */

import * as THREE from "three";
import type {
  FrameContext,
  LayerSetupContext,
  MapEntity,
  MapLayer,
} from "../core/types";
import { repo, type DistrictsFeatureCollection } from "../data/repo";
import { rampColor, sceneColors, z } from "../tokens/design";
import { useMapStore, type BaseMode } from "../store/mapStore";
import { ringCentroid } from "../utils/geometry";

interface DistrictRecord {
  id: string;
  osmId: number;
  name: string;
  centroid: { lng: number; lat: number };
  worldX: number;
  worldZ: number;
  price?: number;
  count: number;
  area?: number;
  total?: number;
  distSubway?: number;
  // Pre-computed scores for color modes
  priceT: number; // 0..1 normalized for ramp
  scoreT: number; // 综合分 0..1 (placeholder formula)
  metroT: number; // 0..1 metro accessibility
  policyT: number; // 0..1 policy boost (placeholder)
  mesh: THREE.Mesh;
  baseColor: THREE.Color;
}

const HEIGHT_PRICE_M_PER_WAN = 90;   // 1 万/㎡ → 90 m of extrusion
const HEIGHT_MIN = 25;
const HEIGHT_NEUTRAL = 18;            // for districts with no price
const HALO_PERIOD = 1.6;              // seconds

export class DistrictsLayer implements MapLayer {
  readonly id = "districts";
  readonly label = "小区";
  readonly order = 30;
  readonly group = "supply" as const;
  readonly pickable = true;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private records: DistrictRecord[] = [];
  private hoverId: string | null = null;
  private selectId: string | null = null;
  private materialPool: THREE.MeshPhysicalMaterial[] = [];
  private edgeMaterials: THREE.LineBasicMaterial[] = [];
  private storeUnsub: (() => void) | null = null;
  private currentMode: BaseMode = useMapStore.getState().baseMode;

  async setup({ scene, projector }: LayerSetupContext) {
    const fc = await repo.districts();
    this.buildFromFeatureCollection(fc, projector);
    scene.add(this.group3);

    // React to baseMode changes from HUD
    this.storeUnsub = useMapStore.subscribe(
      (s) => s.baseMode,
      (mode) => {
        this.currentMode = mode;
        this.repaint();
      },
    );
    this.repaint();
  }

  private buildFromFeatureCollection(
    fc: DistrictsFeatureCollection,
    projector: { project: (l: { lng: number; lat: number }) => { x: number; z: number } },
  ) {
    // First pass: derive normalization stats
    const prices: number[] = [];
    const distances: number[] = [];
    for (const f of fc.features) {
      const p = f.properties.均价;
      if (typeof p === "number" && p > 0) prices.push(p);
      const d = f.properties.dist_subway_m;
      if (typeof d === "number" && d > 0) distances.push(d);
    }
    const priceMin = Math.min(...prices, 3);
    const priceMax = Math.max(...prices, 12);
    const distMin = 0;
    const distMax = Math.max(...distances, 2000);

    for (const f of fc.features) {
      const props = f.properties;
      const rings = normalizeToPolygonRings(f.geometry);
      if (!rings) continue;
      const centroid = ringCentroid(rings[0]);
      const w = projector.project(centroid);

      const price = typeof props.均价 === "number" ? props.均价 : undefined;
      const count = props.成交 ?? 0;
      const dist = typeof props.dist_subway_m === "number" ? props.dist_subway_m : undefined;

      const priceT =
        price !== undefined
          ? clamp01((price - priceMin) / Math.max(0.01, priceMax - priceMin))
          : NaN;
      const metroT =
        dist !== undefined
          ? clamp01(1 - (dist - distMin) / Math.max(1, distMax - distMin))
          : NaN;
      const scoreT = combinedScore(priceT, metroT, count);
      const policyT = NaN; // PR3 will fill this in from policy projects

      const height =
        price !== undefined
          ? Math.max(HEIGHT_MIN, price * HEIGHT_PRICE_M_PER_WAN)
          : HEIGHT_NEUTRAL;

      const geom = buildExtrudedPolygon(rings, height, projector);
      // MeshPhysicalMaterial with clearcoat → glass-like reads well under the
      // violet/cyan rim lights and bloom. Emissive carries the data signal
      // even in shadow.
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x141728,
        emissive: 0x000000,
        emissiveIntensity: 0.4,
        metalness: 0.08,
        roughness: 0.46,
        clearcoat: 0.85,
        clearcoatRoughness: 0.32,
        transparent: true,
        opacity: 0.94,
      });
      this.materialPool.push(mat);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = z.districtBase;
      mesh.userData.districtId = `district:${props.osm_id}`;
      this.group3.add(mesh);

      // Top-edge neon outline — only the top ring of the extrusion. Adds
      // architectural definition without expensive bevel maths.
      const edgeMat = new THREE.LineBasicMaterial({
        color: sceneColors.district.topEdge,
        transparent: true,
        opacity: 0.7,
      });
      this.edgeMaterials.push(edgeMat);
      const edgeGeom = buildTopEdgeRing(rings, projector);
      const edge = new THREE.LineSegments(edgeGeom, edgeMat);
      edge.position.y = z.districtBase + Math.max(0.5, height) + 0.3;
      edge.renderOrder = 21;
      this.group3.add(edge);

      this.records.push({
        id: `district:${props.osm_id}`,
        osmId: props.osm_id,
        name: props.osm_name,
        centroid,
        worldX: w.x,
        worldZ: w.z,
        price,
        count,
        area: typeof props.均面积 === "number" ? props.均面积 : undefined,
        total: typeof props.均总价 === "number" ? props.均总价 : undefined,
        distSubway: dist,
        priceT: isNaN(priceT) ? 0 : priceT,
        scoreT: isNaN(scoreT) ? 0 : scoreT,
        metroT: isNaN(metroT) ? 0 : metroT,
        policyT: 0,
        mesh,
        baseColor: new THREE.Color(),
      });
    }
  }

  private repaint() {
    const ramp = sceneColors.district.rampStops;
    const hasDataColor = (t: number) => new THREE.Color(rampColor(t, ramp));
    const noDataColor = new THREE.Color(sceneColors.district.neutral);
    for (const r of this.records) {
      let t: number;
      let hasData: boolean;
      switch (this.currentMode) {
        case "price":
          hasData = r.price !== undefined;
          t = r.priceT;
          break;
        case "metro":
          hasData = r.distSubway !== undefined;
          t = r.metroT;
          break;
        case "policy":
          hasData = r.policyT > 0;
          t = r.policyT;
          break;
        case "score":
        default:
          hasData = r.price !== undefined;
          t = r.scoreT;
          break;
      }
      const c = hasData ? hasDataColor(t) : noDataColor;
      r.baseColor.copy(c);
      const mat = r.mesh.material as THREE.MeshPhysicalMaterial;
      // Diffuse stays close to the cyber-night base color — it's the
      // emissive that carries the data; this keeps the surface readable
      // (not just one big neon blob) while preserving signal density.
      mat.color.set(0x0e1020).lerp(c, 0.15);
      mat.emissive.copy(c);
      mat.emissiveIntensity = hasData ? 0.4 : 0.12;
    }
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }
  setOpacity(v: number) {
    for (const m of this.materialPool) m.opacity = v * 0.94;
    for (const m of this.edgeMaterials) m.opacity = v * 0.7;
  }

  setHover(entityId: string | null) {
    this.hoverId = entityId;
  }
  setSelection(entityId: string | null) {
    this.selectId = entityId;
  }

  update(frame: FrameContext) {
    // Pulse the emissive intensity of hover/selection — keep the colored
    // ramp (set in repaint) intact, just modulate brightness.
    const pulse = 0.5 + 0.5 * Math.sin((frame.time / HALO_PERIOD) * Math.PI * 2);
    const baseHasData = 0.4;
    const baseNoData = 0.12;
    for (const r of this.records) {
      const mat = r.mesh.material as THREE.MeshPhysicalMaterial;
      const dataBoost = r.price !== undefined ? baseHasData : baseNoData;
      if (r.id === this.selectId) {
        mat.emissiveIntensity = dataBoost + 1.2 + 0.4 * pulse;
      } else if (r.id === this.hoverId) {
        mat.emissiveIntensity = dataBoost + 0.5 + 0.35 * pulse;
      } else {
        mat.emissiveIntensity = dataBoost;
      }
    }
  }

  pick(raycaster: THREE.Raycaster): MapEntity | null {
    // Only the extruded meshes are pickable — skip the LineSegments edges
    const meshes = this.records.map((r) => r.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const id = (hit.object.userData as { districtId?: string }).districtId;
    if (!id) return null;
    const r = this.records.find((x) => x.id === id);
    if (!r) return null;
    return {
      id: r.id,
      kind: "district",
      title: r.name,
      subtitle: r.price ? `${r.price.toFixed(1)} 万/㎡ · 成交 ${r.count}` : "暂无近期成交数据",
      lngLat: r.centroid,
      radius: 200,
      source: this.id,
      data: {
        name: r.name,
        price: r.price,
        count: r.count,
        area: r.area,
        total: r.total,
        distSubway: r.distSubway,
        scoreT: r.scoreT,
        priceT: r.priceT,
        metroT: r.metroT,
        worldX: r.worldX,
        worldZ: r.worldZ,
      },
    };
  }

  /** Public lookup so other layers / interactions can find a district. */
  getRecords() {
    return this.records;
  }

  dispose() {
    this.storeUnsub?.();
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.materialPool.forEach((m) => m.dispose());
  }
}

// ----------------- helpers -----------------

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function combinedScore(priceT: number, metroT: number, count: number): number {
  // "Score" = inverse of priceT (cheaper = better) blended with metroT and a small liquidity factor.
  if (isNaN(priceT) && isNaN(metroT)) return 0;
  const affordability = isNaN(priceT) ? 0.5 : 1 - priceT;
  const metro = isNaN(metroT) ? 0.5 : metroT;
  const liquidity = clamp01(count / 12);
  return clamp01(affordability * 0.45 + metro * 0.35 + liquidity * 0.2);
}

function normalizeToPolygonRings(geom: {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}): number[][][] | null {
  if (geom.type === "Polygon") return geom.coordinates as number[][][];
  if (geom.type === "MultiPolygon") {
    // pick the largest polygon (good enough for visualisation)
    const polys = geom.coordinates as number[][][][];
    let best: number[][][] | null = null;
    let bestN = 0;
    for (const p of polys) {
      const n = p[0]?.length ?? 0;
      if (n > bestN) {
        best = p;
        bestN = n;
      }
    }
    return best;
  }
  return null;
}

function buildExtrudedPolygon(
  rings: number[][][],
  height: number,
  projector: { project: (l: { lng: number; lat: number }) => { x: number; z: number } },
): THREE.BufferGeometry {
  const outer = rings[0];
  const shape = new THREE.Shape();
  outer.forEach(([lng, lat], i) => {
    const { x, z } = projector.project({ lng, lat });
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  for (let h = 1; h < rings.length; h++) {
    const hole = new THREE.Path();
    rings[h].forEach(([lng, lat], i) => {
      const { x, z } = projector.project({ lng, lat });
      if (i === 0) hole.moveTo(x, -z);
      else hole.lineTo(x, -z);
    });
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.5, height),
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 1.2,
    bevelThickness: 1.2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Build the top-edge wireframe of a polygon ring at y=0 (caller positions
 * it at the top of the extrusion). Returns LineSegments-compatible
 * geometry where each pair of consecutive points = one segment.
 */
function buildTopEdgeRing(
  rings: number[][][],
  projector: { project: (l: { lng: number; lat: number }) => { x: number; z: number } },
): THREE.BufferGeometry {
  const segs: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = projector.project({ lng: ring[i][0], lat: ring[i][1] });
      const b = projector.project({ lng: ring[i + 1][0], lat: ring[i + 1][1] });
      segs.push(a.x, 0, a.z, b.x, 0, b.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
  return g;
}
