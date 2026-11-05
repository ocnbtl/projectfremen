import { ADDRESS_COUNTRIES, formatPlaceAddress, splitPastedAddress, type AddressParts } from "./place-address";
import { addressFieldKey, conflictingVenueAddress, numberedStreet, placeWords as words, postalKey, sameNumberedVenue, streetKey } from "./place-match";
export type PlaceSearchResult = { name: string; address: string; latitude: number; longitude: number; countryCode?: string; addressParts?: AddressParts; kind?: string; precision?: "address" | "area" | "approximate"; sourceUrl?: string; sourceLabel?: string; attributionUrl?: string };
export type CoordinateSearchOptions = { name?: string; countryCode?: string; addressParts?: AddressParts };
export function placeFromSearch(match: PlaceSearchResult) {
  return { name: match.name, address: match.address, countryCode: match.countryCode || "", addressParts: match.addressParts || { street: "", city: "", region: "", postalCode: "", district: "" }, latitude: match.latitude, longitude: match.longitude,
    lookup: { ...(match.sourceUrl ? { sourceId: match.sourceUrl } : {}), kind: match.kind || "place", precision: match.precision || "approximate" as const } };
}

const hasPhrase = (value: string, phrase: string) => !!phrase && (" " + value + " ").includes(" " + phrase + " ");
function usablePoint(row: PlaceSearchResult) {
  return Number.isFinite(row.latitude) && Math.abs(row.latitude) <= 90 && Number.isFinite(row.longitude) && Math.abs(row.longitude) <= 180;
}

function relevance(query: string, row: PlaceSearchResult, context: CoordinateSearchOptions) {
  const [first, ...qualifiers] = query.split(",");
  const target = words(query), name = words(row.name), requestedName = words(context.name || first);
  const nameWords = new Set(name.split(" ")), tokens = target.split(" ");
  const wantedTokens = requestedName.split(" ").filter(Boolean);
  const nameOverlap = wantedTokens.filter(word => nameWords.has(word)).length;
  const parts = row.addressParts;
  const address = words([row.address, parts?.street, parts?.city, parts?.region, parts?.postalCode, row.countryCode, ADDRESS_COUNTRIES[row.countryCode || ""]?.name].filter(Boolean).join(" "));
  const evidence = new Set((name + " " + address).split(" "));
  let score = 30 * tokens.filter(word => evidence.has(word)).length / tokens.length;
  score += 10 * tokens.filter(word => nameWords.has(word)).length / tokens.length;
  const qualifier = words(qualifiers.join(" "));
  if (qualifier) {
    const locationTokens = qualifier.split(" ");
    score += 36 * locationTokens.filter(word => hasPhrase(address, word)).length / locationTokens.length;
  }
  if (name && name === requestedName) score += 50;
  else if (hasPhrase(target, name) || hasPhrase(name, requestedName)) score += 25;
  // Display-only alternate spelling for common area searches such as Exuma(s).
  else if (row.precision === "area" && name.replace(/^the /, "").replace(/s$/, "") === requestedName.replace(/^the /, "").replace(/s$/, "")) score += 30;
  else if (nameOverlap >= 2) score += 25 * nameOverlap / Math.max(nameWords.size, wantedTokens.length);
  const street = streetKey(parts?.street), wantedStreet = streetKey(context.addressParts?.street || first);
  const relevantName = !context.name || nameOverlap > 0;
  if (relevantName && row.precision === "address" && street) score += 5;
  if (numberedStreet(wantedStreet) && street === wantedStreet && relevantName) score += 60;
  else if (numberedStreet(wantedStreet) && numberedStreet(street) && street.split(" ")[0] !== wantedStreet.split(" ")[0]) score -= 35;

  // Locality is independent evidence. Avoid turning a random tenant at the
  // right address into a venue-name match when a provider understood an alias.
  if (relevantName) {
    for (const field of ["city", "region", "postalCode", "district"] as const) {
      const wanted = addressFieldKey(field, context.addressParts?.[field], context.countryCode || row.countryCode);
      const found = addressFieldKey(field, parts?.[field], row.countryCode);
      if (wanted && found) {
        const localityMatch = wanted === found || (field === "city" && wanted === words(parts?.district));
        score += localityMatch ? (field === "city" ? 34 : 16) : (field === "city" ? -45 : -28);
      }
    }
  }
  if (context.countryCode && row.countryCode && context.countryCode !== row.countryCode) score -= 100;
  return score;
}

