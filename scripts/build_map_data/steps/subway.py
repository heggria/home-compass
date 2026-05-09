"""
Subway lines + station POIs.

Source: OSM `route=subway` relations (Beijing operates 北京地铁 + 京港地铁)
restricted to the buffered ring. Stations come from `station=subway`
nodes; entrances from `railway=subway_entrance` nodes.

Output:
   * subway.json       → SubwayLine[]   {name, color, segs:[lng,lat,lng,lat,...]}
   * (poi_cats.json gets subway_station / subway_entrance from steps/pois)

Colors mirror Beijing-Subway's official scheme; if a colour tag is
present on the relation we use it directly.
"""
from __future__ import annotations

import re
from pathlib import Path

from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge, unary_union

from common import (
    OUT_DIR,
    line_to_segs,
    linestring_or_multi_to_segs,
    overpass,
    write_json,
)


SUBWAY_QUERY = """
[out:json][timeout:240];
(
  relation["route"="subway"]["network"~"^北京"]({bbox});
  relation["route"="subway"]["operator"~"地铁"]({bbox});
);
way(r);
out geom;
relation["route"="subway"]["network"~"^北京"]({bbox});
out tags;
relation["route"="subway"]["operator"~"地铁"]({bbox});
out tags;
"""

# Two-pass query is awkward in a single Overpass call; we use two simple
# queries instead to keep the payload structured.
LINES_QUERY = """
[out:json][timeout:240];
(
  relation["route"="subway"]["network"~"^北京"]({bbox});
  relation["route"="subway"]["operator"~"地铁"]({bbox});
);
out tags;
"""

WAYS_FOR_RELATION_QUERY = """
[out:json][timeout:240];
relation({rid});
way(r)["railway"~"^(subway|light_rail|narrow_gauge)$"];
out geom;
"""


# Fallback colour by line name keyword. Matches existing palette tone.
DEFAULT_COLORS = {
    "1": "#A60125",
    "2": "#005CB9",
    "4": "#0089D2",
    "5": "#A22383",
    "6": "#C04D33",
    "7": "#F5C146",
    "8": "#0F8A4F",
    "9": "#7DA82C",
    "10": "#0072BC",
    "11": "#F25A29",
    "13": "#F9E700",
    "14": "#7B306C",
    "15": "#522F89",
    "16": "#005C26",
    "17": "#3D2C8F",
    "19": "#003F88",
    "亦庄": "#7AB832",
    "房山": "#9E318C",
    "昌平": "#FF8AB0",
    "大兴": "#D08AC0",
    "首都机场": "#0072BC",
    "大兴机场": "#005CA9",
    "燕房": "#F0A23F",
    "S1": "#88B4D6",
    "S2": "#0072BC",
}


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    return f"{miny},{minx},{maxy},{maxx}"


def _color_for(tags: dict, fallback_idx: int) -> str:
    if tags.get("colour"):
        c = tags["colour"]
        if not c.startswith("#"):
            c = "#" + c
        return c
    name = (tags.get("ref") or tags.get("name") or "").strip()
    for key, col in DEFAULT_COLORS.items():
        if key in name:
            return col
    palette = [
        "#FF6F61", "#3FA9F5", "#7AC74F", "#FBC531", "#9C88FF",
        "#00CEC9", "#E17055", "#74B9FF", "#55EFC4", "#FAB1A0",
    ]
    return palette[fallback_idx % len(palette)]


_LINE_NUM_RE = re.compile(r"(?:北京)?地铁\s*([0-9]+号线|[\u4e00-\u9fa5]+线)", re.U)


def _short_line_name(raw_name: str) -> str:
    """Collapse OSM relation `name` like '地铁 4号线: 安河桥北 → 公益西桥' →
    '4号线'. Keeps both 数字号线 and 中文+'线' (亦庄/八通/大兴/...)
    """
    if not raw_name:
        return ""
    m = _LINE_NUM_RE.search(raw_name)
    if m:
        return m.group(1)
    # Fall back to the segment before the first ':' / '：'
    head = re.split(r"[:：]", raw_name, 1)[0].strip()
    return head.replace("北京地铁", "").replace("地铁", "").strip() or raw_name


def build_subway(mask, out_dir: Path, refresh: bool = False) -> None:
    bbox = _bbox(mask)
    relations = overpass(LINES_QUERY.format(bbox=bbox), "subway_lines", refresh=refresh)
    rels = [el for el in relations.get("elements", []) if el.get("type") == "relation"]
    print(f"   subway relations: {len(rels)}")

    # Accumulate per short-line so both directions of one route collapse to a
    # single drawable entry.
    accum: dict[str, dict] = {}
    fallback_idx = 0
    for rel in rels:
        rid = rel["id"]
        tags = rel.get("tags") or {}
        raw_name = (tags.get("name:zh") or tags.get("name") or tags.get("ref") or f"地铁{rid}").strip()
        short = _short_line_name(raw_name) or raw_name

        ways_raw = overpass(
            WAYS_FOR_RELATION_QUERY.format(rid=rid),
            f"subway_ways_{rid}",
            refresh=refresh,
        )
        line_strings: list[LineString] = []
        for el in ways_raw.get("elements", []):
            if el.get("type") != "way":
                continue
            coords = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
            if len(coords) >= 2:
                line_strings.append(LineString(coords))
        if not line_strings:
            continue
        union = unary_union(MultiLineString(line_strings))
        try:
            merged = linemerge(union) if isinstance(union, MultiLineString) else union
        except ValueError:
            merged = union
        clipped = merged.intersection(mask)
        if clipped.is_empty:
            continue
        segs = linestring_or_multi_to_segs(clipped)
        if not segs:
            continue
        if short not in accum:
            accum[short] = {
                "name": short,
                "color": _color_for(tags, fallback_idx),
                "segs": [],
            }
            fallback_idx += 1
        accum[short]["segs"].extend(round(v, 7) for v in segs)

    lines_out = list(accum.values())
    # Stable sort: lines that look like 数字号线 first, then chinese suffix lines.
    lines_out.sort(
        key=lambda l: (
            0 if any(c.isdigit() for c in l["name"]) else 1,
            l["name"],
        )
    )
    print(f"   subway unique lines: {len(lines_out)}")
    write_json(out_dir / "subway.json", lines_out)
