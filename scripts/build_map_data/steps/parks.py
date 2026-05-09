"""
Parks (and large green spaces) inside the ring.

Output:
   parks.json: [{name, geom: [[lng,lat], ...]}, ...]
"""
from __future__ import annotations

from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

from common import overpass, write_json

QUERY = """
[out:json][timeout:240];
(
  way["leisure"="park"]({bbox});
  relation["leisure"="park"]({bbox});
  way["leisure"="garden"]({bbox});
  relation["leisure"="garden"]({bbox});
  way["leisure"="nature_reserve"]({bbox});
  relation["leisure"="nature_reserve"]({bbox});
  way["landuse"="forest"]({bbox});
  relation["landuse"="forest"]({bbox});
);
out geom;
"""


def _bbox(mask) -> str:
    minx, miny, maxx, maxy = mask.bounds
    return f"{miny},{minx},{maxy},{maxx}"


def _polys(raw: dict) -> list[tuple[Polygon, str]]:
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
                    out.append((p, name))
            except Exception:
                pass
    return out


def build_parks(mask, out_dir: Path, refresh: bool = False) -> None:
    raw = overpass(QUERY.format(bbox=_bbox(mask)), "parks", refresh=refresh)
    polys = _polys(raw)
    print(f"   raw park polygons: {len(polys)}")

    out = []
    for p, name in polys:
        clipped = p.intersection(mask)
        if clipped.is_empty:
            continue
        parts = clipped.geoms if isinstance(clipped, MultiPolygon) else [clipped]
        for part in parts:
            if part.is_empty or part.area < 5e-8:  # drop tiny slivers
                continue
            out.append(
                {
                    "name": name,
                    "geom": [[round(x, 7), round(y, 7)] for x, y in part.exterior.coords],
                }
            )
    print(f"   parks kept: {len(out)}")
    write_json(out_dir / "parks.json", out)
