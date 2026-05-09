"""
Districts (residential xiaoqu polygons) inside the 6th Ring.

Source: OSM `landuse=residential` and named `place=neighbourhood/quarter`
ways/relations. We pick the residential landuse polygons (closest match
to "板块/小区" granularity) and clip to the buffered ring.

Output schema matches the runtime DistrictsLayer:

    {type: "FeatureCollection", features: [{
       type: "Feature",
       geometry: Polygon | MultiPolygon,
       properties: {
         osm_name, osm_id,
         xq_list: [], 成交: 0, 均价: null, 均面积: null, 均总价: null,
         dist_subway_m: <float|null>
       }
    }, ...]}
"""
from __future__ import annotations

import math
from pathlib import Path

from shapely.geometry import (
    LineString,
    MultiPolygon,
    Polygon,
    mapping,
    shape,
)
from shapely.ops import unary_union, transform
import pyproj

from common import OUT_DIR, overpass, write_json, RAW_DIR

QUERY = """
[out:json][timeout:240];
(
  way["landuse"="residential"]({bbox});
  relation["landuse"="residential"]({bbox});
);
out geom;
"""


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    # Overpass bbox: south,west,north,east
    return f"{miny},{minx},{maxy},{maxx}"


def _polygons_from_overpass(raw: dict) -> list[tuple[Polygon, str | None, int]]:
    """Yield (Polygon, name, osm_id) — best effort over OSM ways/relations."""
    out: list[tuple[Polygon, str | None, int]] = []

    for el in raw.get("elements", []):
        if el.get("type") == "way":
            geom = el.get("geometry", [])
            if len(geom) < 4:
                continue
            ring = [(p["lon"], p["lat"]) for p in geom]
            if ring[0] != ring[-1]:
                continue  # not closed → not a polygon
            try:
                poly = Polygon(ring).buffer(0)
            except Exception:
                continue
            if poly.is_empty:
                continue
            name = (el.get("tags") or {}).get("name")
            out.append((poly, name, int(el["id"])))
        elif el.get("type") == "relation":
            members = el.get("members", [])
            outers: list[list[tuple[float, float]]] = []
            inners: list[list[tuple[float, float]]] = []
            for m in members:
                if m.get("type") != "way":
                    continue
                role = m.get("role") or "outer"
                ring = [(p["lon"], p["lat"]) for p in m.get("geometry", [])]
                if len(ring) < 4 or ring[0] != ring[-1]:
                    continue
                if role == "inner":
                    inners.append(ring)
                else:
                    outers.append(ring)
            if not outers:
                continue
            try:
                poly = unary_union([Polygon(r, holes=inners) for r in outers]).buffer(0)
            except Exception:
                continue
            if poly.is_empty:
                continue
            name = (el.get("tags") or {}).get("name")
            out.append((poly, name, int(el["id"])))
    return out


def _subway_lines_metric(mask) -> list[LineString] | None:
    """Optional helper: distance to nearest subway line, in metres.

    Reads the freshly-built subway.json if available so the
    `dist_subway_m` field can be populated. Returns None if subway
    data isn't on disk yet (first ever run)."""
    sub_path = OUT_DIR / "subway.json"
    if not sub_path.exists():
        return None
    import json
    data = json.load(sub_path.open())
    project_to_m = pyproj.Transformer.from_crs(
        "EPSG:4326", "EPSG:32650", always_xy=True
    ).transform
    out: list[LineString] = []
    for line in data:
        segs = line.get("segs") or []
        for i in range(0, len(segs), 4):
            try:
                ls = LineString(
                    [(segs[i], segs[i + 1]), (segs[i + 2], segs[i + 3])]
                )
            except Exception:
                continue
            try:
                out.append(transform(project_to_m, ls))
            except Exception:
                continue
    return out or None


def build_districts(mask, out_dir: Path, refresh: bool = False) -> None:
    raw = overpass(QUERY.format(bbox=_bbox(mask)), "districts", refresh=refresh)
    polys = _polygons_from_overpass(raw)
    print(f"   raw polygons: {len(polys)}")

    project_to_m = pyproj.Transformer.from_crs(
        "EPSG:4326", "EPSG:32650", always_xy=True
    ).transform

    sub_lines_m = _subway_lines_metric(mask)
    if sub_lines_m is None:
        print("   subway.json not found yet → dist_subway_m will be null")

    features = []
    kept = 0
    for poly, name, osm_id in polys:
        if not poly.intersects(mask):
            continue
        clipped = poly.intersection(mask).buffer(0)
        if clipped.is_empty or clipped.area < 1e-8:
            continue
        # Distance to nearest subway line in metres
        dist_subway_m = None
        if sub_lines_m:
            try:
                pt_m = transform(project_to_m, clipped.representative_point())
                d = min(line.distance(pt_m) for line in sub_lines_m)
                dist_subway_m = round(float(d), 1)
            except Exception:
                dist_subway_m = None

        features.append(
            {
                "type": "Feature",
                "geometry": mapping(clipped),
                "properties": {
                    "osm_name": name or "",
                    "osm_id": int(osm_id),
                    "xq_list": [],
                    "成交": 0,
                    "均价": None,
                    "均面积": None,
                    "均总价": None,
                    "dist_subway_m": dist_subway_m,
                },
            }
        )
        kept += 1

    print(f"   inside ring + buffered: {kept}")
    write_json(out_dir / "geo.json", {"type": "FeatureCollection", "features": features})
