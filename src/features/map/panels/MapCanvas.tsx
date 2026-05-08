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
    const engine = new MapEngine(ref.current, { enableBloom: true });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
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
