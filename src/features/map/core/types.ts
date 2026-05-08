/**
 * Home Compass · Map module — core protocol types.
 *
 * The whole map is built on three small, orthogonal protocols:
 *
 *   1. `MapLayer`        — a renderable layer (subway, districts, schools…).
 *                          Every layer is a self-contained module that owns its
 *                          three.js objects, materials and pickable handles.
 *
 *   2. `MapEntity`       — anything that can be selected (a 小区, a 地铁站…).
 *                          Layers emit entities; the Inspector renders them.
 *
 *   3. `MapTool`         — an opt-in piece of UX state (isochrone picker,
 *                          policy timeline, …) that hooks into the engine.
 *
 * Adding a new layer/entity/tool means writing exactly one file and
 * registering it in the corresponding registry. Nothing else changes.
 */

import type * as THREE from "three";
import type { MapEngine } from "./MapEngine";

// ---------- Geometry & projection ----------

export interface LngLat {
  lng: number;
  lat: number;
}

/** World-space position in three.js coordinates (X east, Z south, Y up). */
export interface WorldXY {
  x: number;
  z: number;
}

export interface Projector {
  /** lng/lat → world XZ in meters (origin at viewport center). */
  project(lngLat: LngLat): WorldXY;
  /** World XZ → lng/lat (used for picking on terrain). */
  unproject(xz: WorldXY): LngLat;
  /** Approximate elevation in meters at a lng/lat (terrain sampler). */
  elevationAt(lngLat: LngLat): number;
}

// ---------- Layers ----------

export type LayerId = string;

/**
 * Per-frame context passed to layer.update — keeps update() pure and testable.
 */
export interface FrameContext {
  /** seconds since engine start */
  time: number;
  /** seconds since previous frame */
  dt: number;
  /** current camera */
  camera: THREE.PerspectiveCamera;
  /** zoom proxy: log2(camera.distanceToOrigin) — used for LOD */
  zoom: number;
  /** the engine for layers that need cross-layer ops (use sparingly) */
  engine: MapEngine;
}

export interface LayerSetupContext {
  scene: THREE.Scene;
  projector: Projector;
  engine: MapEngine;
}

/**
 * A renderable, selectable layer.
 *
 * Lifecycle:
 *
 *   ctor → setup(ctx)  // build geometry/materials, attach to scene
 *           ↓
 *   update(frame) every RAF  // animate, LOD, hover halo updates
 *           ↓
 *   pick(raycaster) on hover/click  // returns hit entity (if any)
 *           ↓
 *   setVisibility / setOpacity / setHighlight  // driven by store
 *           ↓
 *   dispose()  // free GPU resources
 */
export interface MapLayer {
  /** stable id, also used as the toggle key in the store */
  readonly id: LayerId;
  /** human-friendly name shown in the layer switcher */
  readonly label: string;
  /** display order (low = back, high = front) */
  readonly order: number;
  /** which UI group it belongs to */
  readonly group: LayerGroup;
  /** does this layer have selectable entities? */
  readonly pickable: boolean;
  /** initial visibility */
  readonly defaultVisible: boolean;

  /** Build/attach scene objects. Called once per engine instance. */
  setup(ctx: LayerSetupContext): Promise<void> | void;

  /** Frame update. Most layers can no-op. */
  update?(frame: FrameContext): void;

  /** Picking. Return null if nothing was hit. */
  pick?(raycaster: THREE.Raycaster): MapEntity | null;

  /** Visibility / opacity / highlight signals from store. */
  setVisibility?(v: boolean): void;
  setOpacity?(v: number): void;
  setHover?(entityId: EntityId | null): void;
  setSelection?(entityId: EntityId | null): void;

  /** Free all GPU resources. */
  dispose(): void;
}

export type LayerGroup =
  | "base"          // basemap, terrain
  | "infrastructure" // roads, rail, subway, water
  | "supply"        // 小区
  | "amenity"       // schools, hospitals, parks, mall
  | "policy"        // policy projects
  | "label"         // text labels / landmarks (always-on-top, no picking)
  | "tool";         // ephemeral overlays (isochrones, search results)

// ---------- Entities ----------

export type EntityKind =
  | "district"      // 小区
  | "subwayStation"
  | "subwayLine"
  | "school"
  | "hospital"
  | "mall"
  | "park"
  | "policyProject"
  | "isochrone"
  | "custom";

export type EntityId = string;

/**
 * Anything pickable. The Inspector dispatches by `kind`, so each kind has its
 * own renderer that knows how to display the `data` payload.
 */
export interface MapEntity<T = unknown> {
  id: EntityId;
  kind: EntityKind;
  /** Human-friendly title for HUD/breadcrumb. */
  title: string;
  /** Optional subtitle (district / line / category …). */
  subtitle?: string;
  /** Geographic anchor for camera fly-to and overlays. */
  lngLat: LngLat;
  /** Approximate ground footprint radius in meters; used for halo sizing. */
  radius?: number;
  /** Layer id that produced this entity. */
  source: LayerId;
  /** The full payload used by the Inspector. */
  data: T;
}

// ---------- Tools (pluggable interactions) ----------

export interface MapTool {
  readonly id: string;
  readonly label: string;
  /** lucide-react icon name */
  readonly icon?: string;
  /** Mount the tool — usually subscribes to engine events / store. */
  attach(engine: MapEngine): () => void; // returns detach fn
}

// ---------- Camera state ----------

export interface CameraState {
  target: WorldXY;
  /** distance from target along the view vector (meters) */
  distance: number;
  /** azimuth in radians */
  azimuth: number;
  /** elevation in radians (0 = horizon, π/2 = top-down) */
  elevation: number;
}
