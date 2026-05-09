"""
Build pipeline entry point. Run `python scripts/build_map_data/build.py all`.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    OUT_DIR,
    buffered_ring,
    fetch_ring6_polygon,
    write_json,
)
from steps.districts import build_districts  # noqa: E402
from steps.subway import build_subway  # noqa: E402
from steps.roads import build_roads  # noqa: E402
from steps.water import build_water  # noqa: E402
from steps.parks import build_parks  # noqa: E402
from steps.rail import build_rail  # noqa: E402
from steps.airports import build_airports  # noqa: E402
from steps.pois import build_pois  # noqa: E402
from steps.elev import build_elev  # noqa: E402
from steps.stats import build_stats  # noqa: E402


STEPS = [
    "districts",
    "subway",
    "roads",
    "water",
    "parks",
    "rail",
    "airports",
    "pois",
    "elev",
    "stats",  # always last — depends on geo.json
]


def main() -> None:
    p = argparse.ArgumentParser(description="Build /public/map-data/*.json")
    p.add_argument(
        "step",
        choices=STEPS + ["all", "ring6"],
        help="Pipeline step. Use 'all' for everything.",
    )
    p.add_argument("--refresh", action="store_true", help="Bypass Overpass cache")
    p.add_argument(
        "--buffer-m",
        type=float,
        default=2000,
        help="Buffer (metres) around the ring polygon. Default 2000.",
    )
    args = p.parse_args()

    print(f"==> ring6 polygon (+{args.buffer_m:.0f} m buffer)")
    ring = fetch_ring6_polygon(refresh=args.refresh and args.step in ("ring6", "all"))
    mask = buffered_ring(ring, meters=args.buffer_m)
    minx, miny, maxx, maxy = mask.bounds
    print(
        f"    bounds: lon {minx:.4f}..{maxx:.4f}  lat {miny:.4f}..{maxy:.4f}"
        f"  area_deg2={mask.area:.4f}"
    )

    if args.step == "ring6":
        return

    targets = STEPS if args.step == "all" else [args.step]
    for step in targets:
        t0 = time.time()
        print(f"\n==> {step}")
        fn = {
            "districts": build_districts,
            "subway": build_subway,
            "roads": build_roads,
            "water": build_water,
            "parks": build_parks,
            "rail": build_rail,
            "airports": build_airports,
            "pois": build_pois,
            "elev": build_elev,
            "stats": build_stats,
        }[step]
        fn(mask=mask, out_dir=OUT_DIR, refresh=args.refresh)
        print(f"   {step} done in {time.time()-t0:.1f}s")

    print("\nAll done.")


if __name__ == "__main__":
    main()
