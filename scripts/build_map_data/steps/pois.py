"""
POI categories that the AmenityLayer renders. Schema:

    {
      "<category_key>": {
        "name": <Chinese label>,
        "color": "#RRGGBB",
        "items": [{"name": ..., "lon": ..., "lat": ...}, ...]
      },
      ...
    }
"""
from __future__ import annotations

from pathlib import Path

from common import overpass, write_json

CATEGORIES = [
    # key, label, color, overpass tag filter
    ("subway_station", "地铁站", "#00E5FF",
        '["railway"="station"]["station"="subway"]'),
    ("subway_entrance", "地铁口", "#7FE9FF",
        '["railway"="subway_entrance"]'),
    ("hospital", "医院", "#FF4D6D",
        '["amenity"="hospital"]'),
    ("school", "学校", "#4DA8FF",
        '["amenity"="school"]'),
    ("kindergarten", "幼儿园", "#4DC4FF",
        '["amenity"="kindergarten"]'),
    ("university", "高校", "#7B68EE",
        '["amenity"="university"]'),
    ("supermarket", "超市", "#FFD93D",
        '["shop"="supermarket"]'),
    ("mall", "商场", "#FF8C42",
        '["shop"="mall"]'),
    ("convenience", "便利店", "#FFA94D",
        '["shop"="convenience"]'),
    ("marketplace", "市场", "#FFB84D",
        '["amenity"="marketplace"]'),
]


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    return f"{miny},{minx},{maxy},{maxx}"


def _build_query(filt: str, bbox: str) -> str:
    # Pull both nodes and ways; for ways we use `out center` so we get a point.
    return f"""
[out:json][timeout:240];
(
  node{filt}({bbox});
  way{filt}({bbox});
  relation{filt}({bbox});
);
out center;
"""


def build_pois(mask, out_dir: Path, refresh: bool = False) -> None:
    bbox = _bbox(mask)
    out: dict[str, dict] = {}
    minx, miny, maxx, maxy = mask.bounds

    for key, label, color, filt in CATEGORIES:
        raw = overpass(_build_query(filt, bbox), f"poi_{key}", refresh=refresh)
        items: list[dict] = []
        seen = set()
        for el in raw.get("elements", []):
            if el.get("type") == "node":
                lon, lat = el["lon"], el["lat"]
            elif el.get("center"):
                lon, lat = el["center"]["lon"], el["center"]["lat"]
            else:
                continue
            if not (minx <= lon <= maxx and miny <= lat <= maxy):
                continue
            name = (el.get("tags") or {}).get("name", "")
            k = (round(lon, 5), round(lat, 5), name)
            if k in seen:
                continue
            seen.add(k)
            items.append({"name": name, "lon": lon, "lat": lat})
        print(f"   {key}: {len(items)}")
        out[key] = {"name": label, "color": color, "items": items}

    write_json(out_dir / "poi_cats.json", out)
