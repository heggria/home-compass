/**
 * Data repository — abstraction over "where map data comes from".
 *
 * Today: static JSON in /public/map-data. Tomorrow: edge function, Postgres,
 * Mapbox tiles, whatever. Layers must NEVER fetch directly; they always go
 * through this module so we can swap the source without touching layer code.
 */

const BASE = "/map-data";

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as Promise<T>;
  const p = fetch(`${BASE}/${path}`)
    .then((r) => {
      if (!r.ok) throw new Error(`map-data fetch failed: ${path} (${r.status})`);
      return r.json();
    })
    .catch((e) => {
      cache.delete(path);
      throw e;
    }) as Promise<T>;
  cache.set(path, p);
  return p;
}

// ---------- Strict shapes ----------

export interface DistrictsFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
    properties: {
      osm_name: string;
      osm_id: number;
      xq_list?: unknown[];
      成交?: number;
      均价?: number | null;
      均面积?: number | null;
      均总价?: number | null;
      dist_subway_m?: number | null;
    };
  }>;
}

export interface SubwayLine {
  name: string;
  color: string;
  /** Flat array of [lng, lat] pairs, every 4 numbers = one segment. */
  segs: number[];
}

export interface PoiItem {
  name: string;
  lon: number;
  lat: number;
}

export interface PoiCategory {
  name: string;
  color: string;
  items: PoiItem[];
}

export type PoiCategoryMap = Record<string, PoiCategory>;

export interface RoadsByClass {
  [klass: string]: number[]; // flat segments
}

export interface ParkPolygon {
  name?: string;
  coords: number[][]; // [lng,lat][]
}

export interface WaterLine {
  coords: number[][];
}
export interface WaterPolygon {
  coords: number[][][];
}

// ---------- Public API ----------

export const repo = {
  districts: () => fetchJson<DistrictsFeatureCollection>("geo.json"),
  subway: () => fetchJson<SubwayLine[]>("subway.json"),
  poi: () => fetchJson<PoiCategoryMap>("poi_cats.json"),
  roads: () => fetchJson<unknown[]>("roads.json"),
  roadStyles: () => fetchJson<Array<{ klass: string; color: string; width: number }>>("road_styles.json"),
  parks: () => fetchJson<unknown[]>("parks.json"),
  waterLines: () => fetchJson<unknown[]>("water_lines.json"),
  waterPolys: () => fetchJson<unknown[]>("water_polys.json"),
  railLines: () => fetchJson<unknown[]>("rail_lines.json"),
  elevation: () => fetchJson<unknown>("elev.json"),
  stats: () => fetchJson<{
    n_polygons: number;
    n_with_data: number;
    n_no_data: number;
    lon_min: number;
    lon_max: number;
    lat_min: number;
    lat_max: number;
    lon_center: number;
  }>("stats.json"),
};
