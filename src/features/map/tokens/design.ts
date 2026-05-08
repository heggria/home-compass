/**
 * Design tokens — the single source of truth for color / type / motion.
 *
 * Mirrors css custom properties in `src/app/globals.css`, and is the only
 * place layers should pull style constants from. This keeps the look
 * consistent and gives us one knob to adjust the whole map.
 */

export const tone = {
  bg: "#08090d",
  bgPanel: "#10131a",
  bgPanelStrong: "#13161e",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
  ink: "#e8eaf2",
  ink2: "#a8acba",
  ink3: "#6f7384",
  brand: "#7657FF",
  brandSoft: "#9F8BFF",
  accent: "#FF8C42",
  good: "#3DD68C",
  warn: "#FFB547",
  bad: "#FF4D6D",
  cool: "#54D7E8",
} as const;

export const sceneColors = {
  /** Sky gradient (top → horizon). */
  skyTop: 0x0a0d14,
  skyHorizon: 0x10141d,
  fog: 0x05070a,

  ground: 0x0c0f15,
  gridMajor: 0x1c2230,
  gridMinor: 0x141823,

  water: 0x18324a,
  waterEdge: 0x254a6c,

  /** Roads by class — ranked by visual weight */
  road: {
    motorway: 0xffb547,
    trunk: 0xff8c42,
    primary: 0xe7e2dd,
    secondary: 0x90969f,
    tertiary: 0x5b6171,
    other: 0x383d49,
  } as Record<string, number>,

  rail: 0x6f7384,
  airport: 0x2a2f3d,

  district: {
    /** Used when the district has no transaction data. */
    neutral: 0x2a3142,
    /** Sequential ramp by 均价 (cool → warm). 0 = cheap, 1 = expensive. */
    rampStops: [
      [0.0, 0x2A6FD0],
      [0.25, 0x4DB2E0],
      [0.5, 0x6BD78C],
      [0.75, 0xFFB547],
      [1.0, 0xFF4D6D],
    ] as [number, number][],
    /** Edge color for selected/hover. */
    haloHover: 0x9f8bff,
    haloSelect: 0xffffff,
  },

  subwayDefault: 0x00d4ff,
  hospital: 0xff4d6d,
  school: 0x4da8ff,
  mall: 0xff8c42,
  park: 0x3dd68c,
  policy: 0xa18bff,
} as const;

export const motion = {
  /** Camera flyTo durations */
  cameraFlyMs: 750,
  /** Inspector slide-in */
  panelMs: 220,
  /** Halo pulse period */
  haloPeriodMs: 1800,
  /** LayerSwitcher fade */
  fadeMs: 160,
} as const;

export const z = {
  ground: 0,
  water: 0.5,
  parks: 0.8,
  roads: 1.0,
  rail: 1.2,
  subway: 1.5,
  serviceArea: 1.8,
  districtBase: 2.0,
  poi: 50,
  label: 80,
} as const;

/** RGB lerp on a piecewise color ramp. */
export function rampColor(t: number, ramp: readonly [number, number][]): number {
  if (t <= ramp[0][0]) return ramp[0][1];
  if (t >= ramp[ramp.length - 1][0]) return ramp[ramp.length - 1][1];
  for (let i = 0; i < ramp.length - 1; i++) {
    const [t0, c0] = ramp[i];
    const [t1, c1] = ramp[i + 1];
    if (t >= t0 && t <= t1) {
      const a = (t - t0) / (t1 - t0);
      const r0 = (c0 >> 16) & 0xff;
      const g0 = (c0 >> 8) & 0xff;
      const b0 = c0 & 0xff;
      const r1 = (c1 >> 16) & 0xff;
      const g1 = (c1 >> 8) & 0xff;
      const b1 = c1 & 0xff;
      const r = Math.round(r0 + (r1 - r0) * a);
      const g = Math.round(g0 + (g1 - g0) * a);
      const b = Math.round(b0 + (b1 - b0) * a);
      return (r << 16) | (g << 8) | b;
    }
  }
  return ramp[ramp.length - 1][1];
}
