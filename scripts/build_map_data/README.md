# `scripts/build_map_data/`

Build pipeline for `public/map-data/*.json`. Pulls everything from
OpenStreetMap via Overpass, clips to the **Beijing 6th Ring Road**
(plus a small buffer), and writes the same set of files the runtime
layers already consume — so the front-end needs zero changes.

## One-shot run

```bash
# create venv (only needed once)
uv venv .venv-mapdata --python 3.11
source .venv-mapdata/bin/activate
uv pip install shapely pyproj requests numpy osmium

# pull + build everything (raw responses cached under data-raw/)
python scripts/build_map_data/build.py all

# or rebuild a single target
python scripts/build_map_data/build.py roads --refresh
```

## What each step produces

| step          | output file(s)                                       |
| ------------- | ---------------------------------------------------- |
| `ring6`       | `data-raw/ring6_polygon.geojson` (cache)             |
| `districts`   | `public/map-data/geo.json`                           |
| `subway`      | `public/map-data/subway.json`                        |
| `roads`       | `public/map-data/roads.json`, `road_counts.json`, `road_styles.json` |
| `water`       | `public/map-data/water_polys.json`, `water_lines.json` |
| `parks`       | `public/map-data/parks.json`                         |
| `rail`        | `public/map-data/rail_lines.json`, `rail_stations.json` |
| `airports`    | `public/map-data/airport_polys.json`, `runway_lines.json`, `helipads.json` |
| `pois`        | `public/map-data/poi_cats.json`                      |
| `elev`        | `public/map-data/elev.json` (flat placeholder grid)  |
| `stats`       | `public/map-data/stats.json`, `unmatched.json`       |
| `all`         | runs every step in order                             |

Re-runs are idempotent. Pass `--refresh` to drop the cached Overpass
responses for that step and re-fetch from the network.

## Source / scope

- Boundary: OSM relation `295982` (六环 / G4501), stitched into a
  closed polygon and buffered by **2 km** so neighbourhoods that sit
  right on the ring (亦庄、通州 etc.) are included.
- Tags follow OSM defaults — see each builder for the exact filters.
- Transaction-derived fields (`成交 / 均价 / 均面积 / 均总价`) are
  emitted as `0 / null` placeholders. Wire them in once you have the
  deal CSV, no schema change needed.
