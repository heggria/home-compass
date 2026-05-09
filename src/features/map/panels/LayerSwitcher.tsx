"use client";

import { useEffect, useState } from "react";
import { useMapStore } from "../store/mapStore";
import { listLayerRegistrations } from "../core/registry";
import { tone } from "../tokens/design";

interface LayerEntry {
  id: string;
  label: string;
  order: number;
  group: string;
}

export function LayerSwitcher() {
  const layers = useMapStore((s) => s.layers);
  const setVisible = useMapStore((s) => s.setLayerVisibility);
  const setOpacity = useMapStore((s) => s.setLayerOpacity);

  // Layers register at engine boot (after first paint), so we can't useMemo
  // synchronously — we must wait until the store reports them.
  const [entries, setEntries] = useState<LayerEntry[]>([]);
  useEffect(() => {
    function refresh() {
      const regs = listLayerRegistrations()
        .filter((r) => r.switchable)
        .map((r) => {
          const sample = r.factory();
          return { id: r.id, label: sample.label, order: sample.order, group: sample.group };
        })
        .sort((a, b) => a.order - b.order);
      setEntries(regs);
    }
    refresh();
    const t = setInterval(refresh, 400);
    return () => clearInterval(t);
  }, []);

  if (!entries.length) return null;

  return (
    <aside
      className="pointer-events-auto absolute left-4 top-4 w-[244px] select-none rounded-2xl border p-3 backdrop-blur-md"
      style={{
        background: "rgba(13,16,22,0.78)",
        borderColor: tone.border,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-300">
          图层
        </h3>
        <span className="text-[10px] text-zinc-500">{entries.length} layers</span>
      </header>
      <ul className="space-y-1">
        {entries.map((l) => {
          const state = layers[l.id];
          const visible = state?.visible ?? false;
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setVisible(l.id, !visible)}
                className="group flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-200 transition hover:bg-white/5"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: visible ? "var(--brand)" : "rgba(255,255,255,0.18)",
                      boxShadow: visible ? "0 0 8px var(--brand)" : "none",
                    }}
                  />
                  {l.label}
                </span>
                <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300">
                  {visible ? "ON" : "OFF"}
                </span>
              </button>
              {visible && (
                <div className="ml-4 mr-1 mt-1">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={state?.opacity ?? 1}
                    onChange={(e) => setOpacity(l.id, Number(e.target.value))}
                    className="hc-range w-full"
                    aria-label={`${l.label} opacity`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <style>{`
        :root { --brand: ${tone.brand}; }
        .hc-range { accent-color: ${tone.brand}; height: 2px; }
      `}</style>
    </aside>
  );
}
