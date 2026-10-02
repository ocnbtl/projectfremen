# Public Map data

## International regions

`world/*.json.gz` contains generalized, country-scoped ADM1 and ADM2 geometry,
2020 modeled population, and population per square kilometre. Only public
statistics are included. `world-regions-catalog.json` records actual coverage;
missing values remain null. This is not a live or universal census database.

Sources, downloaded 2026-10-02:

- World Bank Global Administrative Divisions, September 10, 2026 release:
  https://datacatalog.worldbank.org/search/dataset/0038272/world-bank-official-boundaries
- World Bank Space2Stats ADM2 population summaries, 2020 WorldPop estimates,
  published June 11, 2025:
  https://datacatalog.worldbank.org/search/dataset/0066820/space2stats-database
- Both distributions are CC BY 4.0. Attribution is retained in the application.
  Boundary depiction does not imply endorsement of legal status or claims.

There are 245 countries/territories with boundaries, 212 with some population
coverage, and 34,767 ADM2 units with matching estimates. ADM1 totals are sums
of matched ADM2 values and remain null if any constituent lacks data. Coverage
varies; geographic levels are administrative equivalents, not necessarily named
states/counties. Source definitions and vintages differ from the U.S. ACS.

Matching uses `ADM2CD_c` and `ADM1CD_c`, never names or spatial approximations.
2020 values joined to newer boundaries can have unmatched units; those are
visible as no data. Density uses WGS84 geodesic area of the original polygons,
including inland water where included by the source, rather than land-only area.
Shapes are simplified to 0.005 degrees with topology preservation per feature,
then rounded to four decimal places. Suitable for regional analysis, not surveys
or street-level boundary decisions. Original statistics use a modeled H3 grid
(approximately 36 km² cells); small-area estimates warrant particular care.

Rebuild with Python, shapely 2.1, pyproj 3.8:

1. Download the GeoPackage ADM1 and ADM2 files listed in
   https://datacatalogfiles.worldbank.org/ddh-published/0038272/3/DR0095370/DR0095370.csv
   as `adm1.gpkg` and `adm2.gpkg` into a temporary source folder.
2. Download
   https://datacatalogfiles.worldbank.org/ddh-published/0066820/DR0095354/adm2_space2stats_population_2020.csv
   as `population.csv`.
3. Run `python scripts/prepare-world-regions.py SOURCE_FOLDER` from dashboard.
4. Review coverage and geometry checks before replacing the checked-in snapshot.

The application reads one country/level at a time, with a bounded 12-entry
server cache. No external requests are needed for these regional layers.
Global national indicators continue to use World Bank WDI; U.S. local layers
use the existing ACS providers. Dataset availability is not silently inferred.

## Flag assets

`public/map-flags` includes 50 U.S. state flags and Puerto Rico downloaded
2026-10-02 from Flagpedia/FlagCDN (Wikimedia-derived public flag artwork):
https://flagpedia.net/download/api . D.C. is rendered from its public-domain
geometric flag design. Country flags use the existing country-flag-icons sprite.

## Cartographic scale

The five-step YlGnBu sequential scale is a ColorBrewer analytical encoding,
separate from the module's leaf-green UI palette. Quantiles are the default;
equal intervals remain available. Legends and region details show actual
values, units, source year, and missing-data status. Thematic fills sit beneath
water, roads, administrative lines and labels; attribution remains accessible.
