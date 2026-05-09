"use client";

import dynamic from "next/dynamic";
import { ControlHint } from "./ControlHint";
import { CoverageBadge } from "./CoverageBadge";
import { Inspector } from "./Inspector";
import { LayerSwitcher } from "./LayerSwitcher";
import { Legend } from "./Legend";
import { ModeBar } from "./ModeBar";

// Canvas needs window/THREE; keep it client-only and skip SSR.
const MapCanvas = dynamic(
  () => import("./MapCanvas").then((m) => m.MapCanvas),
  { ssr: false },
);

export function MapView() {
  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: "#08090d", color: "#e8eaf2" }}
    >
      <MapCanvas />
      <ModeBar />
      <LayerSwitcher />
      <Legend />
      <Inspector />
      <ControlHint />
      <CoverageBadge />
      <a
        href="/"
        className="pointer-events-auto absolute bottom-4 right-4 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300 backdrop-blur-md"
        style={{ background: "rgba(13,16,22,0.7)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        ← Home Compass
      </a>
    </div>
  );
}
