import { readFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import type { FeatureCollection } from "geojson";
import catalog from "../../../data/map/world-regions-catalog.json";
import type { MapData } from "./map-analysis";
import { MAP_CATALOG } from "./map-catalog";

const unzip = promisify(gunzip);
const cache = new Map<string, Promise<FeatureCollection>>();
type Indicators = Record<string, Record<string, Record<string, number | null>>>;
const indicators = new Map<string, Promise<Indicators>>();
function regionalIndicators(country: string) {
  let pending = indicators.get(country);
  if (!pending) {
    if (indicators.size >= 12) indicators.delete(indicators.keys().next().value!);
    pending = readFile(path.join(process.cwd(), "data/map/regional-indicators", `${country}.json.gz`))
      .then(buffer => unzip(buffer)).then(buffer => JSON.parse(buffer.toString("utf8")) as Indicators)
      .catch(error => { indicators.delete(country); throw error; });
    indicators.set(country, pending);
  }
  return pending;
}
/** Only public, prepared World Bank data enters this bounded process cache. */
export async function worldRegions(metric: string, level: string, country: string): Promise<MapData> {
  const entry = catalog.find((c) => c.code === country);
  if (!entry || !["state", "county"].includes(level) ||
      !metric.startsWith("regional-") || !Object.hasOwn(MAP_CATALOG, metric))
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
  const extra = !["regional-population", "regional-density"].includes(metric);
  const values = extra ? (await regionalIndicators(entry.code))[level]?.[metric] : undefined;
  const urban = ["regional-urban", "regional-rural"].includes(metric);
  const rows = geometry.features.map((f) => ({
    id: String(f.properties?.GEOID),
    name: level === "county" ? `${f.properties?.NAME} · ${f.properties?.parentName}` : String(f.properties?.NAME),
    value: extra ? values?.[String(f.properties?.GEOID)] ?? null : typeof f.properties?.[field] === "number" ? f.properties[field] as number : null,
    year: urban ? "Reference year unavailable" : "2020",
  }));
  const missing = rows.filter((r) => r.value === null).length;
  return {
    rows, geometry,
    source: `World Bank Space2Stats · ${urban ? "GHS-SMOD / GHS-Pop" : "WorldPop"}`,
    sourceUrl: "https://datacatalog.worldbank.org/search/dataset/0066820/space2stats-database",
    period: "Space2Stats June 2025 release · September 2026 boundaries",
    unit: MAP_CATALOG[metric].unit,
    geography: `${entry.name} · ${level === "state" ? "States / provinces (ADM1)" : "Counties / districts (ADM2)"}`,
    geometryNote: `${urban ? "GHS settlement classes 21–30 are urban; 11–13 are rural. The published summary does not specify the observation year; June 2025 is its release date, not its observation year. These shares use GHS population, not WorldPop totals." : "Modeled 2020 population, not current census counts. Density uses geodesic boundary area."} Provincial shares use summed source counts, not averages of district percentages; incomplete provinces remain no data. Administrative levels vary by country. ${missing ? `${missing} of ${rows.length} regions lack valid matching estimates and are shown as no data. ` : ""}Generalized World Bank boundaries, CC BY 4.0; boundary depiction does not imply endorsement.`,
  };
}
