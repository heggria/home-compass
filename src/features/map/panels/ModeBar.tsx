"use client";

import type { BaseMode } from "../store/mapStore";
import { useBaseMode, useMapStore } from "../store/mapStore";
import { tone } from "../tokens/design";

const MODES: Array<{ id: BaseMode; label: string; hint: string }> = [
  { id: "score", label: "买房友好分", hint: "可负担 + 通勤 + 流动性" },
  { id: "price", label: "均价", hint: "万元/㎡, 冷↔暖" },
  { id: "metro", label: "地铁可达", hint: "距最近地铁站米数反推" },
  { id: "policy", label: "政策红利", hint: "PR3 接入" },
];

export function ModeBar() {
  const mode = useBaseMode();
  const setMode = useMapStore((s) => s.setBaseMode);
  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-4 -translate-x-1/2 select-none rounded-full border px-1 py-1 backdrop-blur-md"
      style={{
        background: "rgba(13,16,22,0.78)",
        borderColor: tone.border,
        boxShadow: "0 10px 24px rgba(0,0,0,0.4)",
      }}
      role="tablist"
      aria-label="底图模式"
    >
      <div className="flex items-center gap-1">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m.id)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition"
              style={{
                background: active ? tone.brand : "transparent",
                color: active ? "white" : tone.ink2,
              }}
              title={m.hint}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
