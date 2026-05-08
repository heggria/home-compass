/**
 * BaseLayer — flat ground plane + reference grid.
 *
 * Built once at engine boot, never picked. Uses scene tokens so the look
 * stays in sync with the rest of the app.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapLayer } from "../core/types";
import { sceneColors, z } from "../tokens/design";

const SIZE = 60_000;

export class BaseLayer implements MapLayer {
  readonly id = "base";
  readonly label = "底图";
  readonly order = 0;
  readonly group = "base" as const;
  readonly pickable = false;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();

  setup({ scene }: LayerSetupContext) {
    // Ground
    const groundMat = new THREE.MeshBasicMaterial({
      color: sceneColors.ground,
      depthWrite: false,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = z.ground;
    ground.renderOrder = -10;
    this.group3.add(ground);

    // Reference grid (very faint, fades into fog)
    const grid = new THREE.GridHelper(SIZE, 60, sceneColors.gridMajor, sceneColors.gridMinor);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.18;
    grid.position.y = z.ground + 0.02;
    grid.renderOrder = -9;
    this.group3.add(grid);

    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
  }
}
