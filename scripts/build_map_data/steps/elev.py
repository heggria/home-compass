"""
Elevation grid covering the ring bbox.

We keep the same schema the EquirectProjector reads:

    {rows, cols, lat_min, lat_max, lon_min, lon_max,
     elev_min, elev_max, data: [number, ...]}

Until we wire in a proper DEM (SRTM / ASTER), we emit a flat grid at
~Beijing's average elevation (~50 m). The runtime treats null/zero as
"no relief" so visuals don't break.
"""
from __future__ import annotations

from pathlib import Path

from common import write_json


def build_elev(mask, out_dir: Path, refresh: bool = False) -> None:
    minx, miny, maxx, maxy = mask.bounds
    rows = cols = 160
    flat = 50.0
    data = [flat] * (rows * cols)
    grid = {
        "rows": rows,
        "cols": cols,
        "lat_min": round(miny, 6),
        "lat_max": round(maxy, 6),
        "lon_min": round(minx, 6),
        "lon_max": round(maxx, 6),
        "elev_min": flat,
        "elev_max": flat,
        "data": data,
    }
    write_json(out_dir / "elev.json", grid)
