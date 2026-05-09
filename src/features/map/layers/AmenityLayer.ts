/**
 * AmenityLayer — generic POI layer for schools, hospitals, malls, parks…
 *
 * Each POI renders as a billboarded soft-glowing disc (Sprite + radial-
 * gradient canvas texture, additive blend) so the markers feel like neon
 * lights and bloom kicks in for free. We render with depthTest off so they
 * always shine through the district extrusions — the user sees what's
 * around them at a glance.
 *
 * One layer module supports multiple categories so we don't end up with 6
 * near-identical files.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapEntity, MapLayer } from "../core/types";
import { repo, type PoiItem } from "../data/repo";
import { z } from "../tokens/design";

export interface AmenityCategoryConfig {
  /** key in poi_cats.json */
  key: string;
  /** Inspector subtitle */
  label: string;
  /** entity kind for the inspector */
  kind: "school" | "hospital" | "mall" | "park" | "custom";
  /** fallback color if file does not provide one */
  fallbackColor: number;
  /** picking threshold in pixels */
  pickThreshold?: number;
  /** marker radius in world meters (sprite scale; tuned with bloom in mind) */
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
  haloSprite: THREE.Sprite;
  dotSprite: THREE.Sprite;
}

/** Lazily-built shared "soft glowing disc" texture (one per process). */
let GLOW_TEX: THREE.CanvasTexture | null = null;
function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  // Soft outer fall-off only; inner highlight is handled by the second
  // sprite layer so we can tune density independently.
  grad.addColorStop(0.00, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.22)");
  grad.addColorStop(0.75, "rgba(255,255,255,0.04)");
  grad.addColorStop(1.00, "rgba(255,255,255,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, N, N);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

/** A small, hard-edged dot with a tiny ring — locates the POI precisely. */
let DOT_TEX: THREE.CanvasTexture | null = null;
function dotTexture() {
  if (DOT_TEX) return DOT_TEX;
  const N = 64;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  // Hot core
  const grad = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0.0, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.45, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.45)");
  grad.addColorStop(0.85, "rgba(255,255,255,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, N, N);
  DOT_TEX = new THREE.CanvasTexture(c);
  DOT_TEX.colorSpace = THREE.SRGBColorSpace;
  return DOT_TEX;
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
  private records: PointRecord[] = [];
  private haloMatPool: THREE.SpriteMaterial[] = [];
  private dotMatPool: THREE.SpriteMaterial[] = [];
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
    const haloTex = glowTexture();
    const dotTex = dotTexture();

    for (const cat of this.categories) {
      const data = poi[cat.key];
      if (!data || !data.items?.length) continue;
      const colorHex = parseHex(data.color, cat.fallbackColor);
      const baseHaloSize = cat.size ?? 320; // world meters (outer halo)
      const baseDotSize = baseHaloSize * 0.18; // inner core ~18% of halo

      // Shared per-category SpriteMaterials → one draw-state change per cat.
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        color: colorHex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.45,
        sizeAttenuation: true,
      });
      const dotMat = new THREE.SpriteMaterial({
        map: dotTex,
        color: colorHex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.95,
        sizeAttenuation: true,
      });
      this.haloMatPool.push(haloMat);
      this.dotMatPool.push(dotMat);

      for (const it of data.items) {
        const w = projector.project({ lng: it.lon, lat: it.lat });
        const yBase = z.poi + categoryAltitude(cat.key);
        const halo = new THREE.Sprite(haloMat);
        halo.position.set(w.x, yBase, w.z);
        halo.scale.set(baseHaloSize, baseHaloSize, 1);
        halo.renderOrder = 28 + categoryOrder(cat.key);
        const dot = new THREE.Sprite(dotMat);
        dot.position.set(w.x, yBase + 1, w.z);
        dot.scale.set(baseDotSize, baseDotSize, 1);
        dot.renderOrder = 30 + categoryOrder(cat.key);
        dot.userData.amenityCat = cat.key;
        this.group3.add(halo, dot);
        this.records.push({
          category: cat.key,
          config: cat,
          item: it,
          worldX: w.x,
          worldZ: w.z,
          haloSprite: halo,
          dotSprite: dot,
        });
      }
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
    for (const m of this.haloMatPool) m.opacity = v * 0.45;
    for (const m of this.dotMatPool) m.opacity = v * 0.95;
  }

  setHover(_id: string | null) {
    /* hover is currently visualised by Inspector only */
  }
  setSelection(id: string | null) {
    if (!id) {
      this.haloMesh.visible = false;
      return;
    }
    const r = this.records.find((rec) => makeId(this.id, rec) === id);
    if (r) {
      this.haloMesh.position.set(r.worldX, z.serviceArea, r.worldZ);
      const radius = r.config.serviceRadiusM ?? 800;
      const scale = radius / 800;
      this.haloMesh.scale.set(scale, 1, scale);
      this.haloMat.color.setHex(r.config.fallbackColor);
      this.haloMat.opacity = 0.55;
      this.haloMesh.visible = true;
      return;
    }
    this.haloMesh.visible = false;
  }

  pick(raycaster: THREE.Raycaster): MapEntity | null {
    // Pick against the precise dot sprites only (halos are decorative
    // and would create giant pickable circles that swallow other layers).
    const hits = raycaster.intersectObjects(
      this.records.map((r) => r.dotSprite),
      false,
    );
    if (!hits.length) return null;
    const sprite = hits[0].object as THREE.Sprite;
    const r = this.records.find((rec) => rec.dotSprite === sprite);
    if (!r) return null;
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

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.haloMatPool.forEach((m) => m.dispose());
    this.dotMatPool.forEach((m) => m.dispose());
    this.haloMat.dispose();
  }
}

/**
 * Per-category altitude — small offsets so overlapping POIs of different
 * kinds stack visibly (medical above schools above commerce). Bloom +
 * additive blend means there's no z-fighting; this is purely about
 * "which color wins where they overlap".
 */
function categoryAltitude(cat: string): number {
  switch (cat) {
    case "hospital": return 220;
    case "university": return 200;
    case "mall": return 180;
    case "school": return 160;
    case "supermarket": return 140;
    case "kindergarten": return 120;
    default: return 100;
  }
}
function categoryOrder(cat: string): number {
  switch (cat) {
    case "hospital": return 6;
    case "university": return 5;
    case "mall": return 4;
    case "school": return 3;
    case "supermarket": return 2;
    case "kindergarten": return 1;
    default: return 0;
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
