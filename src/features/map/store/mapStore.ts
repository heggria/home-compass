/**
 * Map state store (zustand). The store is the single source of truth for:
 *   - layer visibility / opacity
 *   - hover & selection
 *   - active tool
 *   - HUD basemode (price | score | metro | policy)
 *
 * The engine subscribes to this store and pushes signals into the layers.
 * UI panels also subscribe — so panels and layers are decoupled and
 * communicate through the store only.
 */

"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { EntityId, EntityKind, MapEntity } from "../core/types";

export type BaseMode = "price" | "score" | "metro" | "policy";

export interface LayerState {
  visible: boolean;
  opacity: number; // 0..1
}

export interface MapStoreState {
  /** layerId → state */
  layers: Record<string, LayerState>;
  baseMode: BaseMode;

  hover: MapEntity | null;
  selection: MapEntity | null;

  activeTool: string | null;
  /** Drives the policy/transaction time scrubber (0..1). */
  timelineT: number;

  setLayerVisibility: (id: string, v: boolean) => void;
  setLayerOpacity: (id: string, v: number) => void;
  registerLayer: (id: string, init: LayerState) => void;

  setBaseMode: (m: BaseMode) => void;

  setHover: (e: MapEntity | null) => void;
  setSelection: (e: MapEntity | null) => void;

  setActiveTool: (t: string | null) => void;
  setTimelineT: (t: number) => void;
}

export const useMapStore = create<MapStoreState>()(
  subscribeWithSelector((set) => ({
    layers: {},
    baseMode: "score",
    hover: null,
    selection: null,
    activeTool: null,
    timelineT: 1,

    registerLayer: (id, init) =>
      set((s) =>
        s.layers[id] ? s : { layers: { ...s.layers, [id]: init } },
      ),

    setLayerVisibility: (id, v) =>
      set((s) => ({
        layers: { ...s.layers, [id]: { ...s.layers[id], visible: v } },
      })),

    setLayerOpacity: (id, v) =>
      set((s) => ({
        layers: { ...s.layers, [id]: { ...s.layers[id], opacity: v } },
      })),

    setBaseMode: (m) => set({ baseMode: m }),

    setHover: (e) => set({ hover: e }),
    setSelection: (e) => set({ selection: e }),

    setActiveTool: (t) => set({ activeTool: t }),
    setTimelineT: (t) => set({ timelineT: Math.max(0, Math.min(1, t)) }),
  })),
);

/** Convenience hooks. */
export const useLayerState = (id: string): LayerState | undefined =>
  useMapStore((s) => s.layers[id]);

export const useSelection = () => useMapStore((s) => s.selection);
export const useHover = () => useMapStore((s) => s.hover);
export const useBaseMode = () => useMapStore((s) => s.baseMode);

export type { EntityId, EntityKind };
