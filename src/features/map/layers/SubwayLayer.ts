/**
 * SubwayLayer — colored subway lines + glowing station beads.
 *
 * Lines: Line2 (LineSegments2 + LineMaterial) so we get true world-space
 * width and they don't disappear at zoom-out. Stations: a 2-tier visual —
 * an additive sprite halo for "presence" + a small disc on top for the
 * exact pick point.
 */

import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

import type { LayerSetupContext, MapEntity, MapLayer } from "../core/types";
import { repo, type SubwayLine, type PoiCategoryMap } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

interface StationData {
  name: string;
  lng: number;
  lat: number;
  color: number;
  worldX: number;
  worldZ: number;
  haloSprite: THREE.Sprite;
  dotSprite: THREE.Sprite;
}

let HALO_TEX: THREE.CanvasTexture | null = null;
function haloTexture(): THREE.CanvasTexture {
  if (HALO_TEX) return HALO_TEX;
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0.0, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, N, N);
  HALO_TEX = new THREE.CanvasTexture(c);
  HALO_TEX.colorSpace = THREE.SRGBColorSpace;
  return HALO_TEX;
}

let DOT_TEX: THREE.CanvasTexture | null = null;
function dotTexture(): THREE.CanvasTexture {
  if (DOT_TEX) return DOT_TEX;
  const N = 64;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0.0, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.6, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.8, "rgba(255,255,255,0.4)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, N, N);
  DOT_TEX = new THREE.CanvasTexture(c);
  DOT_TEX.colorSpace = THREE.SRGBColorSpace;
  return DOT_TEX;
}

export class SubwayLayer implements MapLayer {
  readonly id = "subway";
  readonly label = "地铁";
  readonly order = 11;
  readonly group = "infrastructure" as const;
  readonly pickable = true;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private lineMaterials: LineMaterial[] = [];
  private lines2: LineSegments2[] = [];
  private stations: StationData[] = [];
  private hoverIndex = -1;
  private selectIndex = -1;
  private haloMesh!: THREE.Mesh;
  private haloMat!: THREE.MeshBasicMaterial;
  private haloMatPool: THREE.SpriteMaterial[] = [];
  private dotMatPool: THREE.SpriteMaterial[] = [];

  async setup({ scene, projector }: LayerSetupContext) {
    const [lines, poi] = await Promise.all([repo.subway(), repo.poi()]);
    const dpr = Math.min(window.devicePixelRatio, 2);
    const resolution = new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr);

    // ----- lines (Line2 = world-space width) -----
    const overrides = sceneColors.subwayLineOverrides;
    for (const line of lines as SubwayLine[]) {
      if (!line.segs?.length) continue;
      const positions: number[] = [];
      for (let i = 0; i < line.segs.length; i += 2) {
        const { x, z: zz } = projector.project({ lng: line.segs[i], lat: line.segs[i + 1] });
        positions.push(x, z.subway, zz);
      }
      const geom = new LineSegmentsGeometry();
      geom.setPositions(positions);

      // Per-line overrides (e.g. 13/27/未知线 in raw OSM are too saturated
      // for our cyber-violet palette). Falls back to the file-provided color.
      const colorHex =
        (line.name && overrides[line.name] !== undefined)
          ? overrides[line.name]
          : parseHexColor(line.color, sceneColors.subwayDefault);
      const mat = new LineMaterial({
        color: colorHex,
        linewidth: 5.5,       // pixels — slightly tighter so 13/14/15 don't crowd the eye
        worldUnits: false,
        transparent: true,
        opacity: 0.92,
        depthTest: true,
        depthWrite: false,
      });
      mat.resolution.copy(resolution);
      this.lineMaterials.push(mat);
      const line2 = new LineSegments2(geom, mat);
      line2.computeLineDistances();
      line2.renderOrder = 10;
      this.lines2.push(line2);
      this.group3.add(line2);
    }

