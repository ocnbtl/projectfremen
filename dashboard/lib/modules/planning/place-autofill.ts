import { ADDRESS_COUNTRIES } from "./place-address";
import { resolveVenueLocality } from "./place-localities";
import { rankPlaceSuggestions, searchPlaceCoordinates, type CoordinateSearchOptions, type PlaceSearchResult } from "./place-search";

type Search = (query: string, country?: string) => Promise<PlaceSearchResult[]>;
type Center = { latitude: number; longitude: number; city?: string };
type Nearby = (name: string, point: Center, signal?: AbortSignal) => Promise<PlaceSearchResult[]>;
const key = (s = "") => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const attempt = <T>(p: Promise<T>) => p.then(value => ({value}), () => ({value: undefined}));
const localityFields = (p?: CoordinateSearchOptions["addressParts"]) => [p?.city,p?.region,p?.postalCode].filter(Boolean).join(", ");

async function interpret(query: string, options: CoordinateSearchOptions) {
  const parts = options.addressParts;
  const comma = query.indexOf(",");
  const typedLocality = comma > 0 ? query.slice(comma + 1).trim() : "";
  const name = comma > 0 ? query.slice(0,comma).trim() : query;
  const lookup = (s: string, cc?: string) => resolveVenueLocality(s,cc).catch(() => undefined);
  if (typedLocality) return {name, locality:typedLocality, point:await lookup(typedLocality,options.countryCode)};
  if (parts?.city) {
    const locality = [parts.city,parts.region].filter(Boolean).join(", ");
    return {name,locality,point:await lookup(locality,options.countryCode)};
  }
  // A trailing city can be useful even when someone omitted the comma.
  const tokens = query.split(/\s+/);
  for (let size = Math.min(4,tokens.length-1); size >= 1; size--) {
    const venue = tokens.slice(0,-size).join(" "), locality = tokens.slice(-size).join(" ");
    if (/\b(of|in|de|du|la|the)$/i.test(venue)) continue;
    const point = await lookup(locality,options.countryCode);
    if (point) return {name:venue, locality, point};
  }
  return {name,locality:"",point:undefined};
}

