/**
 * RoadsLayer — multi-class road network rendered with class-aware width and
 * color. Uses thin meshes (LineSegments) for performance; a future PR can
 * upgrade to Line2/MeshLine for true world-space width.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapLayer } from "../core/types";
import { repo, type RoadsByClass } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

interface RoadStyle {
  klass: string;
  color: string;
  width: number;
}

export class RoadsLayer implements MapLayer {
  readonly id = "roads";
  readonly label = "道路";
  readonly order = 8;
  readonly group = "infrastructure" as const;
  readonly pickable = false;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private materials: THREE.LineBasicMaterial[] = [];

  async setup({ scene, projector }: LayerSetupContext) {
    const [rawRoads, rawStyles] = await Promise.all([repo.roads(), repo.roadStyles().catch(() => [])]);

    // Older format: ROADS = [{klass, color, width, segs:[lng,lat,lng,lat,...]}]
    // Newer alt: { motorway: [...], trunk: [...] }. Normalize:
    const groups = normalizeRoadGroups(rawRoads, rawStyles as RoadStyle[]);

    for (const grp of groups) {
      const positions = new Float32Array((grp.segs.length / 2) * 3);
      for (let i = 0, j = 0; i < grp.segs.length; i += 2, j += 3) {
        const { x, z: zz } = projector.project({ lng: grp.segs[i], lat: grp.segs[i + 1] });
        positions[j] = x;
        positions[j + 1] = z.roads;
        positions[j + 2] = zz;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const colorHex = grp.color || styleColor(grp.klass);
      const m = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacityFor(grp.klass),
      });
      this.materials.push(m);
      const lines = new THREE.LineSegments(g, m);
      lines.renderOrder = 5;
      this.group3.add(lines);
    }

    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }
  setOpacity(v: number) {
    for (const m of this.materials) m.opacity = v * baseOpacity(m);
  }
  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.LineSegments;
      m.geometry?.dispose();
    });
    this.materials.forEach((m) => m.dispose());
  }
}

// Map class → opacity tweak so primaries pop and locals fade.
function opacityFor(klass: string) {
  switch (klass) {
    case "motorway":
    case "trunk": return 0.95;
    case "primary": return 0.85;
    case "secondary": return 0.65;
    case "tertiary": return 0.45;
    default: return 0.3;
  }
}
const baseOpacityCache = new WeakMap<THREE.Material, number>();
function baseOpacity(m: THREE.Material) {
  if (!baseOpacityCache.has(m)) baseOpacityCache.set(m, m.opacity);
  return baseOpacityCache.get(m)!;
}

function styleColor(klass: string) {
  return sceneColors.road[klass] ?? sceneColors.road.other;
}

interface NormalizedGroup {
  klass: string;
  color: string;
  segs: number[];
}

function normalizeRoadGroups(raw: unknown, styles: RoadStyle[]): NormalizedGroup[] {
  const styleByClass = new Map<string, RoadStyle>();
  for (const s of styles) styleByClass.set(s.klass, s);

  if (Array.isArray(raw)) {
    return (raw as Array<Record<string, unknown>>)
      .filter((g) => Array.isArray(g.segs))
      .map((g) => ({
        klass: String(g.klass ?? g.k ?? "other"),
        color: String(g.color ?? styleByClass.get(String(g.klass ?? "")) ?? "#ffffff"),
        segs: g.segs as number[],
      }));
  }
  if (raw && typeof raw === "object") {
    const obj = raw as RoadsByClass;
    return Object.entries(obj).map(([klass, segs]) => ({
      klass,
      color: styleByClass.get(klass)?.color ?? `#${styleColor(klass).toString(16).padStart(6, "0")}`,
      segs,
    }));
  }
  return [];
}
