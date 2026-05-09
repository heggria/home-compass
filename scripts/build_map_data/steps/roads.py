"""
Roads grouped by 6 visual classes that match `road_styles.json`.

Source: OSM `highway=*`. We bucket OSM tags into the existing 6-tier
visual hierarchy used by the front-end:

  0  高速/快速     motorway, motorway_link, trunk, trunk_link
  1  主干道       primary, primary_link
  2  次干道       secondary, secondary_link
  3  支路         tertiary, tertiary_link
  4  小路         unclassified, road
  5  居住道       residential, living_street, service

Each class becomes one flat `[lng,lat,lng,lat,...]` array with consecutive
pairs of points forming line segments — same shape RoadsLayer expects.
"""
from __future__ import annotations

from pathlib import Path

from shapely.geometry import LineString, MultiLineString
from shapely.ops import unary_union

from common import line_to_segs, overpass, write_json

ROAD_CLASS_TAGS = [
    ("高速/快速", "#FF8C42", 2.6, 0.95,
        ["motorway", "motorway_link", "trunk", "trunk_link"]),
    ("主干道", "#FFB347", 1.9, 0.85,
        ["primary", "primary_link"]),
    ("次干道", "#FFD580", 1.4, 0.7,
        ["secondary", "secondary_link"]),
    ("支路", "#9FB5C8", 1.0, 0.55,
        ["tertiary", "tertiary_link"]),
    ("小路", "#7080A0", 0.7, 0.4,
        ["unclassified", "road"]),
    ("居住道", "#5b6478", 0.5, 0.28,
        ["residential", "living_street", "service"]),
]

QUERY = """
[out:json][timeout:300];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|road|residential|living_street|service)$"]({bbox});
);
out geom;
"""


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    return f"{miny},{minx},{maxy},{maxx}"


def build_roads(mask, out_dir: Path, refresh: bool = False) -> None:
    raw = overpass(QUERY.format(bbox=_bbox(mask)), "roads", refresh=refresh)
    print(f"   raw highway ways: {len(raw.get('elements', []))}")

    by_class: list[list[LineString]] = [[] for _ in ROAD_CLASS_TAGS]

    for el in raw.get("elements", []):
        if el.get("type") != "way":
            continue
        tag = (el.get("tags") or {}).get("highway")
        if not tag:
            continue
        cls = next(
            (i for i, c in enumerate(ROAD_CLASS_TAGS) if tag in c[4]),
            None,
        )
        if cls is None:
            continue
        coords = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(coords) >= 2:
            by_class[cls].append(LineString(coords))

    out_segs: list[list[float]] = []
    counts: list[int] = []
    for i, lines in enumerate(by_class):
        if not lines:
            out_segs.append([])
            counts.append(0)
            continue
        merged = unary_union(MultiLineString(lines))
        clipped = merged.intersection(mask)
        if clipped.is_empty:
            out_segs.append([])
            counts.append(0)
            continue
        flat: list[float] = []
        if isinstance(clipped, LineString):
            flat.extend(line_to_segs(clipped))
        elif isinstance(clipped, MultiLineString):
            for g in clipped.geoms:
                flat.extend(line_to_segs(g))
        # Round to 7 decimals → ~1 cm precision, halves file size.
        flat = [round(v, 7) for v in flat]
        out_segs.append(flat)
        counts.append(len(lines))

    write_json(out_dir / "roads.json", out_segs)
    write_json(out_dir / "road_counts.json", counts)
    write_json(
        out_dir / "road_styles.json",
        [
            {"name": n, "color": c, "width": w, "opacity": o}
            for (n, c, w, o, _) in ROAD_CLASS_TAGS
        ],
    )
