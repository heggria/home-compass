/**
 * Layer registry — single import-time bootstrap.
 *
 * Adding a new layer to the map: add the import + registerLayer() call here.
 * The MapEngine consumes the registry, so nothing else needs to know about
 * specific layers.
 */

import { registerLayer } from "../core/registry";

import { BaseLayer } from "./BaseLayer";
import { WaterLayer } from "./WaterLayer";
import { RoadsLayer } from "./RoadsLayer";
import { SubwayLayer } from "./SubwayLayer";
import { DistrictsLayer } from "./DistrictsLayer";
import { AmenityLayer } from "./AmenityLayer";
import { LandmarksLayer } from "./LandmarksLayer";
import { sceneColors } from "../tokens/design";

let registered = false;

export function registerDefaultLayers() {
  if (registered) return;
  registered = true;

  registerLayer({ id: "base", switchable: false, factory: () => new BaseLayer() });
  registerLayer({ id: "water", switchable: true, factory: () => new WaterLayer() });
  registerLayer({ id: "roads", switchable: true, factory: () => new RoadsLayer() });
  registerLayer({ id: "subway", switchable: true, factory: () => new SubwayLayer() });
  registerLayer({ id: "districts", switchable: true, factory: () => new DistrictsLayer() });

  registerLayer({
    id: "schools",
    switchable: true,
    factory: () =>
      new AmenityLayer({
        id: "schools",
        label: "学校 / 幼儿园",
        order: 40,
        defaultVisible: true,
        // Sizes are world meters; tuned for halo + inner-dot pair (≈18% inner).
        categories: [
          { key: "school",       label: "学校",   kind: "school", fallbackColor: sceneColors.school,       serviceRadiusM: 800,  size: 200 },
          { key: "kindergarten", label: "幼儿园", kind: "school", fallbackColor: sceneColors.kindergarten, serviceRadiusM: 500,  size: 140 },
          { key: "university",   label: "高校",   kind: "school", fallbackColor: sceneColors.university,   serviceRadiusM: 1200, size: 280 },
        ],
      }),
  });

  registerLayer({
    id: "hospitals",
    switchable: true,
    factory: () =>
      new AmenityLayer({
        id: "hospitals",
        label: "医疗",
        order: 41,
        defaultVisible: true,
        categories: [
          { key: "hospital", label: "医院", kind: "hospital", fallbackColor: sceneColors.hospital, serviceRadiusM: 1500, size: 280 },
        ],
      }),
  });

  registerLayer({
    id: "commerce",
    switchable: true,
    factory: () =>
      new AmenityLayer({
        id: "commerce",
        label: "商业",
        order: 42,
        defaultVisible: false,
        categories: [
          { key: "mall",        label: "商场", kind: "mall", fallbackColor: sceneColors.mall,        serviceRadiusM: 1200, size: 240 },
          { key: "supermarket", label: "超市", kind: "mall", fallbackColor: sceneColors.supermarket, serviceRadiusM: 600,  size: 160 },
        ],
      }),
  });

  registerLayer({ id: "landmarks", switchable: true, factory: () => new LandmarksLayer() });
}
