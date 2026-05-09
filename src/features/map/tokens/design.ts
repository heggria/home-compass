/**
 * Design tokens — cyberpunk-Beijing palette.
 *
 * Single source of truth for colors / motion / z-order. Layers must pull
 * style constants from here so the whole map stays coherent.
 *
 * Aesthetic direction: deep midnight-violet base + cyan / magenta accents,
 * inspired by city night skylines (Akira / Cyberpunk 2077 minimap / 西安不
 * 夜城). Bright = important, glow = signal density, dark = breathing room.
 */

export const tone = {
  bg: "#06070d",
  bgPanel: "#0c0d18",
  bgPanelStrong: "#10121e",
  border: "rgba(140,160,255,0.10)",
  borderStrong: "rgba(160,180,255,0.22)",
  ink: "#eef0ff",
  ink2: "#a8acc6",
  ink3: "#666a86",
  brand: "#A872FF", // primary action / selection
  brandSoft: "#C9A8FF",
  accent: "#FF6B9F", // hot pink — for emphasis
  good: "#2DE6B6",
  warn: "#FFB547",
  bad: "#FF4D6D",
  cool: "#5BE7F0", // cyan
} as const;

export const sceneColors = {
  // Sky gradient (rendered as inverted dome shader)
  skyTop: 0x05060f,        // near-black violet at zenith
  skyMid: 0x10142a,        // deep indigo
  skyHorizon: 0x2a1a4a,    // hot violet at horizon
  fog: 0x0a0c1a,           // matches deep horizon for blend

  // Ground (used as fallback color where grid shader fails)
  ground: 0x05060d,
  // Grid is rendered procedurally now — these are sampled inside the shader.
  gridMajor: 0x6c7bff,
  gridMinor: 0x2a3060,
  gridGlow: 0xa872ff,

  // BBox neon ring around the data envelope
  envelopeNeon: 0xa872ff,

  // Water — bright cyan; rivers should _read_ at a glance
  water: 0x123a55,
  waterEdge: 0x5be7f0,

  // Roads — cool monochrome with motorways pushed warm
  road: {
    motorway: 0xff8c4a,
    trunk: 0xffb547,
    primary: 0xc8d2ff,
    secondary: 0x7d87a8,
    tertiary: 0x4a5375,
    other: 0x2a304a,
  } as Record<string, number>,

  rail: 0x6f7384,
  airport: 0x2a2f3d,

  district: {
    /** Used when the district has no transaction data. */
    neutral: 0x1d2038,
    /**
     * Sequential ramp by 综合分 / 均价. Cool & desaturated at the low end so
     * cheap-but-good areas stay calm; ramp up to vivid magenta at the top so
     * "expensive / hot" reads instantly without needing the legend.
     *
     * Rule of thumb: low end stays under 60% saturation, high end goes 90%+.
     */
    rampStops: [
      [0.00, 0x223a4a], // dark teal — quiet
      [0.18, 0x2a6f7d], // teal
      [0.36, 0x3aa298], // mint
      [0.54, 0x6a86c7], // periwinkle (transitional)
      [0.72, 0xa872ff], // brand violet (mid-high)
      [0.86, 0xff6b9f], // hot pink
      [1.00, 0xff2255], // alarm red
    ] as [number, number][],
    /** Halo (emissive) on hover / selection. */
    haloHover: 0xa872ff,
    haloSelect: 0xffffff,
    /** Top-edge neon outline color */
    topEdge: 0xc9a8ff,
  },

  /** Subway line color overrides — 13/未知线 raw colors are too saturated. */
  subwayLineOverrides: {
    "13号线": 0xffc14a,    // warm amber instead of acid yellow
    "27号线": 0xff77c8,    // softer pink-violet
    "未知线": 0x6cc8ff,    // calmer cyan
  } as Record<string, number>,

  subwayDefault: 0x5be7f0,
  hospital: 0xff5577,
  school: 0x6cc8ff,
  university: 0xc8a2ff,
  kindergarten: 0x9ee9ff,
  mall: 0xffa14a,
  supermarket: 0xffd34a,
  park: 0x2de6b6,
  policy: 0xa872ff,
  landmark: 0xeef0ff,
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
  subway: 2.0,
  serviceArea: 2.4,
  districtBase: 3.0,
  poi: 30,            // POIs sit above district roofs (most are <=300 m); we use sprite world-positioning anyway
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
