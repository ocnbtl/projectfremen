import { readFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import type { FeatureCollection } from "geojson";
import catalog from "../../../data/map/world-regions-catalog.json";
import type { MapData } from "./map-analysis";

const unzip = promisify(gunzip);
const cache = new Map<string, Promise<FeatureCollection>>();
/** Only public, prepared World Bank data enters this bounded process cache. */
export async function worldRegions(metric: string, level: string, country: string): Promise<MapData> {
  const entry = catalog.find((c) => c.code === country);
  if (!entry || !["state", "county"].includes(level) ||
      !["regional-population", "regional-density"].includes(metric))
    throw new Error("Choose a supported country, regional level and data layer.");
  const key = `${entry.code}-${level === "state" ? 1 : 2}`;
  let pending = cache.get(key);
  if (!pending) {
    if (cache.size >= 12) cache.delete(cache.keys().next().value!);
    pending = readFile(path.join(process.cwd(), "data/map/world", `${key}.json.gz`))
      .then((buffer) => unzip(buffer))
      .then((buffer) => JSON.parse(buffer.toString("utf8")) as FeatureCollection)
      .catch((error) => { cache.delete(key); throw error; });
    cache.set(key, pending);
  }
  const geometry = await pending;
  const field = metric === "regional-density" ? "density" : "population";
  const rows = geometry.features.map((f) => ({
    id: String(f.properties?.GEOID),
    name: level === "county" ? `${f.properties?.NAME} · ${f.properties?.parentName}` : String(f.properties?.NAME),
    value: typeof f.properties?.[field] === "number" ? f.properties[field] as number : null,
    year: "2020",
  }));
  const missing = rows.filter((r) => r.value === null).length;
  return {
    rows, geometry,
    source: "World Bank Space2Stats · WorldPop",
    sourceUrl: "https://datacatalog.worldbank.org/search/dataset/0066820/space2stats-database",
    period: "2020 modeled population · September 2026 boundaries",
    unit: field === "density" ? "people / km²" : "people",
    geography: `${entry.name} · ${level === "state" ? "States / provinces (ADM1)" : "Counties / districts (ADM2)"}`,
    geometryNote: `Modeled estimates, not current census counts. Density uses geodesic boundary area. Administrative levels vary by country. ${missing ? `${missing} of ${rows.length} regions lack matching estimates and are shown as no data. ` : ""}Generalized World Bank boundaries, CC BY 4.0; boundary depiction does not imply endorsement.`,
  };
}
