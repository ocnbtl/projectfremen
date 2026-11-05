import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { VectorTile, type VectorTileLayer } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { Compression, PMTiles, SharedPromiseCache, type DecompressFunc } from "pmtiles";
import { ADDRESS_COUNTRIES, formatPlaceAddress } from "./place-address";
import type { PlaceSearchResult } from "./place-search";

// The Places archive is keyed by geography, not names. Only tile ranges leave
// the server. The venue text and draft address never go to the archive host.
const catalog = "https://stac.overturemaps.org/catalog.json";
const archiveRoot = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles";
const zoom = 14;
const tileCount = 2 ** zoom;
const mib = 1024 * 1024;
const unzip = promisify(gunzip);
let releaseCache: { version: string; expires: number } | undefined;

async function readBounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new Error("Overture response was empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > limit) {
      await reader.cancel();
      throw new Error("Overture response exceeded the size limit");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data;
}

async function currentRelease(signal: AbortSignal) {
  if (releaseCache && releaseCache.expires > Date.now()) return releaseCache.version;
  const response = await fetch(catalog, { signal, redirect: "error", cache: "no-store" });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Overture catalog is unavailable");
  }
  const { latest } = JSON.parse(new TextDecoder().decode(await readBounded(response, 64 * 1024)));
  if (typeof latest !== "string" || !/^\d{4}-\d\d-\d\d\.\d{1,3}$/.test(latest)) throw new Error("Invalid Overture release");
  releaseCache = { version: latest, expires: Date.now() + 86_400_000 };
  return latest;
}

const decompress: DecompressFunc = async (data, compression) => {
  if (compression === Compression.None) return data;
  if (compression !== Compression.Gzip) throw new Error("Unsupported Overture compression");
  return new Uint8Array(await unzip(new Uint8Array(data), { maxOutputLength: 12 * mib })).buffer;
};

function openArchive(release: string, signal: AbortSignal) {
  const url = `${archiveRoot}/${release}/places.pmtiles`;
  let bytes = 0, calls = 0;
  let unavailable = false;
  return new PMTiles({
    getKey: () => url,
    async getBytes(offset, length) {
      if (unavailable) throw new Error("Overture archive is unavailable");
      bytes += length;
      calls++;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1
        || length > 3 * mib || bytes > 9 * mib || calls > 38) throw new Error("Overture search reached its range limit");
      const end = offset + length - 1;
      const response = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` }, redirect: "error", signal, cache: "no-store" }).catch(error => {
        unavailable = true;
        throw error;
      });
      if (response.status !== 206 || !response.headers.get("content-range")?.startsWith(`bytes ${offset}-${end}/`)) {
        unavailable = true;
        await response.body?.cancel();
        throw new Error("Overture archive range is unavailable");
      }
      const data = await readBounded(response, length);
      if (data.length !== length) throw new Error("Incomplete Overture archive range");
      return { data: data.buffer };
    },
  }, new SharedPromiseCache(32, false, decompress), decompress);
}

const clean = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 240) : "";
const nameKey = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/['’]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/^the /, "");
function nameScore(query: string, words: string[], key: string) {
  if (key === query) return 3;
  if (query.length >= 4 && ` ${key} `.includes(` ${query} `)) return 2;
  // A business may shorten its name at another branch. Require the same first
  // word and at least two other complete words, with just one query word absent.
  if (words.length < 4 || !key.startsWith(words[0] + " ")) return 0;
  const terms = key.split(" ").filter(word => word !== "and");
  return words.filter(word => terms.includes(word)).length >= words.length - 1 ? 1 : 0;
}

type Center = { latitude: number; longitude: number; city?: string };
type ScoredResult = { row: PlaceSearchResult; score: number; distance: number };
type TileIndex = { layer?: VectorTileLayer; keys: string[]; weight: number };
// Released archives are immutable. Reuse nearby tiles across different names
// and adjacent cities, with independent per-request network/deadline budgets.
const tileCache = new Map<string, TileIndex>();
let cacheWeight = 0;
async function tileIndex(archive: PMTiles, release: string, x: number, y: number, signal: AbortSignal) {
  const id = `${release}/${x}/${y}`;
  const hit = tileCache.get(id);
  if (hit) {
    tileCache.delete(id);
    tileCache.set(id, hit);
    return hit;
  }
  const tile = await archive.getZxy(zoom, x, y, signal);
  const layer = tile && new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.place;
  if (layer && layer.length > 12000) throw new Error("Overture tile exceeds the feature limit");
  const keys: string[] = [];
  if (layer) {
    for (let i = 0; i < layer.length; i++) keys.push(nameKey(clean(layer.feature(i).properties["@name"])));
  }
  const indexed = { layer, keys, weight: (tile?.data.byteLength || 0) * 4 + keys.length * 160 + 128 };
  // Concurrent readers can resolve the same immutable tile in either order.
  if (!tileCache.has(id) && indexed.weight <= 24 * mib) {
    tileCache.set(id, indexed);
    cacheWeight += indexed.weight;
    while (cacheWeight > 24 * mib || tileCache.size > 80) {
      const oldest = tileCache.keys().next().value!;
      cacheWeight -= tileCache.get(oldest)!.weight;
      tileCache.delete(oldest);
    }
  }
  return indexed;
}

function matchesInTile(indexed: TileIndex, x: number, y: number, query: string, words: string[], center: Center): ScoredResult[] {
  const { layer, keys } = indexed;
  if (!layer) return [];
  const matches: ScoredResult[] = [];
  for (let i = 0; i < keys.length; i++) {
    const score = nameScore(query, words, keys[i]);
    if (!score) continue;
    const feature = layer.feature(i), props = feature.properties;
    const name = clean(props["@name"]);
    if (feature.type !== 1 || props.operating_status === "permanently_closed") continue;
    const id = clean(props.id);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) continue;
    const geometry = feature.toGeoJSON(x, y, zoom).geometry;
    if (geometry.type !== "Point") continue;
    const [longitude, latitude] = geometry.coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    let address: Record<string, unknown> = {};
    if (typeof props.addresses === "string" && props.addresses.length < 24000) {
      try { address = JSON.parse(props.addresses)?.[0] || {}; } catch { /* A venue may lack a usable address. */ }
    }
    const code = clean(address.country).toUpperCase();
    const countryCode = Object.hasOwn(ADDRESS_COUNTRIES, code) ? code : undefined;
    const parts = { street: clean(address.freeform), city: clean(address.locality), region: clean(address.region), postalCode: clean(address.postcode), district: "" };
    const row = {
      name, latitude, longitude, countryCode, addressParts: parts,
      address: formatPlaceAddress(parts, countryCode || "") || (countryCode ? ADDRESS_COUNTRIES[countryCode].name : ""),
      kind: /^[a-z_]{1,40}$/.test(clean(props.basic_category)) ? clean(props.basic_category) : "venue",
      precision: /^(?:\d+[a-z]?(?:[/-]\d+)?\s+\S)/iu.test(parts.street) ||
        (/\s\d+[a-z]?$/iu.test(parts.street) && !/\b(?:highway|hwy|route|rte|interstate|autobahn|motorway|box)\s+/iu.test(parts.street))
        ? "address" as const : "approximate" as const,
      sourceLabel: "Overture Maps", attributionUrl: "https://docs.overturemaps.org/attribution/#places",
      sourceUrl: `https://explore.overturemaps.org/?feature=places.place.${id}`,
    };
    const deltaLon = Math.abs(longitude - center.longitude);
    const distance = Math.hypot(latitude - center.latitude, Math.min(deltaLon, 360 - deltaLon) * Math.cos(center.latitude * Math.PI / 180));
    const cityMatch = center.city && parts.city && nameKey(parts.city) === nameKey(center.city);
    matches.push({ row, score: score + (cityMatch ? 4 : 0), distance });
  }
  return matches;
}

