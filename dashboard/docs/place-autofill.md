# Worldwide place autofill

Map, Calendar, People and organization forms use the same authenticated lookup.
Searching and selecting a suggestion update the draft; saving is a separate action.

- [Photon](https://github.com/komoot/photon) searches OpenStreetMap for areas,
  addresses and named features. Typeahead stays on this path.
- Explicit autofill can also look up named venues in nearby [Overture Places
  tiles](https://docs.overturemaps.org/examples/overture-tiles/). It reads
  bounded ranges and caches recently decoded neighborhoods in memory. The
  archive receives tile requests, not the typed name. See [Places contributors,
  licenses and notices](https://docs.overturemaps.org/attribution/#places).
- Locality search uses a reduced [GeoNames](https://www.geonames.org/) city
  index (2026-11-04 snapshot, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
  To refresh it, download and extract `cities5000.zip` and
  `admin1CodesASCII.txt` from the [GeoNames dump](https://download.geonames.org/export/dump/);
  run `node scripts/build-place-localities.cjs cities5000.txt admin1CodesASCII.txt`
  from the dashboard. The derivative retains names, administrative identifiers
  and rounded city centers. These centers guide a bounded venue search; they
  are never passed off as the business's coordinates.

For a small venue, enter its name and city, and include the street if known.
Directory coverage, local spelling, nearby branches, former addresses and
businesses outside the search neighborhood can affect results. Suggestions
remain explicit even when the two sources disagree. No scheduled crawling,
paid service, or migration of saved places is required.
