"use client";

import { useEffect, useState } from "react";
import { tone } from "../tokens/design";

interface Stats {
  n_polygons: number;
  n_with_data: number;
  lon_min: number;
  lon_max: number;
  lat_min: number;
  lat_max: number;
}

/**
 * Tiny HUD chip near the bottom-right showing the live data envelope.
 * Renders nothing while stats.json is loading — keeps the empty state
 * unsurprising on first paint.
 */
export function CoverageBadge() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/map-data/stats.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setS(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!s) return null;

  // ~111 km per degree lat, cosine-corrected for Beijing latitude.
  const latC = (s.lat_min + s.lat_max) / 2;
  const widthKm = (s.lon_max - s.lon_min) * 111 * Math.cos((latC * Math.PI) / 180);
  const heightKm = (s.lat_max - s.lat_min) * 111;
  const dealsLive = s.n_with_data > 0;

  return (
    <div
      className="pointer-events-auto absolute bottom-4 right-44 select-none rounded-2xl border px-3 py-2 text-[11px] backdrop-blur-md"
      style={{
        background: "rgba(10,12,22,0.78)",
        borderColor: tone.border,
        color: "#cdd2e0",
        maxWidth: 260,
        lineHeight: 1.45,
      }}
      title="数据覆盖范围"
    >
      <div className="flex items-baseline gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dealsLive ? "#7AC74F" : "#F9C74F" }}
          aria-hidden
        />
        <span className="text-zinc-200">
          数据覆盖 · 六环以内 (~{widthKm.toFixed(0)}×{heightKm.toFixed(0)} km)
        </span>
      </div>
      <div className="mt-1 text-zinc-400">
        {s.n_polygons.toLocaleString("zh-CN")} 个住区板块 ·{" "}
        {dealsLive
          ? `${s.n_with_data} 个有成交数据`
          : "成交均价数据待接入"}
      </div>
    </div>
  );
}
