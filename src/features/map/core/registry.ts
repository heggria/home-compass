/**
 * Registries — single source of truth for layers, entity renderers and tools.
 *
 * Plug-in pattern: any new layer/inspector/tool registers itself once at
 * import time. The engine and panels only depend on these registries, so the
 * core module never grows when we add features.
 */

import type { ComponentType } from "react";
import type { EntityKind, MapEntity, MapLayer, MapTool } from "./types";

// ---------- Layer factories ----------

/** A factory so the engine can create a fresh layer per session. */
export type LayerFactory = () => MapLayer;

interface LayerRegistration {
  id: string;
  factory: LayerFactory;
  /** render in switcher? */
  switchable: boolean;
}

const layerRegistry = new Map<string, LayerRegistration>();

export function registerLayer(reg: LayerRegistration) {
  if (layerRegistry.has(reg.id)) {
    // eslint-disable-next-line no-console
    console.warn(`[map] layer "${reg.id}" already registered, overwriting`);
  }
  layerRegistry.set(reg.id, reg);
}

export function listLayerRegistrations(): LayerRegistration[] {
  return Array.from(layerRegistry.values());
}

// ---------- Entity renderers (Inspector) ----------

export interface EntityRendererProps<T = unknown> {
  entity: MapEntity<T>;
}

const entityRenderers = new Map<EntityKind, ComponentType<EntityRendererProps>>();

export function registerEntityRenderer<T>(
  kind: EntityKind,
  renderer: ComponentType<EntityRendererProps<T>>,
) {
  entityRenderers.set(kind, renderer as ComponentType<EntityRendererProps>);
}

export function getEntityRenderer(kind: EntityKind) {
  return entityRenderers.get(kind);
}

// ---------- Tools ----------

const toolRegistry = new Map<string, MapTool>();

export function registerTool(tool: MapTool) {
  toolRegistry.set(tool.id, tool);
}

export function listTools() {
  return Array.from(toolRegistry.values());
}
