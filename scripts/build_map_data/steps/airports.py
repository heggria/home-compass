"""
Airport polygons, runways and helipads inside the ring buffer.

Note: the ring buffer is small relative to PEK / 大兴 so most often this
will hit Sha He, Bad Ling helipads etc. We keep the schema identical so
the layer doesn't need to change.

Output:
   airport_polys.json:  [{name, kind, geom: [[lng,lat], ...]}, ...]
   runway_lines.json:   [{kind: "runway", segs: [...]}, ...]
   helipads.json:       [{name, lon, lat}, ...]
"""
from __future__ import annotations

from pathlib import Path

from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon
from shapely.ops import unary_union

from common import line_to_segs, overpass, write_json

AIRPORT_QUERY = """
[out:json][timeout:240];
(
  way["aeroway"="aerodrome"]({bbox});
  relation["aeroway"="aerodrome"]({bbox});
  way["military"="airfield"]({bbox});
  relation["military"="airfield"]({bbox});
);
out geom;
"""

RUNWAY_QUERY = """
[out:json][timeout:240];
(
  way["aeroway"="runway"]({bbox});
);
out geom;
"""

HELIPAD_QUERY = """
[out:json][timeout:240];
(
  node["aeroway"="helipad"]({bbox});
  way["aeroway"="helipad"]({bbox});
);
out center;
"""


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    return f"{miny},{minx},{maxy},{maxx}"


def _polys(raw: dict) -> list[tuple[Polygon, str, str]]:
    out: list[tuple[Polygon, str, str]] = []
    for el in raw.get("elements", []):
        tags = el.get("tags") or {}
        name = (tags.get("name") or "").strip()
        kind = tags.get("aeroway") or ("airfield" if tags.get("military") == "airfield" else "aerodrome")
        if el.get("type") == "way":
            geom = el.get("geometry") or []
            if len(geom) >= 4:
                ring = [(p["lon"], p["lat"]) for p in geom]
                if ring[0] == ring[-1]:
                    try:
                        p = Polygon(ring).buffer(0)
                        if not p.is_empty:
                            out.append((p, name, kind))
                    except Exception:
                        pass
        elif el.get("type") == "relation":
            outers, inners = [], []
            for m in el.get("members", []):
                if m.get("type") != "way":
                    continue
                ring = [(p["lon"], p["lat"]) for p in m.get("geometry", [])]
                if len(ring) < 4 or ring[0] != ring[-1]:
                    continue
                (inners if m.get("role") == "inner" else outers).append(ring)
            if not outers:
                continue
            try:
                p = unary_union([Polygon(r, holes=inners) for r in outers]).buffer(0)
                if not p.is_empty:
                    out.append((p, name, kind))
            except Exception:
                pass
    return out


def build_airports(mask, out_dir: Path, refresh: bool = False) -> None:
    bbox = _bbox(mask)

    polys = _polys(overpass(AIRPORT_QUERY.format(bbox=bbox), "airports", refresh=refresh))
    print(f"   raw airport polygons: {len(polys)}")
    poly_out = []
    for p, name, kind in polys:
        clipped = p.intersection(mask)
        if clipped.is_empty:
            continue
        parts = clipped.geoms if isinstance(clipped, MultiPolygon) else [clipped]
        for part in parts:
            if part.is_empty or part.area < 1e-7:
                continue
            poly_out.append(
                {
                    "name": name,
                    "kind": kind,
                    "geom": [[round(x, 7), round(y, 7)] for x, y in part.exterior.coords],
                }
            )
    print(f"   airport polygons kept: {len(poly_out)}")
    write_json(out_dir / "airport_polys.json", poly_out)

    runways = overpass(RUNWAY_QUERY.format(bbox=bbox), "runways", refresh=refresh)
    runway_lines: list[LineString] = []
    for el in runways.get("elements", []):
        if el.get("type") != "way":
            continue
        coords = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(coords) >= 2:
            runway_lines.append(LineString(coords))
    out_runways = []
    if runway_lines:
        merged = unary_union(MultiLineString(runway_lines))
        clipped = merged.intersection(mask)
        if not clipped.is_empty:
            geoms = clipped.geoms if isinstance(clipped, MultiLineString) else [clipped]
            for g in geoms:
                if g.is_empty:
                    continue
                out_runways.append(
                    {"kind": "runway", "segs": [round(v, 7) for v in line_to_segs(g)]}
                )
    print(f"   runway segments kept: {len(out_runways)}")
    write_json(out_dir / "runway_lines.json", out_runways)

    helipads_raw = overpass(HELIPAD_QUERY.format(bbox=bbox), "helipads", refresh=refresh)
    pads = []
    seen = set()
    for el in helipads_raw.get("elements", []):
        if el.get("type") == "node":
            lon, lat = el["lon"], el["lat"]
        elif el.get("type") == "way" and el.get("center"):
            lon, lat = el["center"]["lon"], el["center"]["lat"]
        else:
            continue
        name = (el.get("tags") or {}).get("name", "")
        key = (round(lon, 5), round(lat, 5))
        if key in seen:
            continue
        seen.add(key)
        pads.append({"name": name, "lon": lon, "lat": lat})
    print(f"   helipads: {len(pads)}")
    write_json(out_dir / "helipads.json", pads)
