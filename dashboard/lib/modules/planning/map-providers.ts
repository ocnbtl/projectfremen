import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import type { FeatureCollection } from "geojson";
import { geoEquirectangular, geoStream } from "d3-geo";
import { readFile } from "node:fs/promises";
import path from "node:path";
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
  if (!codes[metric] || !["state", "county", "place", "tract"].includes(level))
    throw new Error("Choose a supported demographic layer");
  if (level !== "state" && !/^\d{2}$/.test(state))
    throw new Error("Choose a US state for county, city, or tract data");
  const key = process.env.CENSUS_API_KEY?.trim();
  if (!key && level !== "place") return hostedAcs(metric, level, state);
  if (!key) return censusPlaces(metric, state);
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
      row[header.indexOf("place")],
    ]
      .filter(Boolean)
      .join(""),
    name: row[0],
    value: number(row[1]),
    uncertainty: number(row[2]),
    year: "2020–2024",
  }));
  const geometry = await censusGeometry(level, state);
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

async function censusGeometry(
  level: string,
  state: string,
): Promise<FeatureCollection | null> {
  // TIGERweb ACS2024 geography is selected from service metadata, never inferred from a current-vintage layer.
  const service = "tigerWMS_ACS2024";
  try {
    const metadata = await publicJson(
      `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/${service}/MapServer?f=pjson`,
    );
    const layers = metadata.layers?.filter((x: any) =>
      level === "place"
        ? ["Incorporated Places", "Census Designated Places"].includes(x.name)
        : x.name ===
          (level === "tract"
            ? "Census Tracts"
            : level === "county"
              ? "Counties"
              : "States"),
    );
    if (layers?.length) {
      const features: FeatureCollection["features"] = [];
      for (const layer of layers) {
        const base = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/${service}/MapServer/${layer.id}/query`;
        const where = level === "state" ? "1=1" : `STATE='${state}'`;
        const ids = await publicJson(
          `${base}?${new URLSearchParams({ f: "json", where, returnIdsOnly: "true" })}`,
        );
        if (!Array.isArray(ids.objectIds) || ids.objectIds.length > 15000)
          throw new Error("Boundary scope unavailable");
        for (let offset = 0; offset < ids.objectIds.length; offset += 500) {
          const requestedIds = ids.objectIds.slice(offset, offset + 500);
          const q = new URLSearchParams({
            f: "geojson",
            objectIds: requestedIds.join(","),
            outFields: "GEOID,NAME",
            outSR: "4326",
            geometryPrecision: "4",
            returnGeometry: "true",
            maxAllowableOffset: level === "tract" ? "0.0005" : "0.01",
          });
          const batch = await publicJson(`${base}?${q}`);
          if (
            !Array.isArray(batch.features) ||
            batch.features.length !== requestedIds.length ||
            batch.exceededTransferLimit
          )
            throw new Error("Incomplete boundary response");
          features.push(...batch.features);
        }
      }
      return { type: "FeatureCollection", features };
    }
  } catch {
    /* Statistical values remain usable when the boundary service fails. */
  }
  return null;
}

type CensusPlaces = {
  period: string;
  source: string;
  sourceUrl: string;
  rows: [string, ...Array<number | null>][];
};
let placeData: Promise<CensusPlaces> | undefined;
async function censusPlaces(metric: string, state: string) {
  // Only public summary statistics are bundled. No account, API key, or private
  // records are required. Rebuild with scripts/prepare-census-places.mjs.
  placeData ||= readFile(
    path.join(process.cwd(), "data/map/census-places-2024.json"),
    "utf8",
  )
    .then((text) => JSON.parse(text) as CensusPlaces)
    .catch((error) => {
      placeData = undefined;
      throw error;
    });
  const data = await placeData;
  const geometry = await censusGeometry("place", state);
  const names = new Map(
    geometry?.features.map((f) => [
      String(f.properties?.GEOID),
      String(f.properties?.NAME),
    ]),
  );
  const column = metric === "population" ? 1 : metric === "age" ? 3 : 5;
  const rows: RegionMetric[] = data.rows
    .filter((row) => row[0].startsWith(state))
    .map((row) => ({
      id: row[0],
      name: names.get(row[0]) || `Place ${row[0]}`,
      value: row[column] as number | null,
      uncertainty: row[column + 1] as number | null,
      year: data.period,
    }));
  if (!rows.length)
    throw new Error(
      "No published city or town estimates are available for this state.",
    );
  const unmatched = rows.filter((row) => !names.has(row.id)).length;
  return {
    rows,
    source: data.source,
    sourceUrl: data.sourceUrl,
    period: data.period,
    unit: metric === "income" ? "USD" : metric === "age" ? "years" : "people",
    geography: "place",
    geometry,
    geometryNote: geometry
      ? `Incorporated cities and towns, plus Census-designated places. Areas outside these boundaries are not city estimates.${unmatched ? ` ${unmatched} published estimates have no matching boundary and remain in the table under their Census GEOIDs.` : ""}`
      : "Matching 2024 boundaries and place names are unavailable from TIGERweb. Estimates remain in the table under their Census GEOIDs.",
  };
}

// Esri's public ACS views are an independent public distribution of Census
// estimates, paired with matching boundaries. No account or private key is sent.
async function hostedAcs(metric: string, level: string, state: string) {
  const catalog: Record<string, [string, string, string]> = {
    population: [
      "ACS_Population_View_Boundaries",
      "B01001_001",
      "60c98f20a162416ea1725b94d7297f83",
    ],
    age: [
      "ACS_Median_Age_View_Boundaries",
      "B01002_001",
      "c7460842a973427bbbc30758274219df",
    ],
    income: [
      "ACS_Median_Household_Income_View_Boundaries",
      "B19049_001",
      "c9faa265b82848498bc0a8390c0afa65",
    ],
  };
  const [service, variable, itemId] = catalog[metric];
  const base = `https://P3ePLMYs2RVChkJx.svcs.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/${service}/FeatureServer/${level === "state" ? 0 : level === "county" ? 1 : 2}`;
  const item = await publicJson(
    `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`,
    86400000,
  );
  const vintage = String(item.description || "")
    .replace(/<[^>]*>/g, "")
    .match(/Current Vintage\s*:\s*(\d{4}[-–]\d{4})/i)?.[1];
  if (!vintage)
    throw new Error(
      "The public ACS release date could not be verified. Try again later.",
    );
  const where = level === "state" ? "1=1" : `GEOID LIKE '${state}%'`;
  const count = await publicJson(
    `${base}/query?${new URLSearchParams({ f: "json", where, returnCountOnly: "true" })}`,
  );
  if (!Number.isInteger(count.count) || count.count < 1 || count.count > 15000)
    throw new Error("This region's ACS data is unavailable.");
  const features: FeatureCollection["features"] = [];
  // Bound concurrency so a large state's tracts fit within a server request.
  const offsets = Array.from(
    { length: Math.ceil(count.count / 500) },
    (_, i) => i * 500,
  );
  for (let start = 0; start < offsets.length; start += 3) {
    const batches = await Promise.all(
      offsets.slice(start, start + 3).map(async (offset) => {
        const data = await publicJson(
          `${base}/query?${new URLSearchParams({
            f: "geojson",
            where,
            outFields: `GEOID,NAME,${variable}E,${variable}M`,
            returnGeometry: "true",
            outSR: "4326",
            geometryPrecision: "4",
            maxAllowableOffset: level === "tract" ? "0.0005" : "0.01",
            resultOffset: String(offset),
            resultRecordCount: "500",
            orderByFields: "GEOID",
          })}`,
          86400000,
        );
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features))
          throw new Error(
            "The public ACS service returned an incomplete map. Try again later.",
          );
        return data.features as FeatureCollection["features"];
      }),
    );
    for (const batch of batches) features.push(...batch);
  }
  if (
    features.length !== count.count ||
    new Set(features.map((f) => f.properties?.GEOID)).size !== count.count
  )
    throw new Error("The public ACS response is incomplete. Try again later.");
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  return {
    rows: features.map((f) => ({
      id: String(f.properties?.GEOID),
      name: String(f.properties?.NAME),
      value: number(f.properties?.[`${variable}E`]),
      uncertainty: number(f.properties?.[`${variable}M`]),
      year: vintage,
    })),
    source: "US Census ACS · Esri public distribution",
    sourceUrl: `https://www.arcgis.com/home/item.html?id=${itemId}`,
    period: vintage,
    unit: metric === "income" ? "USD" : metric === "age" ? "years" : "people",
    geography: level,
    geometry: { type: "FeatureCollection" as const, features },
    geometryNote:
      "ACS five-year estimates with margins of error. Boundaries and values come from the same release.",
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
    Turkey: "TUR",
    Macedonia: "MKD",
  };
  const nameKey = (name: string) =>
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
  const map = new Map<string, string>();
  for (const c of countries) {
    map.set(nameKey(c.name), c.id);
    try {
      const name = names.of(c.iso2Code);
      if (name) map.set(nameKey(name), c.id);
    } catch {}
  }
  const shapes = feature(
    world as never,
    world.objects.countries as never,
  ) as unknown as FeatureCollection;
  return {
    ...shapes,
    features: shapes.features
      .filter((f) => f.properties?.name !== "Antarctica")
      .map((f) => ({
        ...f,
        geometry: clipCountry(f.geometry),
        properties: {
          GEOID:
            aliases[f.properties?.name] ||
            map.get(nameKey(f.properties?.name || "")) ||
            `atlas-${f.id}`,
          NAME: f.properties?.name,
        },
      })),
  };
}

// Natural Earth's spherical rings can cross ±180°. Clip on the sphere before
// handing planar GeoJSON to MapLibre, avoiding triangles across the whole map.
export function clipCountry(geometry: GeoJSON.Geometry): GeoJSON.MultiPolygon {
  const polygons: number[][][][] = [];
  let polygon: number[][][] = [],
    ring: number[][] = [];
  const projection = geoEquirectangular()
    .scale(180 / Math.PI)
    .translate([0, 0])
    .precision(0.1);
  geoStream(
    geometry,
    projection.stream({
      point(x, y) {
        ring.push([Math.max(-180, Math.min(180, x)), -y]);
      },
      lineStart() {
        ring = [];
      },
      lineEnd() {
        if (ring.length) {
          ring.push([...ring[0]]);
          polygon.push(ring);
        }
      },
      polygonStart() {
        polygon = [];
      },
      polygonEnd() {
        if (polygon.length) polygons.push(polygon);
      },
      sphere() {},
    }),
  );
  return { type: "MultiPolygon", coordinates: polygons };
}