function suggestionProvider(row: PlaceSearchResult) {
  return row.sourceUrl?.match(/^https?:\/\/([^/]+)/i)?.[1]?.toLowerCase() || row.sourceLabel;
}
function sameSuggestion(a: PlaceSearchResult, b: PlaceSearchResult) {
  if (a.sourceUrl && b.sourceUrl && a.sourceUrl === b.sourceUrl) return true;
  if (words(a.name) !== words(b.name) || a.countryCode !== b.countryCode || (a.precision === "area") !== (b.precision === "area")) return false;
  const leftProvider = suggestionProvider(a), rightProvider = suggestionProvider(b);
  if (a.sourceUrl && b.sourceUrl && leftProvider === rightProvider) return false;
  if (conflictingVenueAddress(a, b)) return false;
  if (a.latitude === b.latitude && a.longitude === b.longitude && words(a.address) === words(b.address)) return true;
  // Without a common source ID, require both a numbered street and a locality.
  // Keep distinct source records from one provider even at an identical pin.
  return !!leftProvider && !!rightProvider && leftProvider !== rightProvider && sameNumberedVenue(a, b);
}

/** Rank for display. An unqualified worldwide search has no draft locality. */
export function rankPlaceSuggestions(query: string, candidates: PlaceSearchResult[], context: CoordinateSearchOptions = {}): PlaceSearchResult[] {
  const sorted = candidates.filter(usablePoint).map(row => ({ row, score: relevance(query, row, context) })).sort((a, b) => b.score - a.score);
  const groups: PlaceSearchResult[][] = [];
  for (const { row } of sorted) {
    // A shared cross-provider candidate must not bridge two distinct branches.
    const matches = groups.filter(group => group.every(other => sameSuggestion(row, other)));
    if (matches.length === 1) matches[0].push(row);
    else groups.push([row]);
  }
  return groups.map(group => group[0]);
}

/** Only fill a single verified numbered address automatically. Area centers,
 * uncorroborated venues and ambiguous results require an explicit selection. */
export function canAutofillCoordinates(matches: PlaceSearchResult[], address: string, options: CoordinateSearchOptions): boolean {
  if (matches.length !== 1) return false;
  const row = matches[0];
  if (!usablePoint(row) || row.precision !== "address" || !row.addressParts || (options.countryCode && row.countryCode !== options.countryCode)) return false;
  const parsed = splitPastedAddress(address, options.countryCode);
  const wanted = options.addressParts;
  const street = streetKey(parsed?.street || wanted?.street);
  if (!numberedStreet(street) || street !== streetKey(row.addressParts.street)) return false;
  const name = words(options.name);
  if (name && name !== words(row.name) && streetKey(options.name) !== street) return false;
  const city = words(wanted?.city || parsed?.city), region = addressFieldKey("region", wanted?.region || parsed?.region, row.countryCode);
  const postal = postalKey(wanted?.postalCode || parsed?.postalCode), district = words(wanted?.district || parsed?.district);
  if (!postal && !(city && (region || options.countryCode))) return false;
  return (!city || city === words(row.addressParts.city)) && (!region || region === addressFieldKey("region", row.addressParts.region, row.countryCode))
    && (!postal || postal === postalKey(row.addressParts.postalCode)) && (!district || district === words(row.addressParts.district));
}

/** Name lookup is worldwide, independent of a draft's old/default address country.
 * Ranking only helps display choices; it never decides which place to save. */
export async function searchFullPlace(query: string, search: (query: string) => Promise<PlaceSearchResult[]>): Promise<PlaceSearchResult[]> {
  const name = query.trim();
  if (name.length < 2 || name.length > 500 || /^https?:\/\//i.test(name)) throw new Error("Enter a place name or address between 2 and 500 characters");
  return rankPlaceSuggestions(name, await search(name)).slice(0, 8);
}

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
  const candidates = results.flatMap(result => result.status === "fulfilled" ? result.value : [])
    .filter(row => !country || !row.countryCode || row.countryCode === country);
  return rankPlaceSuggestions(name || address, candidates, { name, countryCode: country, addressParts: parts }).slice(0, 12);
}

/** External search candidates are suggestions, never saved coordinates until selected. */
export function parsePlaceSearch(data: unknown, _query: string): PlaceSearchResult[] {
  if (!data || typeof data !== "object" || !("features" in data) || !Array.isArray(data.features)) throw new Error("Place search returned an unexpected result");
  return data.features.flatMap((feature: unknown) => {
    if (!feature || typeof feature !== "object") return [];
    const { properties, geometry } = feature as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown[] } };
    if (!properties || geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return [];
    const [longitude, latitude] = geometry.coordinates;
    if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const text = (key: string) => typeof properties[key] === "string" ? properties[key].trim().slice(0, 240) : "";
    const house = text("housenumber"), street = text("street");
    const name = text("name") || [house, street].filter(Boolean).join(" ") || text("city") || text("district") || text("state") || text("country");
    if (!name) return [];
    const layer = text("type"), osmKey = text("osm_key"), osmValue = text("osm_value");
    const area = ["country", "state", "county", "city", "district", "locality"].includes(layer)
      || (osmKey === "place" && ["island", "islet", "archipelago", "continent"].includes(osmValue));
    const parts: AddressParts = { street: [house, street || (layer === "street" ? name : "")].filter(Boolean).join(" "),
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
      precision: area ? "area" as const : house && street && layer !== "street" ? "address" as const : "approximate" as const,
      ...(sourceUrl ? { sourceUrl } : {}) }];
  }).slice(0, 8);
}
