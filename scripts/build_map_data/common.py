"""
Common helpers for the map-data build pipeline.

Centralises:
  * Overpass HTTP with backoff, mirror failover and on-disk caching
  * 6th Ring polygon loading + buffering
  * Geometry clipping helpers (lines + polygons)
  * Atomic JSON writes
"""
from __future__ import annotations

import json
import os
import random
import time
from pathlib import Path
from typing import Any, Iterable

import requests
from shapely.geometry import (
    LineString,
    MultiLineString,
    MultiPolygon,
    Point,
    Polygon,
    mapping,
    shape,
)
from shapely.ops import linemerge, polygonize, transform, unary_union
import pyproj

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data-raw"
OUT_DIR = ROOT / "public" / "map-data"

RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]
HEADERS = {
    "User-Agent": "home-compass/0.1 (+https://github.com/heggria/home-compass)"
}

# ---------------------------------------------------------------- HTTP cache --

def overpass(query: str, cache_key: str, *, refresh: bool = False) -> dict:
    """POST a query to Overpass with mirror failover and on-disk caching.

    `cache_key` is the file stem under `data-raw/` (no extension).
    """
    cache_path = RAW_DIR / f"{cache_key}.json"
    if cache_path.exists() and not refresh:
        with cache_path.open() as f:
            return json.load(f)

    last_err: Exception | None = None
    for attempt in range(3):
        for ep in OVERPASS_ENDPOINTS:
            try:
                t0 = time.time()
                r = requests.post(
                    ep, data={"data": query}, headers=HEADERS, timeout=300
                )
                if r.status_code == 200:
                    data = r.json()
                    with cache_path.open("w") as f:
                        json.dump(data, f)
                    print(
                        f"  overpass[{cache_key}] {ep.split('/')[2]} "
                        f"{len(r.text)//1024}KB {time.time()-t0:.1f}s"
                    )
                    return data
                if r.status_code in (429, 504):
                    last_err = RuntimeError(f"{ep} → {r.status_code}")
                    continue
                last_err = RuntimeError(f"{ep} → {r.status_code} {r.text[:200]}")
            except Exception as e:  # network / json error
                last_err = e
        sleep_s = 5 + random.random() * 5 + attempt * 5
        print(f"  overpass retry in {sleep_s:.1f}s ({last_err})")
        time.sleep(sleep_s)
    raise RuntimeError(f"Overpass failed for {cache_key}: {last_err}")


# ------------------------------------------------------------ ring boundary --

def fetch_ring6_polygon(refresh: bool = False) -> Polygon:
    """Download the 6th Ring relation, stitch ways into a closed polygon."""
    cache = RAW_DIR / "ring6_polygon.geojson"
    if cache.exists() and not refresh:
        with cache.open() as f:
            gj = json.load(f)
        return shape(gj["geometry"])

    raw = overpass(
        "[out:json][timeout:120];relation(295982);way(r);out geom;",
        "ring6_ways",
        refresh=refresh,
    )
    lines: list[LineString] = []
    for el in raw["elements"]:
        if el.get("type") != "way":
            continue
        coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
        if len(coords) >= 2:
            lines.append(LineString(coords))
    if not lines:
        raise RuntimeError("ring6: no ways returned")

    merged = linemerge(unary_union(MultiLineString(lines)))
    polys = list(polygonize(merged))
    if not polys:
        raise RuntimeError("ring6: polygonize produced 0 polygons")
    polys.sort(key=lambda p: p.area, reverse=True)
    poly = polys[0]
    with cache.open("w") as f:
        json.dump(
            {
                "type": "Feature",
                "properties": {"name": "Beijing 6th Ring (interior)"},
                "geometry": mapping(poly),
            },
            f,
        )
    return poly


def buffered_ring(poly: Polygon, meters: float = 2000) -> Polygon:
    """Buffer the ring polygon by `meters` (in metres) using EPSG:32650."""
    project_to_m = pyproj.Transformer.from_crs(
        "EPSG:4326", "EPSG:32650", always_xy=True
    ).transform
    project_back = pyproj.Transformer.from_crs(
        "EPSG:32650", "EPSG:4326", always_xy=True
    ).transform
    metric = transform(project_to_m, poly)
    buffered = metric.buffer(meters)
    return transform(project_back, buffered)


# --------------------------------------------------------------- geometry I/O

def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size//1024}KB)")


def way_to_linestring(el: dict) -> LineString | None:
    pts = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
    if len(pts) < 2:
        return None
    return LineString(pts)


def line_to_segs(line: LineString) -> list[float]:
    """Flatten a LineString to `[x0,y0,x1,y1,x1,y1,x2,y2,...]` so consecutive
    pairs of (lng,lat) form one rendered segment — matches the existing
    front-end shape used by SubwayLayer / RailsLayer / RoadsLayer."""
    cs = list(line.coords)
    out: list[float] = []
    for i in range(len(cs) - 1):
        ax, ay = cs[i]
        bx, by = cs[i + 1]
        out.extend([ax, ay, bx, by])
    return out


def linestring_or_multi_to_segs(geom) -> list[float]:
    if geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return line_to_segs(geom)
    if isinstance(geom, MultiLineString):
        out: list[float] = []
        for g in geom.geoms:
            out.extend(line_to_segs(g))
        return out
    return []


def polygon_outer_coords(poly: Polygon) -> list[list[float]]:
    return [[round(x, 7), round(y, 7)] for x, y in poly.exterior.coords]


def polygon_to_geojson(poly) -> dict:
    return mapping(poly)


# Generic clip-by-mask helper. Returns Shapely geometry or None when empty.
def clip(geom, mask) -> Any:
    if geom.is_empty:
        return None
    if not geom.intersects(mask):
        return None
    g = geom.intersection(mask)
    if g.is_empty:
        return None
    return g


# Iterate over multi-part outputs as a list of singletons.
def explode(geom) -> Iterable:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, (MultiPolygon, MultiLineString)):
        return list(geom.geoms)
    return [geom]
