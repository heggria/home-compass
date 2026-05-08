/**
 * AmenityLayer — generic POI layer for schools, hospitals, malls, parks…
 *
 * One layer module supports multiple categories so we don't end up with
 * 6 near-identical files. The layer creates one `Points` per category and
 * exposes a unified picking surface.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapEntity, MapLayer } from "../core/types";
import { repo, type PoiItem } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

export interface AmenityCategoryConfig {
  /** key in poi_cats.json */
  key: string;
  /** Inspector subtitle */
  label: string;
  /** entity kind for the inspector */
  kind: "school" | "hospital" | "mall" | "park" | "custom";
  /** fallback color if file does not provide one */
  fallbackColor: number;
  /** picking threshold in pixels (Points raycaster) */
  pickThreshold?: number;
  /** marker size in screen pixels */
  size?: number;
  /** service radius (m) used for halo */
  serviceRadiusM?: number;
}

interface PointRecord {
  category: string;
  config: AmenityCategoryConfig;
  item: PoiItem;
  worldX: number;
  worldZ: number;
}

export class AmenityLayer implements MapLayer {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly group = "amenity" as const;
  readonly pickable = true;
  readonly defaultVisible: boolean;

  private group3 = new THREE.Group();
  private categories: AmenityCategoryConfig[];
  private points: THREE.Points[] = [];
  private records: Map<THREE.Points, PointRecord[]> = new Map();
  private materials: THREE.PointsMaterial[] = [];
  private haloMesh!: THREE.Mesh;
  private haloMat!: THREE.MeshBasicMaterial;

  constructor(opts: {
    id: string;
    label: string;
    order: number;
    defaultVisible?: boolean;
    categories: AmenityCategoryConfig[];
  }) {
    this.id = opts.id;
    this.label = opts.label;
    this.order = opts.order;
    this.defaultVisible = opts.defaultVisible ?? false;
    this.categories = opts.categories;
  }

  async setup({ scene, projector }: LayerSetupContext) {
    const poi = await repo.poi();

    for (const cat of this.categories) {
      const data = poi[cat.key];
      if (!data || !data.items?.length) continue;
      const colorHex = parseHex(data.color, cat.fallbackColor);
      const records: PointRecord[] = data.items.map((it) => {
        const w = projector.project({ lng: it.lon, lat: it.lat });
        return { category: cat.key, config: cat, item: it, worldX: w.x, worldZ: w.z };
      });
      const positions = new Float32Array(records.length * 3);
      records.forEach((r, i) => {
        positions[i * 3] = r.worldX;
        positions[i * 3 + 1] = z.poi;
        positions[i * 3 + 2] = r.worldZ;
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: cat.size ?? 22,
        sizeAttenuation: false,
        color: colorHex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      this.materials.push(mat);
      const pts = new THREE.Points(geom, mat);
      pts.userData.category = cat.key;
      pts.renderOrder = 30;
      this.records.set(pts, records);
      this.points.push(pts);
      this.group3.add(pts);
    }

    // Generic halo ring used for service-area highlights
    const ringGeom = new THREE.RingGeometry(800, 820, 96);
    ringGeom.rotateX(-Math.PI / 2);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.haloMesh = new THREE.Mesh(ringGeom, this.haloMat);
    this.haloMesh.position.y = z.serviceArea;
    this.haloMesh.visible = false;
    this.group3.add(this.haloMesh);

    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }
  setOpacity(v: number) {
    for (const m of this.materials) m.opacity = v * 0.85;
  }

  setHover(_id: string | null) {
    /* hover is currently visualised by Inspector only */
  }
  setSelection(id: string | null) {
    if (!id) {
      this.haloMesh.visible = false;
      return;
    }
    for (const [pts, records] of this.records) {
      const r = records.find((rec) => makeId(this.id, rec) === id);
      if (r) {
        this.haloMesh.position.set(r.worldX, z.serviceArea, r.worldZ);
        this.haloMesh.scale.set(1, 1, 1);
        this.haloMesh.visible = true;
        const radius = r.config.serviceRadiusM ?? 800;
        const scale = radius / 800;
        this.haloMesh.scale.set(scale, 1, scale);
        this.haloMat.color.setHex(r.config.fallbackColor);
        this.haloMat.opacity = 0.55;
        return;
      }
      void pts;
    }
    this.haloMesh.visible = false;
  }

  pick(raycaster: THREE.Raycaster): MapEntity | null {
    raycaster.params.Points = { threshold: 50 } as never;
    for (const pts of this.points) {
      const hits = raycaster.intersectObject(pts, false);
      if (!hits.length) continue;
      const hit = hits[0];
      const records = this.records.get(pts)!;
      const i = hit.index ?? -1;
      if (i < 0 || i >= records.length) continue;
      const r = records[i];
      return {
        id: makeId(this.id, r),
        kind: r.config.kind === "custom" ? "custom" : (r.config.kind as MapEntity["kind"]),
        title: r.item.name,
        subtitle: r.config.label,
        lngLat: { lng: r.item.lon, lat: r.item.lat },
        radius: r.config.serviceRadiusM ?? 800,
        source: this.id,
        data: { ...r.item, category: r.category, config: r.config, worldX: r.worldX, worldZ: r.worldZ },
      };
    }
    return null;
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.materials.forEach((m) => m.dispose());
    this.haloMat.dispose();
  }
}

function parseHex(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const v = hex.replace(/^#/, "");
  if (v.length === 6) return parseInt(v, 16);
  return fallback;
}

function makeId(layerId: string, r: PointRecord): string {
  return `${layerId}:${r.category}:${r.item.name}@${r.item.lon.toFixed(5)},${r.item.lat.toFixed(5)}`;
}