// Search complementary indexes only on explicit autofill. The map typeahead
// stays on its existing path. Neither path writes or creates a saved place.
export async function searchVenueAutofill(raw: string, options: CoordinateSearchOptions, search: Search, nearby: Nearby, signal?: AbortSignal, coordinates = false) {
  const query = raw.trim();
  if (query.length < 2 || query.length > 500 || /^https?:\/\//i.test(query)) throw new Error("Enter a place name or address between 2 and 500 characters");
  const name = coordinates ? options.name?.trim() || "" : query;
  const parts = options.addressParts;
  const locality = localityFields(parts);
  const qualified = !coordinates && !query.includes(",") && locality && !key(query).endsWith(key(parts?.city || locality))
    ? [query,locality,ADDRESS_COUNTRIES[options.countryCode || ""]?.name].filter(Boolean).join(", ").slice(0,500) : query;
  const primary = attempt(coordinates ? searchPlaceCoordinates(query,options,search) : search(qualified,options.countryCode));
  const isStreet = (/^\d+[\w-]*\s/u.test(name) && /\b(street|st|avenue|ave|boulevard|blvd|road|rd|lane|ln|drive|dr)\b/i.test(name)) || (!!parts?.street && key(parts.street) === key(name));
  const parsed = name && !isStreet ? await interpret(name,options) : {name:"",locality:"",point:undefined};
  const primaryResult = await primary;
  const rows = primaryResult.value || [];
  const named = (r: PlaceSearchResult) => key(r.name) === key(parsed.name);
  const correctCountry = (r: PlaceSearchResult) => !options.countryCode || r.countryCode === options.countryCode;
  const cityMatches = (r: PlaceSearchResult) => {
    const city = key(r.addressParts?.city);
    return !!city && (!parsed.locality || (" " + key(parsed.locality) + " ").includes(" " + city + " "));
  };
  const completeNamed = rows.some(r => named(r) && r.precision === "address" && correctCountry(r) && parsed.point &&
    r.countryCode === parsed.point.countryCode && key(r.addressParts?.city) === key(parsed.point.city) &&
    Math.abs(r.latitude - parsed.point.latitude) < .12 && Math.abs(r.longitude - parsed.point.longitude) < .2 &&
    !!parts?.street && key(parts.street) === key(r.addressParts?.street));
  // Skip the second index only if the user also supplied the matching street.
  // A plausible numbered address from one index can still be a former branch.
  let anchor: Center | undefined = parsed.point;
  const numbered = /\d/u.test(parts?.street || "");
  if (!completeNamed && numbered && parsed.name) {
    // A street pin is more useful than the city center for suburban businesses.
    const streetRows = coordinates ? rows : (await attempt(search([parts!.street,locality].filter(Boolean).join(", ").slice(0,500),options.countryCode))).value || [];
    const street = streetRows.find(r => r.precision === "address" && correctCountry(r) && key(r.addressParts?.street) === key(parts?.street) && cityMatches(r));
    if (street) anchor = street;
  }
  const isArea = rows.some(r => named(r) && r.precision === "area" && (!parsed.point || parsed.point.countryCode === r.countryCode));
  if (!anchor && parsed.name && !isArea) {
    const known = rows.filter(r => named(r) && r.precision !== "area" && correctCountry(r) && cityMatches(r));
    if (known.length === 1) anchor = known[0];
    else if (parsed.locality) {
      // Small towns absent from the offline gazetteer still work. Only use a
      // locality actually represented in the response; never an arbitrary pin.
      const approx = (await attempt(search(parsed.locality,options.countryCode))).value || [];
      const places = approx.filter(r => r.precision === "area" && correctCountry(r) && (" " + key(parsed.locality) + " ").includes(" " + key(r.name) + " "));
      const place = places[0];
      if (place && places.every(r => r.countryCode === place.countryCode && Math.abs(r.latitude-place.latitude)<.03 && Math.abs(r.longitude-place.longitude)<.03)) anchor = place;
    }
  }
  const venueCenter = !completeNamed && parsed.name && !isArea && !signal?.aborted ? anchor : undefined;
  const extra = venueCenter
    ? await attempt(nearby(parsed.name,{...venueCenter,city:parsed.point?.city || parts?.city},signal)) : {value:undefined};
  if (!primaryResult.value && !extra.value) throw new Error("Place lookup is temporarily unavailable. Your details are unchanged.");
  const cc = options.countryCode || parsed.point?.countryCode;
  const nearbyRows = (extra.value || []).filter(r => !cc || !r.countryCode || cc === r.countryCode);
  const ranking = {...options, name: parsed.name || options.name, countryCode:cc};
  if (!parts?.city && parsed.point) ranking.addressParts = {street:parts?.street || "",city:parsed.point.city,region:"",district:"",postalCode:""};
  // A result in the right city alone is not a match for a named venue.
  // Leave address-only suggestions available in the separate coordinates flow.
  const tokens = key(parsed.name).split(" ").filter(w => w.length > 1 && !["the","and","de","of"].includes(w));
  const plausible = coordinates || !parsed.locality || !tokens.length || /^[A-Z0-9]{2,4}$/.test(parsed.name) ? rows : rows.filter(r => {
    const label = key(r.name).split(" ");
    return tokens.some(t => label.includes(t) || (t.length >= 5 && label.includes(t.replace(/s$/,""))));
  });
  if (!plausible.length && venueCenter && !extra.value) throw new Error("The venue directory is temporarily unavailable. Try again or enter the address manually.");
  return rankPlaceSuggestions(query,[...plausible,...nearbyRows], ranking).slice(0,coordinates ? 12 : 8);
}
