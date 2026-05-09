"use client";

import { useEffect, useRef } from "react";
import { MapEngine } from "../core/MapEngine";
import { registerDefaultLayers } from "../layers";

interface MapCanvasProps {
  className?: string;
}

export function MapCanvas({ className }: MapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MapEngine | null>(null);

  useEffect(() => {
    registerDefaultLayers();
    if (!ref.current) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    // Recenter the camera on the actual data envelope so the initial
    // view always frames everything we have, regardless of dataset size.
    fetch("/map-data/stats.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((stats: null | {
        lon_min: number; lon_max: number; lat_min: number; lat_max: number;
        lon_center: number; lat_center: number;
      }) => {
        if (cancelled || !ref.current) return;
        const center = stats
          ? { lng: stats.lon_center, lat: stats.lat_center }
          : undefined;
        // Span (km) → camera distance: ~1.6× the bigger half-side keeps
        // the whole envelope on screen with comfortable margin.
        const halfMaxKm = stats
          ? Math.max(
              ((stats.lon_max - stats.lon_min) / 2) * 111 *
                Math.cos(((stats.lat_min + stats.lat_max) / 2 * Math.PI) / 180),
              ((stats.lat_max - stats.lat_min) / 2) * 111,
            )
          : undefined;
        const engine = new MapEngine(ref.current, {
          enableBloom: true,
          center,
          framingHalfSpanMeters: halfMaxKm ? halfMaxKm * 1000 : undefined,
        });
        engineRef.current = engine;
        cleanup = () => {
          engine.dispose();
          engineRef.current = null;
        };
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        cursor: "grab",
      }}
    />
  );
}
