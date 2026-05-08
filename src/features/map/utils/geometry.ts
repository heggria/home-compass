/**
 * Geometry helpers — pure functions shared between layers.
 */

import * as THREE from "three";
import type { Projector, LngLat } from "../core/types";

/** Centroid of a closed polygon ring in lng/lat space. */
export function ringCentroid(ring: number[][]): LngLat {
  let sx = 0, sy = 0, sa = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    sx += (x0 + x1) * f;
    sy += (y0 + y1) * f;
    sa += f;
  }
  if (sa === 0) {
    let ax = 0, ay = 0;
    for (const p of ring) {
      ax += p[0]; ay += p[1];
    }
    return { lng: ax / ring.length, lat: ay / ring.length };
  }
  sa *= 0.5;
  return { lng: sx / (6 * sa), lat: sy / (6 * sa) };
}

/** [lng,lat][] → world Vector3[] at constant Y. */
export function pointsToWorld(
  pts: LngLat[],
  projector: Projector,
  y = 0,
): THREE.Vector3[] {
  return pts.map((p) => {
    const { x, z } = projector.project(p);
    return new THREE.Vector3(x, y, z);
  });
}

/** Build a flat circle ring (XZ plane) for service-area outlines. */
export function circleRingPositions(
  center: { x: number; z: number },
  radiusM: number,
  segments = 96,
  y = 0,
): Float32Array {
  const out = new Float32Array(segments * 2 * 3);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = center.x + Math.cos(a0) * radiusM;
    const z0 = center.z + Math.sin(a0) * radiusM;
    const x1 = center.x + Math.cos(a1) * radiusM;
    const z1 = center.z + Math.sin(a1) * radiusM;
    const j = i * 6;
    out[j] = x0; out[j + 1] = y; out[j + 2] = z0;
    out[j + 3] = x1; out[j + 4] = y; out[j + 5] = z1;
  }
  return out;
}

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
