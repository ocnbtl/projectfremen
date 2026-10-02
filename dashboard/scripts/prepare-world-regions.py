"""Build compact, country-scoped public map data from World Bank downloads.

Usage: python prepare-world-regions.py SOURCE_DIR
Requires shapely 2.1 and pyproj 3.8. SOURCE_DIR contains adm1.gpkg,
adm2.gpkg and population.csv; see data/map/README.md for provenance.
Never joins by place name or substitutes a missing value with zero.
"""
import csv
import gzip
import json
import math
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path
from shapely import from_wkb, to_geojson
from shapely.geometry.polygon import orient
from pyproj import Geod

source = Path(sys.argv[1])
output = Path(__file__).resolve().parents[1] / "data/map/world"
output.mkdir(parents=True, exist_ok=True)
geod = Geod(ellps="WGS84")
pop = {}
with (source / "population.csv").open(encoding="utf-8-sig", newline="") as f:
    for row in csv.DictReader(f):
        value = row["sum_pop_2020"]
        if value and math.isfinite(float(value)) and float(value) >= 0:
            if row["ADM2CD_c"] in pop:
                raise ValueError("Duplicate population ID")
            pop[row["ADM2CD_c"]] = float(value)

countries = {}
parents = defaultdict(list)
seen = set()
for level in (2, 1):
    database = sqlite3.connect(source / f"adm{level}.gpkg")
    database.row_factory = sqlite3.Row
    table = database.execute("select table_name from gpkg_contents").fetchone()[0]
    grouped = defaultdict(list)
    for raw in database.execute(f'SELECT * FROM "{table}"'):
        row = dict(raw)
        iso = row["ISO_A3"]
        if not iso or len(iso) != 3 or not iso.isalpha():
            continue
        ident = row[f"ADM{level}CD_c"]
        if (level, ident) in seen:
            raise ValueError(f"Duplicate boundary ID: {ident}")
        seen.add((level, ident))
        blob = row["geom"]
        envelope = (blob[3] >> 1) & 7
        offset = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[envelope]
        geometry = from_wkb(blob[offset:])
        # Geodesic polygon area excludes holes, independent of ring winding.
        polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
        area = sum(abs(geod.geometry_area_perimeter(orient(p, sign=1))[0]) for p in polygons) / 1e6
        value = pop.get(ident) if level == 2 else None
        if level == 2:
            parents[row["ADM1CD_c"]].append(value)
        else:
            children = parents.get(ident, [])
            # A partially covered province must not masquerade as a full total.
            if children and all(v is not None for v in children):
                value = sum(children)
        simple = geometry.simplify(0.005, preserve_topology=True)
        shape = json.loads(to_geojson(simple))
        def rounded(coords):
            return [round(v, 4) if isinstance(v, (int, float)) else rounded(v) for v in coords]
        shape["coordinates"] = rounded(shape["coordinates"])
        grouped[iso].append({"type": "Feature", "properties": {
            "GEOID": ident, "NAME": row[f"NAM_{level}"],
            "parent": row["ADM1CD_c"], "parentName": row["NAM_1"],
            "population": round(value) if value is not None else None,
            "density": round(value / area, 1) if value is not None and area > 0 else None,
        }, "geometry": shape})
        countries.setdefault(iso, {"code": iso, "iso2": row["ISO_A2"], "name": row["NAM_0"], "levels": {}})
    for iso, features in grouped.items():
        features.sort(key=lambda f: f["properties"]["GEOID"])
        available = sum(f["properties"]["population"] is not None for f in features)
        countries[iso]["levels"][str(level)] = {"regions": len(features), "available": available}
        payload = json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"), ensure_ascii=False).encode()
        (output / f"{iso}-{level}.json.gz").write_bytes(gzip.compress(payload, mtime=0))
    database.close()

catalog = sorted(countries.values(), key=lambda c: c["name"])
(output.parent / "world-regions-catalog.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"countries": len(catalog), "populationCountries": sum(any(l["available"] for l in c["levels"].values()) for c in catalog), "adm2": sum(c["levels"].get("2", {}).get("available", 0) for c in catalog), "bytes": sum(p.stat().st_size for p in output.glob("*.gz"))}))
