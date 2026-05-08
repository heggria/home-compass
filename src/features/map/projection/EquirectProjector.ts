/**
 * Equirectangular projection centered at a fixed lng/lat.
 *
 * For a city-scale viewport (Beijing fits in ~1° lat × 1.4° lng), a flat
 * projection gives sub-meter accuracy and lets us reuse the WGS84 → meters
 * formula used in the original 3D house map.
 *
 * Y-up, X-east, Z-south (so camera sits at +Y looking down/north).
 */

import type { LngLat, Projector, WorldXY } from "../core/types";

const M_PER_LAT = 111_320;

interface ElevationGrid {
  rows: number;
  cols: number;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
  elev_min: number;
  elev_max: number;
  /** flat row-major lat × lng grid of meters. */
  data?: number[]; // optional, used when terrain layer is enabled
}

export class EquirectProjector implements Projector {
  readonly center: LngLat;
  readonly mPerLon: number;

  /** vertical scale applied to elevation when used for visual relief. */
  terrainVScale = 0.4;

  private elev?: ElevationGrid;

  constructor(center: LngLat) {
    this.center = center;
    this.mPerLon = M_PER_LAT * Math.cos((center.lat * Math.PI) / 180);
  }

  setElevation(grid: ElevationGrid) {
    this.elev = grid;
  }

  project({ lng, lat }: LngLat): WorldXY {
    return {
      x: (lng - this.center.lng) * this.mPerLon,
      z: -(lat - this.center.lat) * M_PER_LAT,
    };
  }

  unproject({ x, z }: WorldXY): LngLat {
    return {
      lng: x / this.mPerLon + this.center.lng,
      lat: -z / M_PER_LAT + this.center.lat,
    };
  }

  /** Bilinear sample of elevation; returns 0 when grid is missing or oob. */
  elevationAt({ lng, lat }: LngLat): number {
    const g = this.elev;
    if (!g || !g.data) return 0;
    const { rows, cols, lat_min, lat_max, lon_min, lon_max } = g;
    if (lat < lat_min || lat > lat_max || lng < lon_min || lng > lon_max) return 0;
    const u = ((lng - lon_min) / (lon_max - lon_min)) * (cols - 1);
    const v = ((lat_max - lat) / (lat_max - lat_min)) * (rows - 1);
    const u0 = Math.floor(u);
    const v0 = Math.floor(v);
    const u1 = Math.min(cols - 1, u0 + 1);
    const v1 = Math.min(rows - 1, v0 + 1);
    const fu = u - u0;
    const fv = v - v0;
    const i = (r: number, c: number) => g.data![r * cols + c];
    const a = i(v0, u0) * (1 - fu) + i(v0, u1) * fu;
    const b = i(v1, u0) * (1 - fu) + i(v1, u1) * fu;
    return a * (1 - fv) + b * fv;
  }
}
