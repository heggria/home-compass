/**
 * RoadsLayer — multi-class road network rendered with class-aware width and
 * color. We use Line2/LineSegments2 for true world-space line widths so the
 * network reads at every zoom; class controls width + color so motorways
 * dominate visually and local lanes recede.
 */

import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

import type { LayerSetupContext, MapLayer } from "../core/types";
import { repo, type RoadsByClass } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

interface RoadStyle {
  /** Optional, may be absent (the current dataset only has name+style). */
  klass?: string;
  /** 中文 name, present in current dataset (e.g. "高速/快速"). */
  name?: string;
  color?: string;
  /** Width in screen pixels (we map this through ROAD_WIDTH_PX). */
  width?: number;
  opacity?: number;
}

/** Visual scale: dataset width (1..3) → screen pixels. */
const ROAD_WIDTH_PX = 1.6;
/** Floor opacity so even local lanes are faintly readable. */
const ROAD_MIN_OPACITY = 0.25;

export class RoadsLayer implements MapLayer {
  readonly id = "roads";
  readonly label = "道路";
  readonly order = 8;
  readonly group = "infrastructure" as const;
  readonly pickable = false;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private lineMaterials: LineMaterial[] = [];

  async setup({ scene, projector }: LayerSetupContext) {
    const [rawRoads, rawStyles] = await Promise.all([
      repo.roads(),
      repo.roadStyles().catch(() => []),
    ]);

    const groups = normalizeRoadGroups(rawRoads, rawStyles as RoadStyle[]);
    const dpr = Math.min(window.devicePixelRatio, 2);
    const resolution = new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr);

    let totalSegments = 0;

    for (const grp of groups) {
      if (!grp.segs.length) continue;
      const positions: number[] = [];
      for (let i = 0; i < grp.segs.length; i += 2) {
        const { x, z: zz } = projector.project({ lng: grp.segs[i], lat: grp.segs[i + 1] });
        positions.push(x, z.roads, zz);
      }
      totalSegments += positions.length / 6;

      const geom = new LineSegmentsGeometry();
      geom.setPositions(positions);

      const mat = new LineMaterial({
        color: parseHexColor(grp.color, sceneColors.road.other),
        // World-space pixels via screen-resolution shader; avoids GL line-width caps
        linewidth: Math.max(0.6, (grp.width ?? 1) * ROAD_WIDTH_PX),
        worldUnits: false,
        transparent: true,
        opacity: Math.max(ROAD_MIN_OPACITY, grp.opacity ?? 0.6),
        // Render on top of districts so the road network always reads. Bloom
        // is gentle enough that the lines don't blow out.
        depthTest: false,
        depthWrite: false,
      });
      mat.resolution.copy(resolution);
      this.lineMaterials.push(mat);
      const seg = new LineSegments2(geom, mat);
      seg.computeLineDistances();
      // High renderOrder so we always paint after the district meshes.
      seg.renderOrder = 25;
      this.group3.add(seg);
    }

    // eslint-disable-next-line no-console
    console.info(`[map] roads: ${groups.length} classes, ${totalSegments} segments`);
    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }
  setOpacity(v: number) {
    for (const m of this.lineMaterials) m.opacity = v * baseOpacity(m);
  }

  /** Resize-safe: keep LineMaterial resolution in sync with the viewport. */
  update(frame: { engine?: { renderer: THREE.WebGLRenderer } }) {
    const renderer = frame.engine?.renderer;
    if (!renderer) return;
    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    for (const m of this.lineMaterials) {
      m.resolution.set(size.x * dpr, size.y * dpr);
    }
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as { geometry?: { dispose?: () => void } };
      m.geometry?.dispose?.();
    });
    this.lineMaterials.forEach((m) => m.dispose());
  }
}

const baseOpacityCache = new WeakMap<LineMaterial, number>();
function baseOpacity(m: LineMaterial) {
  if (!baseOpacityCache.has(m)) baseOpacityCache.set(m, m.opacity);
  return baseOpacityCache.get(m)!;
}

function parseHexColor(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const v = hex.replace(/^#/, "");
  if (v.length === 6) return parseInt(v, 16);
  if (v.length === 3) {
    const r = parseInt(v[0] + v[0], 16);
    const g = parseInt(v[1] + v[1], 16);
    const b = parseInt(v[2] + v[2], 16);
    return (r << 16) | (g << 8) | b;
  }
  return fallback;
}

interface NormalizedGroup {
  klass: string;
  color: string;
  width: number;
  opacity: number;
  segs: number[];
}

/**
 * Normalize the assorted roads payload shapes seen in the wild:
 *
 *   1. Current dataset (NW Beijing snapshot):
 *        - roads.json:        [[lng,lat,...], [lng,lat,...], ...]   (one inner
 *          array per class, in the same order as road_styles.json)
 *        - road_styles.json:  [{name, color, width, opacity}, ...]
 *
 *   2. Future per-class objects:
 *        [{klass, color, width, segs:[lng,lat,...]}, ...]
 *
 *   3. Class-keyed object:
 *        {motorway: [...], trunk: [...]}
 */
function normalizeRoadGroups(raw: unknown, styles: RoadStyle[]): NormalizedGroup[] {
  // Build a lookup by both klass and name for shape #2 friendliness.
  const styleByKlass = new Map<string, RoadStyle>();
  const styleByName = new Map<string, RoadStyle>();
  for (const s of styles) {
    if (s.klass) styleByKlass.set(s.klass, s);
    if (s.name) styleByName.set(s.name, s);
  }
  const styleByIndex = (i: number): RoadStyle | undefined => styles[i];

  // Shape 1 / 2 (top-level array)
  if (Array.isArray(raw)) {
    // Heuristic: if first element is an array of numbers → shape 1.
    // If first element is an object → shape 2.
    const first = raw[0];
    if (Array.isArray(first) && typeof first[0] === "number") {
      // Shape 1 — flat per-class segments
      return (raw as number[][]).map((segs, i) => {
        const style = styleByIndex(i);
        return {
          klass: style?.klass ?? style?.name ?? `class-${i}`,
          color: style?.color ?? `#${(sceneColors.road.other).toString(16).padStart(6, "0")}`,
          width: style?.width ?? Math.max(0.5, 2 - i * 0.3),
          opacity: style?.opacity ?? Math.max(ROAD_MIN_OPACITY, 0.95 - i * 0.12),
          segs,
        };
      });
    }
    // Shape 2 — array of {klass,color,width,segs}
    return (raw as Array<Record<string, unknown>>)
      .filter((g) => Array.isArray(g.segs))
      .map((g, i) => {
        const klass = String(g.klass ?? g.k ?? `class-${i}`);
        const fromStyle = styleByKlass.get(klass) ?? styleByName.get(klass);
        return {
          klass,
          color: String(g.color ?? fromStyle?.color ?? "#ffffff"),
          width: Number(g.width ?? fromStyle?.width ?? 1.5),
          opacity: Number(g.opacity ?? fromStyle?.opacity ?? 0.7),
          segs: g.segs as number[],
        };
      });
  }
  // Shape 3 — class-keyed object
  if (raw && typeof raw === "object") {
    const obj = raw as RoadsByClass;
    return Object.entries(obj).map(([klass, segs]) => {
      const fromStyle = styleByKlass.get(klass);
      return {
        klass,
        color: fromStyle?.color ?? `#${((sceneColors.road as Record<string, number>)[klass] ?? sceneColors.road.other).toString(16).padStart(6, "0")}`,
        width: fromStyle?.width ?? 1.4,
        opacity: fromStyle?.opacity ?? 0.65,
        segs,
      };
    });
  }
  return [];
}