    // ----- stations (halo sprite + dot sprite) -----
    const swStation = (poi as PoiCategoryMap).subway_station;
    if (swStation && swStation.items.length) {
      const stationColor = parseHexColor(swStation.color, sceneColors.subwayDefault);
      const haloTex = haloTexture();
      const dotTex = dotTexture();
      for (const it of swStation.items) {
        const w = projector.project({ lng: it.lon, lat: it.lat });
        const haloMat = new THREE.SpriteMaterial({
          map: haloTex,
          color: stationColor,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.55,
        });
        const dotMat = new THREE.SpriteMaterial({
          map: dotTex,
          color: 0xffffff,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          opacity: 1,
        });
        this.haloMatPool.push(haloMat);
        this.dotMatPool.push(dotMat);
        const halo = new THREE.Sprite(haloMat);
        halo.scale.set(360, 360, 1);
        halo.position.set(w.x, z.subway + 200, w.z);
        halo.renderOrder = 28;
        const dot = new THREE.Sprite(dotMat);
        dot.scale.set(110, 110, 1);
        dot.position.set(w.x, z.subway + 220, w.z);
        dot.renderOrder = 29;
        this.group3.add(halo, dot);
        this.stations.push({
          name: it.name,
          lng: it.lon,
          lat: it.lat,
          color: stationColor,
          worldX: w.x,
          worldZ: w.z,
          haloSprite: halo,
          dotSprite: dot,
        });
      }
    }

    // ----- selection halo (radius ring rendered when a station is selected) -----
    const ringGeom = new THREE.RingGeometry(780, 820, 96);
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
    for (const m of this.lineMaterials) m.opacity = v * 0.92;
    for (const m of this.haloMatPool) m.opacity = v * 0.55;
    for (const m of this.dotMatPool) m.opacity = v;
  }

  setSelection(entityId: string | null) {
    if (!entityId) {
      this.selectIndex = -1;
      this.haloMesh.visible = false;
      return;
    }
    const idx = this.stations.findIndex((s) => `subway:${s.name}` === entityId);
    this.selectIndex = idx;
    if (idx >= 0) {
      const s = this.stations[idx];
      this.haloMesh.position.set(s.worldX, z.serviceArea, s.worldZ);
      this.haloMesh.visible = true;
      this.haloMat.color.setHex(s.color);
      this.haloMat.opacity = 0.7;
    }
  }

  setHover(entityId: string | null) {
    this.hoverIndex = entityId
      ? this.stations.findIndex((s) => `subway:${s.name}` === entityId)
      : -1;
  }

  /** Animation: gentle station halo pulse + line resolution sync. */
  update(frame: { time: number; engine?: { renderer: THREE.WebGLRenderer } }) {
    // Keep Line2 resolution in sync with the canvas (resize-safe)
    const renderer = frame.engine?.renderer;
    if (renderer) {
      const size = renderer.getSize(new THREE.Vector2());
      const dpr = renderer.getPixelRatio();
      for (const m of this.lineMaterials) {
        m.resolution.set(size.x * dpr, size.y * dpr);
      }
    }
    const pulse = 0.85 + 0.15 * Math.sin(frame.time * 1.2);
    for (let i = 0; i < this.stations.length; i++) {
      const s = this.stations[i];
      const isHot = i === this.hoverIndex || i === this.selectIndex;
      const k = isHot ? 1.5 : 1.0;
      const haloScale = 360 * k * pulse;
      s.haloSprite.scale.set(haloScale, haloScale, 1);
      (s.haloSprite.material as THREE.SpriteMaterial).opacity = (isHot ? 0.9 : 0.5) * pulse;
    }
  }

  pick(raycaster: THREE.Raycaster): MapEntity | null {
    // Sprites are billboarded so raycaster.intersectObjects works fine
    const hits = raycaster.intersectObjects(
      this.stations.flatMap((s) => [s.dotSprite, s.haloSprite]),
      false,
    );
    if (!hits.length) return null;
    const sprite = hits[0].object as THREE.Sprite;
    const s = this.stations.find((x) => x.dotSprite === sprite || x.haloSprite === sprite);
    if (!s) return null;
    return {
      id: `subway:${s.name}`,
      kind: "subwayStation",
      title: s.name,
      subtitle: "地铁站",
      lngLat: { lng: s.lng, lat: s.lat },
      radius: 800,
      source: this.id,
      data: { name: s.name, lng: s.lng, lat: s.lat },
    };
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.lineMaterials.forEach((m) => m.dispose());
    this.haloMatPool.forEach((m) => m.dispose());
    this.dotMatPool.forEach((m) => m.dispose());
    this.haloMat.dispose();
  }
}

function parseHexColor(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const v = hex.replace(/^#/, "");
  if (v.length === 3) {
    const r = parseInt(v[0] + v[0], 16);
    const g = parseInt(v[1] + v[1], 16);
    const b = parseInt(v[2] + v[2], 16);
    return (r << 16) | (g << 8) | b;
  }
  if (v.length === 6) return parseInt(v, 16);
  return fallback;
}
