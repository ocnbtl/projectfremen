import { ADDRESS_COUNTRIES, formatPlaceAddress, splitPastedAddress, type AddressParts } from "./place-address";
export type PlaceSearchResult = { name: string; address: string; latitude: number; longitude: number; countryCode?: string; addressParts?: AddressParts; kind?: string; precision?: "address" | "area" | "approximate"; sourceUrl?: string };
export function placeFromSearch(match: PlaceSearchResult) {
  return { name: match.name, address: match.address, countryCode: match.countryCode || "", addressParts: match.addressParts || { street: "", city: "", region: "", postalCode: "", district: "" }, latitude: match.latitude, longitude: match.longitude,
    lookup: { ...(match.sourceUrl ? { sourceId: match.sourceUrl } : {}), kind: match.kind || "place", precision: match.precision || "approximate" as const } };
}

/** Name lookup is worldwide, independent of a draft's old/default address country.
 * Ranking only helps display choices; it never decides which place to save. */
export async function searchFullPlace(query: string, search: (query: string) => Promise<PlaceSearchResult[]>): Promise<PlaceSearchResult[]> {
  const name = query.trim();
  if (name.length < 2 || name.length > 500 || /^https?:\/\//i.test(name)) throw new Error("Enter a place name or address between 2 and 500 characters");
  const key = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/^the\s+/, "").replace(/s$/, "").trim();
  const wanted = key(name), seen = new Set<string>();
  return (await search(name)).filter(row => {
    const id = row.sourceUrl || `${row.name}|${row.latitude}|${row.longitude}`;
    if (seen.has(id)) return false; seen.add(id); return true;
  }).sort((a, b) => Number(key(b.name) === wanted) - Number(key(a.name) === wanted)).slice(0, 8);
}

export type CoordinateSearchOptions = { name?: string; countryCode?: string; addressParts?: AddressParts };
/** Search the named venue in its locality separately: a street query can favor tenants. */
export async function searchPlaceCoordinates(address: string, options: CoordinateSearchOptions, search: (query: string, country?: string) => Promise<PlaceSearchResult[]>): Promise<PlaceSearchResult[]> {
  if (address.trim().length < 3 || address.length > 500) throw new Error("Enter between 3 and 500 address characters");
  const country = options.countryCode;
  const parsed = splitPastedAddress(options.addressParts?.street || address, country) || splitPastedAddress(address, country);
  const parts = options.addressParts ? { ...options.addressParts, city: options.addressParts.city || parsed?.city || "", region: options.addressParts.region || parsed?.region || "", postalCode: options.addressParts.postalCode || parsed?.postalCode || "" } : parsed;
  const locality = parts && (parts.city || parts.region || parts.postalCode) ? [parts.city, parts.region, parts.postalCode, country ? ADDRESS_COUNTRIES[country]?.name : ""].filter(Boolean).join(", ") : "";
  const name = options.name?.trim().slice(0, 240);
  const namedQuery = name && locality ? `${name}, ${locality}` : "";
  const queries = [...new Set([namedQuery, address.trim()].filter(Boolean))];
  const results = await Promise.allSettled(queries.map(query => search(query, country)));
  // If an address cannot be split locally, use the provider's locality to look up
  // the venue rather than silently dropping the name and returning only tenants.
  if (name && !namedQuery) {
    const match = results.flatMap(result => result.status === "fulfilled" ? result.value : []).find(row => row.addressParts?.city && (!country || row.countryCode === country));
    if (match?.addressParts) {
      const area = [match.addressParts.city, match.addressParts.region, match.addressParts.postalCode, country ? ADDRESS_COUNTRIES[country]?.name : ""].filter(Boolean).join(", ");
      results.unshift(...await Promise.allSettled([search(`${name}, ${area}`, country)]));
    }
  }
  if (results.every(result => result.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
  const seen = new Set<string>();
  return results.flatMap(result => result.status === "fulfilled" ? result.value : []).filter(row => {
    const key = `${row.name.toLowerCase()}|${row.latitude}|${row.longitude}`;
    if (seen.has(key) || (country && row.countryCode && row.countryCode !== country)) return false;
    seen.add(key); return true;
  }).slice(0, 12);
}

/** External search candidates are suggestions, never saved coordinates until selected. */
export function parsePlaceSearch(data: unknown, query: string): PlaceSearchResult[] {
  if (!data || typeof data !== "object" || !("features" in data) || !Array.isArray(data.features)) throw new Error("Place search returned an unexpected result");
  return data.features.flatMap((feature: unknown) => {
    if (!feature || typeof feature !== "object") return [];
    const { properties, geometry } = feature as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown[] } };
    if (!properties || geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return [];
    const [longitude, latitude] = geometry.coordinates;
    if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const text = (key: string) => typeof properties[key] === "string" ? properties[key].trim().slice(0, 240) : "";
    const name = text("name") || text("street") || query.slice(0, 240);
    const layer = text("type"), osmKey = text("osm_key"), osmValue = text("osm_value");
    const area = ["country", "state", "county", "city", "district", "locality"].includes(layer)
      || (osmKey === "place" && ["island", "islet", "archipelago", "continent"].includes(osmValue));
    const parts: AddressParts = { street: [text("housenumber"), text("street") || (layer === "street" ? name : "")].filter(Boolean).join(" "),
      city: text("city") || text("town") || text("village") || (layer === "city" ? name : ""),
      region: text("statecode").replace(/^[A-Z]{2}-/, "") || text("state") || (layer === "state" ? name : ""),
      postalCode: text("postcode"), district: text("district") || text("county") || text("locality") || (["county", "district", "locality"].includes(layer) ? name : "") };
    const code = text("countrycode").toUpperCase();
    const countryCode = Object.hasOwn(ADDRESS_COUNTRIES, code) ? code : undefined;
    const formatted = countryCode ? formatPlaceAddress(parts, countryCode) : [parts.street, parts.city, [parts.region, parts.postalCode].filter(Boolean).join(" "), parts.district, text("country")].filter(Boolean).join(", ");
    const address = formatted || text("country") || name;
    const osmType = ({ N: "node", W: "way", R: "relation" } as Record<string, string>)[text("osm_type")];
    const osmId = properties.osm_id;
    const sourceUrl = osmType && ((typeof osmId === "number" && Number.isSafeInteger(osmId) && osmId > 0) || (typeof osmId === "string" && /^\d{1,16}$/.test(osmId))) ? `https://www.openstreetmap.org/${osmType}/${osmId}` : undefined;
    return [{ name, address, longitude, latitude, addressParts: parts, ...(countryCode ? { countryCode } : {}),
      kind: area && osmKey === "place" && ["island", "islet", "archipelago"].includes(osmValue) ? osmValue : layer || "place",
      precision: area ? "area" as const : parts.street && text("housenumber") ? "address" as const : "approximate" as const,
      ...(sourceUrl ? { sourceUrl } : {}) }];
  }).slice(0, 8);
}
