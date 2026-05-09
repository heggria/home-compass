"""
Aggregate stats for the HUD + a placeholder unmatched.json so the
deal-CSV importer has somewhere to log unresolved xq names.
"""
from __future__ import annotations

import json
from pathlib import Path

from common import write_json


def build_stats(mask, out_dir: Path, refresh: bool = False) -> None:
    geo_path = out_dir / "geo.json"
    if not geo_path.exists():
        print("   geo.json missing — run districts step first")
        return
    geo = json.load(geo_path.open())
    feats = geo.get("features") or []

    n = len(feats)
    n_with = sum(
        1
        for f in feats
        if (f.get("properties") or {}).get("均价") not in (None, 0)
    )
    n_without = n - n_with

    prices = [
        f["properties"].get("均价")
        for f in feats
        if isinstance((f.get("properties") or {}).get("均价"), (int, float))
    ]
    deals = [
        f["properties"].get("成交", 0)
        for f in feats
    ]
    xq = [
        x
        for f in feats
        for x in (f.get("properties") or {}).get("xq_list", [])
    ]

    minx, miny, maxx, maxy = mask.bounds
    stats = {
        "n_polygons": n,
        "n_with_data": n_with,
        "n_no_data": n_without,
        "lon_min": round(minx, 7),
        "lon_max": round(maxx, 7),
        "lat_min": round(miny, 7),
        "lat_max": round(maxy, 7),
        "lon_center": round((minx + maxx) / 2, 7),
        "lat_center": round((miny + maxy) / 2, 7),
        "price_min": round(min(prices), 2) if prices else None,
        "price_max": round(max(prices), 2) if prices else None,
        "price_median": round(sorted(prices)[len(prices) // 2], 2) if prices else None,
        "total_xq": len(xq),
        "total_deals": int(sum(deals)),
    }
    write_json(out_dir / "stats.json", stats)

    # Keep an unmatched.json placeholder if not present, so downstream
    # tooling can append to it without conditional logic.
    um = out_dir / "unmatched.json"
    if not um.exists():
        write_json(um, [])
