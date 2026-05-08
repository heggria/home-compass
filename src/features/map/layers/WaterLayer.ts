/**
 * WaterLayer — rivers (lines) + lakes/ponds (polygons).
 *
 * Static, non-pickable, but reacts to opacity from the layer switcher.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapLayer } from "../core/types";
import { repo } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

export class WaterLayer implements MapLayer {
  readonly id = "water";
  readonly label = "水系";
  readonly order = 5;
  readonly group = "infrastructure" as const;
  readonly pickable = false;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private materials: THREE.Material[] = [];

  async setup({ scene, projector }: LayerSetupContext) {
    const [polysRaw, linesRaw] = await Promise.all([
      repo.waterPolys(),
      repo.waterLines(),
    ]);

    const fillMat = new THREE.MeshBasicMaterial({
      color: sceneColors.water,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const edgeMat = new THREE.LineBasicMaterial({
      color: sceneColors.waterEdge,
      transparent: true,
      opacity: 0.5,
    });
    this.materials.push(fillMat, edgeMat);

    // ----- polygons (lakes/ponds) -----
    for (const item of polysRaw as Array<unknown>) {
      const coords = extractWaterPolyCoords(item);
      if (!coords || coords.length === 0) continue;
      try {
        const shape = new THREE.Shape();
        coords[0].forEach(([lng, lat], i) => {
          const { x, z } = projector.project({ lng, lat });
          if (i === 0) shape.moveTo(x, -z);
          else shape.lineTo(x, -z);
        });
        for (let h = 1; h < coords.length; h++) {
          const hole = new THREE.Path();
          coords[h].forEach(([lng, lat], i) => {
            const { x, z } = projector.project({ lng, lat });
            if (i === 0) hole.moveTo(x, -z);
            else hole.lineTo(x, -z);
          });
          shape.holes.push(hole);
        }
        const g = new THREE.ShapeGeometry(shape);
        g.rotateX(-Math.PI / 2);
        g.translate(0, z.water, 0);
        this.group3.add(new THREE.Mesh(g, fillMat));
      } catch {
        // ignore degenerate
      }
    }

    // ----- linear rivers -----
    const flatLines: number[] = [];
    for (const item of linesRaw as Array<unknown>) {
      const pts = extractWaterLinePts(item);
      if (!pts || pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = projector.project({ lng: pts[i][0], lat: pts[i][1] });
        const b = projector.project({ lng: pts[i + 1][0], lat: pts[i + 1][1] });
        flatLines.push(a.x, z.water + 0.01, a.z, b.x, z.water + 0.01, b.z);
      }
    }
    if (flatLines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(flatLines, 3));
      this.group3.add(new THREE.LineSegments(g, edgeMat));
    }

    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }

  setOpacity(v: number) {
    for (const m of this.materials) (m as THREE.Material).opacity = v;
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
  }
}

// Older snapshots came in slightly different shapes; tolerate them.
function extractWaterPolyCoords(item: unknown): number[][][] | null {
  if (Array.isArray(item)) return item as number[][][]; // already coords
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    if (Array.isArray(obj.coords)) return obj.coords as number[][][];
    if (obj.geometry && typeof obj.geometry === "object") {
      const geom = obj.geometry as { coordinates?: unknown };
      if (Array.isArray(geom.coordinates)) return geom.coordinates as number[][][];
    }
  }
  return null;
}

function extractWaterLinePts(item: unknown): number[][] | null {
  if (Array.isArray(item)) {
    // either [[lng,lat],...] or flat [lng,lat,lng,lat]
    if (typeof item[0] === "number") {
      const out: number[][] = [];
      for (let i = 0; i < item.length; i += 2) out.push([item[i] as number, item[i + 1] as number]);
      return out;
    }
    return item as number[][];
  }
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    if (Array.isArray(obj.coords)) return obj.coords as number[][];
  }
  return null;
}