/** Search at most two rings of full-detail Places tiles around a known locality or street. */
export async function searchOverturePlaces(name: string, center: Center, parentSignal?: AbortSignal): Promise<PlaceSearchResult[]> {
  const query = nameKey(name);
  if (query.length < 2 || name.length > 240 || !Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)
    || Math.abs(center.latitude) > 85.0511 || Math.abs(center.longitude) > 180) return [];
  const timeout = AbortSignal.timeout(8000);
  const signal = parentSignal ? AbortSignal.any([timeout, parentSignal]) : timeout;
  const release = await currentRelease(signal);
  const archive = openArchive(release, signal);
  const words = query.split(" ").filter(word => word !== "and");
  const midX = Math.floor((center.longitude + 180) / 360 * tileCount);
  const midY = Math.floor((1 - Math.asinh(Math.tan(center.latitude * Math.PI / 180)) / Math.PI) * tileCount / 2);
  const matches: ScoredResult[] = [];
  let failure: unknown;
  for (let radius = 0; radius <= 2; radius++) {
    const tiles: { x: number; y: number }[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const y = midY + dy;
        if (y >= 0 && y < tileCount) tiles.push({ x: (midX + dx + tileCount) % tileCount, y });
      }
    }
    for (let start = 0; start < tiles.length; start += 4) {
      const outcomes = await Promise.allSettled(tiles.slice(start, start + 4).map(async ({ x, y }) => {
        signal.throwIfAborted();
        return matchesInTile(await tileIndex(archive, release, x, y, signal), x, y, query, words, center);
      }));
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") matches.push(...outcome.value);
        else failure = outcome.reason;
      }
      if (signal.aborted) break;
    }
    if (signal.aborted || (radius >= 1 && matches.length)) break;
  }
  if (!matches.length && failure) throw failure;
  const seen = new Set<string>();
  return matches.sort((a, b) => b.score - a.score || a.distance - b.distance).filter(({ row }) => {
    if (seen.has(row.sourceUrl!)) return false;
    seen.add(row.sourceUrl!);
    return true;
  }).slice(0, 12).map(({ row }) => row);
}
