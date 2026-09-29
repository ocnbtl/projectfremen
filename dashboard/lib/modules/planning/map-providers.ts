import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import type { FeatureCollection } from "geojson";
type CacheItem = { expires: number; value: unknown };
const cache = new Map<string, CacheItem>();
export async function publicJson(url: string, ttl = 3600000): Promise<any> {
  const previous = cache.get(url);
  if (previous && previous.expires > Date.now()) return previous.value;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Unigentamos/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "The map provider's request limit was reached. Try again later."
        : "The map provider is unavailable. Your saved records are unchanged.",
    );
  const value = await response.json().catch(() => {
    throw new Error(
      "The map provider returned an unavailable or invalid response. Your saved records are unchanged.",
    );
  });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(url, { expires: Date.now() + ttl, value });
  return value;
}
export function validCoordinate(value: unknown, max: number) {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n) || Math.abs(n) > max)
    throw new Error("Invalid map coordinates");
  return n;
}
export async function searchPlaces(query: string) {
  if (query.trim().length < 3 || query.length > 200)
    throw new Error("Enter between 3 and 200 characters");
  const data = await publicJson(
    `https://photon.komoot.io/api/?${new URLSearchParams({ q: query, limit: "8" })}`,
  );
  if (!Array.isArray(data.features))
    throw new Error("Place search returned an unexpected result");
  return data.features.map((feature: any) => ({
    name: feature.properties.name || feature.properties.street || query,
    address: [
      feature.properties.housenumber,
      feature.properties.street,
      feature.properties.city,
      feature.properties.state,
      feature.properties.country,
    ]
      .filter(Boolean)
      .join(", "),
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  }));
}
export async function routeStops(coordinates: unknown, mode: string) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 50
  )
    throw new Error("Choose 2 to 50 stops");
  const points = coordinates.map((x) => {
    if (!Array.isArray(x) || x.length !== 2) throw new Error("Invalid stop");
    return [validCoordinate(x[0], 180), validCoordinate(x[1], 90)];
  });
  const profiles: Record<string, string> = {
    car: "driving-car",
    bike: "cycling-regular",
    walk: "foot-walking",
  };
  if (!profiles[mode])
    throw new Error("Routing supports driving, cycling, and walking");
  const key = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!key)
    throw new Error(
      "Route calculation needs OPENROUTESERVICE_API_KEY on the server. Your stops are saved and remain editable.",
    );
  const cacheKey = JSON.stringify([mode, points]);
  const previous = cache.get(cacheKey);
  if (previous && previous.expires > Date.now()) return previous.value;
  const response = await fetch(
    `https://api.heigit.org/openrouteservice/v2/directions/${profiles[mode]}/geojson`,
    {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: points }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Routing quota reached. Try again later; your itinerary is preserved."
        : "A route could not be calculated for these stops. Try shorter legs or another travel mode.",
    );
  const value = await response.json();
  if (!value.features?.[0]?.geometry)
    throw new Error("The routing provider returned no route");
  cache.set(cacheKey, { expires: Date.now() + 86400000, value });
  return value;
}
export type RegionMetric = {
  id: string;
  name: string;
  value: number | null;
  uncertainty?: number | null;
  year: string;
  longitude?: number;
  latitude?: number;
};
export async function demographics(
  metric: string,
  level: string,
  state: string,
) {
  if (metric === "world-population" || metric === "world-density") {
    const indicator =
      metric === "world-population" ? "SP.POP.TOTL" : "EN.POP.DNST";
    const [data, countries] = await Promise.all([
      publicJson(
        `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&date=2020:2025`,
      ),
      publicJson(
        "https://api.worldbank.org/v2/country?format=json&per_page=400",
      ),
    ]);
    if (!Array.isArray(data?.[1]) || !Array.isArray(countries?.[1]))
      throw new Error("Regional data is temporarily unavailable");
    const countryMap = new Map(
      countries[1]
        .filter((x: any) => x.region?.id !== "NA")
        .map((x: any) => [x.id, x]),
    );
    const rows = new Map<string, RegionMetric>();
    for (const row of data[1]) {
      const country: any = countryMap.get(row.countryiso3code);
      if (!country) continue;
      const previous = rows.get(country.id);
      if (previous?.value !== null && previous?.value !== undefined) continue;
      rows.set(country.id, {
        id: country.id,
        name: country.name,
        value: typeof row.value === "number" ? row.value : null,
        year: row.date,
        longitude: Number(country.longitude),
        latitude: Number(country.latitude),
      });
    }
    return {
      rows: [...rows.values()],
      source: "World Bank",
      sourceUrl: `https://data.worldbank.org/indicator/${indicator}`,
      period: "Latest available, 2020–2025",
      unit: metric === "world-density" ? "people / km²" : "people",
      geography: "Country",
      geometry: countryGeometry([...rows.values()], countries[1]),
      geometryNote:
        "World Bank values joined to generalized Natural Earth country boundaries. Small territories without boundaries remain in the table; unmatched regions are marked as missing.",
    };
  }
  const codes: Record<string, string> = {
    population: "B01003_001",
    age: "B01002_001",
    income: "B19013_001",
  };
  if (!codes[metric] || !["state", "county", "tract"].includes(level))
    throw new Error("Choose a supported demographic layer");
  if (level !== "state" && !/^\d{2}$/.test(state))
    throw new Error(
      "Choose a two-digit US state FIPS code for county or tract data",
    );
  const key = process.env.CENSUS_API_KEY?.trim();
  if (!key)
    throw new Error(
      "US demographic layers need a free Census API key configured on the server. World country layers and your saved places remain available.",
    );
  const query = new URLSearchParams({
    key,
    get: `NAME,${codes[metric]}E,${codes[metric]}M`,
    for: `${level}:*`,
  });
  if (level !== "state") query.set("in", `state:${state}`);
  const data = await publicJson(
    `https://api.census.gov/data/2024/acs/acs5?${query}`,
  );
  if (!Array.isArray(data) || !Array.isArray(data[0]))
    throw new Error("Census data is unavailable for this selection");
  const header: string[] = data[0];
  const number = (value: string) =>
    value != null &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
      ? Number(value)
      : null;
  const rows: RegionMetric[] = data.slice(1).map((row: string[]) => ({
    id: [
      row[header.indexOf("state")],
      row[header.indexOf("county")],
      row[header.indexOf("tract")],
    ]
      .filter(Boolean)
      .join(""),
    name: row[0],
    value: number(row[1]),
    uncertainty: number(row[2]),
    year: "2020–2024",
  }));
  // TIGERweb ACS2024 geography is selected from service metadata, never inferred from a current-vintage layer.
  const service = "tigerWMS_ACS2024";
  const metadata = await publicJson(
    `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/${service}/MapServer?f=pjson`,
  );
  const layer = metadata.layers?.find(
    (x: any) =>
      x.name ===
      (level === "tract"
        ? "Census Tracts"
        : level === "county"
          ? "Counties"
          : "States"),
  );
  let geometry: FeatureCollection | null = null;
  try {
    if (layer) {
      const base = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/${service}/MapServer/${layer.id}/query`;
      const where = level === "state" ? "1=1" : `STATE='${state}'`;
      const ids = await publicJson(
        `${base}?${new URLSearchParams({ f: "json", where, returnIdsOnly: "true" })}`,
      );
      if (!Array.isArray(ids.objectIds) || ids.objectIds.length > 15000)
        throw new Error("Boundary scope unavailable");
      const features: FeatureCollection["features"] = [];
      for (let offset = 0; offset < ids.objectIds.length; offset += 500) {
        const q = new URLSearchParams({
          f: "geojson",
          objectIds: ids.objectIds.slice(offset, offset + 500).join(","),
          outFields: "GEOID,NAME",
          outSR: "4326",
          returnGeometry: "true",
          maxAllowableOffset: level === "tract" ? "0.0005" : "0.01",
        });
        const batch = await publicJson(`${base}?${q}`);
        if (!Array.isArray(batch.features) || batch.exceededTransferLimit)
          throw new Error("Incomplete boundary response");
        features.push(...batch.features);
      }
      if (features.length !== ids.objectIds.length)
        throw new Error("Incomplete boundaries");
      geometry = { type: "FeatureCollection", features };
    }
  } catch {
    /* Statistical values remain usable when the boundary service fails. */
  }
  return {
    rows,
    source: "US Census ACS 5-year",
    sourceUrl: "https://www.census.gov/programs-surveys/acs",
    period: "2020–2024",
    unit: metric === "income" ? "USD" : metric === "age" ? "years" : "people",
    geography: level,
    geometry,
    geometryNote: geometry
      ? undefined
      : "Matching 2024 boundaries are unavailable from TIGERweb. Values remain available in the regional table.",
  };
}

function countryGeometry(
  rows: RegionMetric[],
  countries: { id: string; iso2Code: string; name: string }[],
): FeatureCollection {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const aliases: Record<string, string> = {
    "United States of America": "USA",
    Russia: "RUS",
    "South Korea": "KOR",
    "North Korea": "PRK",
    Iran: "IRN",
    Egypt: "EGY",
    Venezuela: "VEN",
    Bolivia: "BOL",
    Czechia: "CZE",
    "Dem. Rep. Congo": "COD",
    Congo: "COG",
    Laos: "LAO",
    Syria: "SYR",
    Yemen: "YEM",
    "South Sudan": "SSD",
    "Dominican Rep.": "DOM",
    "Central African Rep.": "CAF",
    "Eq. Guinea": "GNQ",
    "Bosnia and Herz.": "BIH",
    "Solomon Is.": "SLB",
    eSwatini: "SWZ",
    "Falkland Is.": "FLK",
  };
  const map = new Map<string, string>();
  for (const c of countries) {
    map.set(c.name, c.id);
    try {
      const name = names.of(c.iso2Code);
      if (name) map.set(name, c.id);
    } catch {}
  }
  const shapes = feature(
    world as never,
    world.objects.countries as never,
  ) as unknown as FeatureCollection;
  return {
    ...shapes,
    features: shapes.features.map((f) => ({
      ...f,
      properties: {
        GEOID:
          aliases[f.properties?.name] ||
          map.get(f.properties?.name) ||
          `atlas-${f.id}`,
        NAME: f.properties?.name,
      },
    })),
  };
}
