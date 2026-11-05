import type { Place } from "./types";
import { formatPlaceAddress, splitPastedAddress } from "./place-address";
import { sameNumberedVenue } from "./place-match";

/** Conservative identity: preserve apartment numbers, accents, and country/region text. */
export function addressIdentity(address: string) {
  const parts = splitPastedAddress(address);
  const normalized = parts ? formatPlaceAddress(parts, "US") : address;
  return normalized.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[,\n\r]+/g, " ").replace(/\s+/g, " ").trim();
}
/** Provider identity distinguishes venues sharing an address. Legacy postal-only
 * records retain their existing reuse behavior; ambiguous candidates stay explicit. */
export function reusablePlaces(places: Place[], candidate: Partial<Place>): Place[] {
  const key = (s = "") => s.normalize("NFKC").toLocaleLowerCase("en-US").trim();
  const sourceId = candidate.lookup?.sourceId;
  if (sourceId) {
    const linked = places.filter(place => !place.archivedAt && place.lookup?.sourceId === sourceId);
    if (linked.length) return linked;
  }
  return places.filter(place => {
    if (place.archivedAt) return false;
    if (place.lookup?.sourceId && candidate.lookup?.sourceId) {
      // Different records in one source may be neighboring branches. Across
      // sources, require the same name, full numbered address and nearby pin.
      if (place.lookup.sourceId.split("/")[2] === candidate.lookup.sourceId.split("/")[2]) return false;
      return sameNumberedVenue(place, candidate);
    }
    if (place.countryCode && candidate.countryCode && place.countryCode !== candidate.countryCode) return false;
    const sameAddress = !!candidate.address?.trim() && addressIdentity(place.address) === addressIdentity(candidate.address);
    if (!place.lookup && !candidate.lookup) return sameAddress;
    const sameName = key(place.name) === key(candidate.name);
    if (sameAddress && sameName) return true;
    return sameName && typeof place.latitude === "number" && typeof candidate.latitude === "number" && typeof place.longitude === "number" && typeof candidate.longitude === "number" && Math.abs(place.latitude - candidate.latitude) < .00001 && Math.abs(place.longitude - candidate.longitude) < .00001;
  });
}
export function profilePlaceAddress(address = "", locality = "") {
  const a = address.trim(), l = locality.trim();
  // Contact imports often repeat the locality after an already complete postal
  // address. Do not append it again or append a second street address as a city.
  const postalEnd = a.match(/\b(?:[A-Z]{2}|Ohio|California|New York|Kentucky|Louisiana|Oregon|Texas|Alabama|Illinois)\s*,?\s+\d{5}(?:-\d{4})?\b/i);
  if (postalEnd?.index !== undefined) {
    const parts = splitPastedAddress(a.slice(0, postalEnd.index + postalEnd[0].length));
    if (parts) return formatPlaceAddress(parts, "US");
  }
  if (a && /^\d+\s+/.test(l)) return a;
  return !a ? l : !l || addressIdentity(a).includes(addressIdentity(l)) ? a : `${a}, ${l}`;
}
export function profilePlaceName(title: string, label: string, address: string, isOrganization: boolean) {
  // A city-only contact location is shared geography, never a guessed address.
  const precise = /\d/.test(address) || /\b(?:street|road|avenue|lane|drive|boulevard|gower st)\b/i.test(address);
  if (!precise) return address.slice(0, 240);
  const suffix = isOrganization && /^(?:headquarters|primary home|relevant location)$/i.test(label) ? "" : label;
  return [title, suffix].filter(Boolean).join(" · ").slice(0, 240);
}
export function hasPlaceCoordinates(place: Place | undefined): place is Place & { latitude: number; longitude: number } {
  return !!place && typeof place.latitude === "number" && typeof place.longitude === "number" && Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180;
}
export const isPhysicalLocation = (text: string) => text.trim().length >= 2 && !/^(?:https?:|webcal:|tel:|mailto:)|\b(?:zoom\.us|meet\.google|teams\.microsoft)\b|^(?:online|remote|virtual|phone|zoom|tbd|to be confirmed)$/i.test(text.trim());
