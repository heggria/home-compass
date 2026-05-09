"use client";

import { sceneColors, tone } from "../tokens/design";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function Legend() {
  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-4 select-none rounded-2xl border p-3 backdrop-blur-md"
      style={{
        background: "rgba(10,12,22,0.78)",
        borderColor: tone.border,
        boxShadow: "0 12px 32px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(168,114,255,0.05)",
      }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">图例</p>
      <div className="space-y-2">
        <ColorRow label="买房友好分 / 均价  低 → 高">
          <Ramp />
        </ColorRow>
        <Marker color={hex(sceneColors.subwayDefault)} label="地铁站" />
        <Marker color={hex(sceneColors.hospital)} label="医院" />
        <Marker color={hex(sceneColors.school)} label="学校" />
        <Marker color={hex(sceneColors.university)} label="高校" />
        <Marker color={hex(sceneColors.mall)} label="商场 / 超市" />
      </div>
    </div>
  );
}

function ColorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function Ramp() {
  // Mirror sceneColors.district.rampStops so HUD == reality.
  // Stops: 0 dark teal · 0.18 teal · 0.36 mint · 0.54 periwinkle ·
  //        0.72 brand violet · 0.86 hot pink · 1 alarm red.
  const stops = sceneColors.district.rampStops as readonly (readonly [number, number])[];
  const css = stops
    .map(([t, c]) => `#${c.toString(16).padStart(6, "0")} ${(t * 100).toFixed(0)}%`)
    .join(", ");
  return (
    <div
      style={{
        width: 200,
        height: 6,
        borderRadius: 3,
        background: `linear-gradient(90deg, ${css})`,
        boxShadow: "0 0 8px rgba(168,114,255,0.4)",
      }}
    />
  );
}

function Marker({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}` }}
      />
      {label}
    </div>
  );
}
