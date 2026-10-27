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

### Additional regional indicators (prepared October 27, 2026)

`regional-indicators/*.json.gz` adds six public statistical layers to the existing
ADM1/ADM2 boundaries: population shares under 15, ages 15–64, ages 65+, female,
urban, and rural. The first four use the 2020 WorldPop age/sex fields in the
population CSV above. Age bands 0, 1, 5, 10 cover ages 0–14; bands 15–60 cover
15–64; bands 65–80 cover 65 and older. These are modeled demographic shares,
not counts from a current census or employment rates.

Urban/rural shares use the World Bank GHS-SMOD/GHS-Pop summary:
https://datacatalogfiles.worldbank.org/ddh-published/0066820/DR0095357/adm2_urbanization_ghssmod.csv
Classes 21, 22, 23, 30 comprise suburban areas, urban clusters and urban centres;
classes 11–13 comprise rural areas. Shares divide these class populations by
`ghs_total_pop`, not WorldPop population. The CSV and STAC metadata do not supply
an observation year, so the UI explicitly shows it as unavailable. June 2025 is
the publication date, not a claimed observation year. Definitions:
https://raw.githubusercontent.com/worldbank/DECAT_Space2Stats/refs/heads/main/space2stats_api/src/space2stats_ingest/METADATA/stac/space2stats-collection/urbanization_ghssmod/urbanization_ghssmod.json

Run `node scripts/prepare-regional-indicators.cjs SOURCE_DIR` with `population.csv`
and `urbanization.csv` downloaded from these public sources. The preparation is
offline and only adds public data sidecars; it does not change existing geometry,
population values or private records. Source SHA-256 hashes and rejected rows are
in `regional-indicators/sources.json`. Data retain the source's CC BY 4.0 license.

Only exact IDs within the same ISO3 country are joined. Missing, negative,
nonfinite or invalid percentage observations remain null. Provincial shares use
sums of numerators and denominators across every child district, never averages
of district shares; a missing/invalid child makes its provincial share null.
Published zero-population districts have no percentage (0/0), but their known
zero counts can contribute to a valid provincial total. They are recorded in
the source manifest separately from missing values.
One source observation exceeding 100% was rejected (USA023066, ages 65+).
`regional-indicator-coverage.json` reports actual non-null counts per metric and
level for 245 boundary-covered countries/territories. This does not imply every
country or region has every indicator. National GDP, income, life expectancy,
etc. must not be copied into provinces or districts to fill gaps.

For Canada, valid coverage is 287–293 of 295 districts and 9–12 of 13 provinces,
depending on the new layer. All gaps remain visible as no data. At runtime only
the selected country's small sidecar is read, in a bounded 12-country cache.
No new live provider calls, scheduled refreshes or runtime spatial joins are used.

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

## Additional U.S. Census indicators (October 27, 2026)

`acs-indicators/*.json.gz` bundles six public 2024 ACS 5-year estimates and their
90% margins of error: per capita income (B19301), median owner-occupied home value
(B25077), median gross rent (B25064), housing units (B25001), households (B11001),
and average household size (B25010). All use published column 001. Gross rent
includes utilities; home value is not a recent sale price. Dollar amounts are
inflation-adjusted to 2024. Negative Census sentinels remain null.

Sources: https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html
Run `node scripts/prepare-acs-indicators.mjs` to rebuild the public extracts.
`sources.json` records the exact official URL, SHA-256, table and row count.
157 small geographic files cover states, counties, places and census tracts.
Only the selected scope is loaded, with a bounded twelve-file cache. No private
records are modified, and no new live downloads are needed for these estimates.
Geometry uses the existing TIGERweb ACS2024 service. Data gaps and unmatched IDs
remain explicit; these layers cannot combine with different ACS release years.

## Regional light change and flood exposure

The same World Bank Space2Stats release supplies two additional ADM2 summaries:
- `adm2_VIIRS.csv` (DR0095356): summed annual VIIRS night lights. Displayed change
  is 100 * (2024 / 2014 - 1). A zero baseline has no defined percentage. This is
  a proxy for nighttime activity, not a GDP estimate.
- `adm2_flood_exposure_15cm_1in100.csv` (DR0095355): gridded 2020 population exposed
  to modeled flooding deeper than 15 cm under a 1-in-100-year scenario. The share
  is computed from the published exposed and total population counts, not the
  ambiguous `pop_flood_pct` column. It is not a forecast or property risk score.

Download these as `nightlights.csv` and `flood.csv` alongside `population.csv` and
`urbanization.csv` before running `prepare-regional-indicators.cjs`. Source hashes
and zero denominators are retained in the manifest. Provincial values aggregate
counts before computing rates. Missing child observations keep a province null.
The two additions bring international regional choices to ten; coverage varies
by country and layer. The twelve existing country-level indicators are retained.
