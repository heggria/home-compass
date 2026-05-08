/**
 * LandmarksLayer — labelled text sprites for subway stations.
 *
 * Without place names the map is just colored boxes; with them, "this is
 * where I live" becomes possible at a glance. We use the subway_station
 * POI list (deduplicated) because those are the most universally
 * recognised anchors in NW Beijing.
 *
 * Implementation: one canvas-textured Sprite per station, billboarded,
 * scaled in world units so labels grow legibly when the camera is close
 * and recede gracefully when zoomed out.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapLayer } from "../core/types";
import { repo, type PoiCategoryMap } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

interface LabelRecord {
  name: string;
  worldX: number;
  worldZ: number;
  sprite: THREE.Sprite;
  pin: THREE.Line;
}

let LABEL_CACHE = new Map<string, THREE.CanvasTexture>();

function makeLabelTexture(text: string, color: string, accent: string): THREE.CanvasTexture {
  const cached = LABEL_CACHE.get(text);
  if (cached) return cached;
  const W = 512;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // Measure text first so the pill hugs the glyphs (variable-width Chinese
  // station names look terrible inside a fixed full-width pill).
  const FONT = `600 56px "Inter Variable", "Inter", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(text);
  const padX = 26;
  const padY = 14;
  const textW = Math.min(W - 8, Math.ceil(metrics.width));
  const pillW = Math.min(W - 8, textW + padX * 2);
  const pillH = 78;
  const pillX = (W - pillW) / 2;
  const pillY = (H - pillH) / 2;
  const radius = pillH / 2;

  // 1) Pill background — semi-opaque deep violet so labels read against
  //    bright POI halos behind them. Drawn _before_ the glyphs so glow can
  //    spill over the rounded edges.
  ctx.beginPath();
  ctx.moveTo(pillX + radius, pillY);
  ctx.lineTo(pillX + pillW - radius, pillY);
  ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + radius);
  ctx.lineTo(pillX + pillW, pillY + pillH - radius);
  ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - radius, pillY + pillH);
  ctx.lineTo(pillX + radius, pillY + pillH);
  ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - radius);
  ctx.lineTo(pillX, pillY + radius);
  ctx.quadraticCurveTo(pillX, pillY, pillX + radius, pillY);
  ctx.closePath();
  ctx.fillStyle = "rgba(8,9,18,0.78)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(168,114,255,0.55)";
  ctx.stroke();

  // 2) Outline stroke around glyphs — keeps text crisp on top of the pill
  //    even when bloom kicks in.
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.95)";
  ctx.strokeText(text, W / 2, H / 2 + 2);

  // 3) Soft accent glow + glyph fill
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, H / 2 + 2);
  // crisper core
  ctx.shadowBlur = 0;
  ctx.fillText(text, W / 2, H / 2 + 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  LABEL_CACHE.set(text, tex);
  return tex;
}

export class LandmarksLayer implements MapLayer {
  readonly id = "landmarks";
  readonly label = "地名标注";
  readonly order = 50;
  readonly group = "label" as const;
  readonly pickable = false;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private labels: LabelRecord[] = [];
  private materials: THREE.SpriteMaterial[] = [];
  private pinMats: THREE.LineBasicMaterial[] = [];

  async setup({ scene, projector }: LayerSetupContext) {
    const poi = await repo.poi();
    const stations = (poi as PoiCategoryMap).subway_station?.items ?? [];

    // Deduplicate by name; some stations have two records (lines crossing).
    const seen = new Map<string, { lng: number; lat: number }>();
    for (const s of stations) {
      if (!seen.has(s.name)) seen.set(s.name, { lng: s.lon, lat: s.lat });
    }

    for (const [name, ll] of seen) {
      const w = projector.project(ll);
      const tex = makeLabelTexture(
        name,
        "#eef0ff",
        `#${sceneColors.landmark.toString(16).padStart(6, "0")}`,
      );
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.95,
        sizeAttenuation: true,
      });
      this.materials.push(mat);
      const sprite = new THREE.Sprite(mat);
      // World-meters scale; tex aspect = 4:1
      const baseW = 1100;
      sprite.scale.set(baseW, baseW / 4, 1);
      const labelY = 600; // floats above the highest expected building cluster
      sprite.position.set(w.x, labelY, w.z);
      sprite.renderOrder = 90;
      this.group3.add(sprite);

      // Pin line: subtle vertical "this is on the ground" cue
      const pinMat = new THREE.LineBasicMaterial({
        color: sceneColors.landmark,
        transparent: true,
        opacity: 0.35,
      });
      this.pinMats.push(pinMat);
      const pinGeom = new THREE.BufferGeometry();
      pinGeom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [w.x, z.subway + 200, w.z, w.x, labelY - 60, w.z],
          3,
        ),
      );
      const pin = new THREE.Line(pinGeom, pinMat);
      pin.renderOrder = 89;
      this.group3.add(pin);

      this.labels.push({ name, worldX: w.x, worldZ: w.z, sprite, pin });
    }

    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }
  setOpacity(v: number) {
    for (const m of this.materials) m.opacity = v * 0.95;
    for (const m of this.pinMats) m.opacity = v * 0.35;
  }

  /**
   * Hide labels that are too far from the camera so we don't paint a wall
   * of overlapping text when zoomed all the way out.
   */
  update(frame: { camera: THREE.Camera }) {
    const cam = frame.camera as THREE.PerspectiveCamera;
    const camPos = cam.position;
    // Scale label visibility from the camera *altitude* — at high altitude
    // we hide the distant ones, at low altitude we let nearby ones grow.
    const altitude = camPos.y;
    const fadeStart = 7000;
    const fadeEnd = 12000;
    for (const l of this.labels) {
      const dx = l.worldX - camPos.x;
      const dz = l.worldZ - camPos.z;
      const planar = Math.sqrt(dx * dx + dz * dz);
      const t = (planar - fadeStart) / (fadeEnd - fadeStart);
      const op = 0.95 * (1 - clamp01(t));
      (l.sprite.material as THREE.SpriteMaterial).opacity = op;
      (l.pin.material as THREE.LineBasicMaterial).opacity = op * 0.4;
      // Slight upward float when very close; helps depth perception
      const closeBoost = clamp01((6000 - altitude) / 4000) * 80;
      l.sprite.position.y = 600 + closeBoost;
    }
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.materials.forEach((m) => m.dispose());
    this.pinMats.forEach((m) => m.dispose());
    LABEL_CACHE.forEach((t) => t.dispose());
    LABEL_CACHE = new Map();
  }
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
