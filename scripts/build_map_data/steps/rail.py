"""
Heavy / suburban rail lines + named railway stations.

Output:
   rail_lines.json: [{kind, segs: [...]}, ...]
   rail_stations.json: [{name, lon, lat}, ...]
"""
from __future__ import annotations

from pathlib import Path

from shapely.geometry import LineString, MultiLineString
from shapely.ops import unary_union

from common import line_to_segs, overpass, write_json

LINE_QUERY = """
[out:json][timeout:240];
(
  way["railway"~"^(rail|light_rail|narrow_gauge)$"]["service"!~"."]({bbox});
);
out geom;
"""

STATION_QUERY = """
[out:json][timeout:240];
(
  node["railway"="station"]({bbox});
  node["railway"="halt"]({bbox});
);
out;
"""


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    return f"{miny},{minx},{maxy},{maxx}"


def build_rail(mask, out_dir: Path, refresh: bool = False) -> None:
    bbox = _bbox(mask)

    raw = overpass(LINE_QUERY.format(bbox=bbox), "rail_lines", refresh=refresh)
    lines: list[LineString] = []
    for el in raw.get("elements", []):
        if el.get("type") != "way":
            continue
        coords = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(coords) >= 2:
            lines.append(LineString(coords))
    print(f"   raw rail ways: {len(lines)}")

    out: list[dict] = []
    if lines:
        merged = unary_union(MultiLineString(lines))
        clipped = merged.intersection(mask)
        if not clipped.is_empty:
            geoms = clipped.geoms if isinstance(clipped, MultiLineString) else [clipped]
            for g in geoms:
                if g.is_empty:
                    continue
                out.append(
                    {"kind": "rail", "segs": [round(v, 7) for v in line_to_segs(g)]}
                )
    print(f"   rail segments kept: {len(out)}")
    write_json(out_dir / "rail_lines.json", out)

    raw_st = overpass(STATION_QUERY.format(bbox=bbox), "rail_stations", refresh=refresh)
    stations = []
    seen = set()
    for el in raw_st.get("elements", []):
        if el.get("type") != "node":
            continue
        name = (el.get("tags") or {}).get("name", "").strip()
        if not name:
            continue
        if name in seen:
            continue
        seen.add(name)
        lon, lat = el["lon"], el["lat"]
        stations.append({"name": name, "lon": lon, "lat": lat})
    print(f"   rail stations: {len(stations)}")
    write_json(out_dir / "rail_stations.json", stations)
