"use client";

import { tone } from "../tokens/design";

export function Legend() {
  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-4 select-none rounded-2xl border p-3 backdrop-blur-md"
      style={{
        background: "rgba(13,16,22,0.78)",
        borderColor: tone.border,
      }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">图例</p>
      <div className="space-y-2">
        <ColorRow label="均价 低 → 高">
          <Ramp />
        </ColorRow>
        <Marker color={tone.cool} label="地铁站" />
        <Marker color={tone.bad} label="医院" />
        <Marker color={tone.brand} label="学校 / 高校" />
        <Marker color={tone.accent} label="商场 / 超市" />
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
  return (
    <div
      style={{
        width: 192,
        height: 6,
        borderRadius: 3,
        background:
          "linear-gradient(90deg, #2A6FD0 0%, #4DB2E0 25%, #6BD78C 50%, #FFB547 75%, #FF4D6D 100%)",
      }}
    />
  );
}

function Marker({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label}
    </div>
  );
}
