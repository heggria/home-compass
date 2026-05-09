"""
Water polygons + line waterways inside the ring.

Output:
   water_polys.json: [{name, geom: [[lng,lat], ...]}, ...]
        — one entry per polygon; existing WaterLayer extracts ring 0.
   water_lines.json: [{name, kind, segs: [lng,lat, lng,lat, ...]}, ...]
"""
from __future__ import annotations

from pathlib import Path

from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon
from shapely.ops import unary_union

from common import line_to_segs, overpass, write_json

POLY_QUERY = """
[out:json][timeout:240];
(
  way["natural"="water"]({bbox});
  relation["natural"="water"]({bbox});
  way["water"]({bbox});
  relation["water"]({bbox});
);
out geom;
"""

LINE_QUERY = """
[out:json][timeout:240];
(
  way["waterway"~"^(river|stream|canal|drain)$"]({bbox});
);
out geom;
"""


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    return f"{miny},{minx},{maxy},{maxx}"


def _polys_from_raw(raw: dict) -> list[tuple[Polygon, str]]:
    out: list[tuple[Polygon, str]] = []
    for el in raw.get("elements", []):
        name = ((el.get("tags") or {}).get("name") or "").strip()
        if el.get("type") == "way":
            geom = el.get("geometry") or []
            if len(geom) >= 4:
                ring = [(p["lon"], p["lat"]) for p in geom]
                if ring[0] == ring[-1]:
                    try:
                        p = Polygon(ring).buffer(0)
                        if not p.is_empty:
                            out.append((p, name))
                    except Exception:
                        pass
        elif el.get("type") == "relation":
            outers: list[list[tuple[float, float]]] = []
            inners: list[list[tuple[float, float]]] = []
            for m in el.get("members", []):
                if m.get("type") != "way":
                    continue
                ring = [(p["lon"], p["lat"]) for p in m.get("geometry", [])]
                if len(ring) < 4 or ring[0] != ring[-1]:
                    continue
                (inners if (m.get("role") == "inner") else outers).append(ring)
            if not outers:
                continue
            try:
                p = unary_union([Polygon(r, holes=inners) for r in outers]).buffer(0)
                if not p.is_empty:
                    out.append((p, name))
            except Exception:
                pass
    return out


def build_water(mask, out_dir: Path, refresh: bool = False) -> None:
    bbox = _bbox(mask)

    polys_raw = overpass(POLY_QUERY.format(bbox=bbox), "water_polys", refresh=refresh)
    polys = _polys_from_raw(polys_raw)
    print(f"   raw water polygons: {len(polys)}")

    poly_out = []
    for p, name in polys:
        clipped = p.intersection(mask)
        if clipped.is_empty:
            continue
        # Explode multipolygons; emit one entry per outer ring.
        parts = clipped.geoms if isinstance(clipped, MultiPolygon) else [clipped]
        for part in parts:
            if part.is_empty or part.area < 1e-9:
                continue
            poly_out.append(
                {
                    "name": name,
                    "geom": [[round(x, 7), round(y, 7)] for x, y in part.exterior.coords],
                }
            )
    print(f"   water polygons kept: {len(poly_out)}")
    write_json(out_dir / "water_polys.json", poly_out)

    lines_raw = overpass(LINE_QUERY.format(bbox=bbox), "water_lines", refresh=refresh)
    line_out = []
    for el in lines_raw.get("elements", []):
        if el.get("type") != "way":
            continue
        kind = (el.get("tags") or {}).get("waterway", "river")
        name = (el.get("tags") or {}).get("name", "")
        coords = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(coords) < 2:
            continue
        ls = LineString(coords)
        clipped = ls.intersection(mask)
        if clipped.is_empty:
            continue
        flat: list[float] = []
        if isinstance(clipped, LineString):
            flat.extend(line_to_segs(clipped))
        elif isinstance(clipped, MultiLineString):
            for g in clipped.geoms:
                flat.extend(line_to_segs(g))
        if not flat:
            continue
        line_out.append({"name": name, "kind": kind, "segs": [round(v, 7) for v in flat]})
    print(f"   water lines kept: {len(line_out)}")
    write_json(out_dir / "water_lines.json", line_out)
