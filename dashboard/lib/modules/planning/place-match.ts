import { addressRegionKey, type AddressParts } from "./place-address";

export const placeWords = (value = "") => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/['’]/gu, "").replace(/&/gu, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const streetTerms: Record<string, string> = { street: "st", avenue: "ave", boulevard: "blvd", drive: "dr", road: "rd", lane: "ln", court: "ct", circle: "cir", parkway: "pkwy", highway: "hwy", terrace: "ter", place: "pl", suite: "ste", apartment: "apt" };
export const streetKey = (value = "") => placeWords(value).split(" ").map(word => Object.hasOwn(streetTerms, word) ? streetTerms[word] : word).join(" ");
export const postalKey = (value = "") => placeWords(value).replaceAll(" ", "");
export const numberedStreet = (value: string) => /^\d+[\p{L}\d-]*\s+.*\p{L}/u.test(value);
export function addressFieldKey(field: keyof AddressParts, value?: string, country?: string) {
  if (field === "street") return streetKey(value);
  if (field === "postalCode") return postalKey(value);
  if (field === "region") return addressRegionKey(value, country);
  return placeWords(value);
}

type Venue = { name?: string; countryCode?: string; addressParts?: AddressParts; latitude?: number; longitude?: number };
export function conflictingVenueAddress(a: Venue, b: Venue) {
  return (["street", "city", "region", "postalCode", "district"] as const).some(field => {
    const left = addressFieldKey(field, a.addressParts?.[field], a.countryCode);
    const right = addressFieldKey(field, b.addressParts?.[field], b.countryCode);
    return !!left && !!right && left !== right;
  });
}

/** Shared evidence threshold for reusing a saved venue or grouping suggestions
 * from distinct sources. Street numbers, unit numbers and locality all matter. */
export function sameNumberedVenue(a: Venue, b: Venue) {
  if (!a.countryCode || a.countryCode !== b.countryCode || !a.name || placeWords(a.name) !== placeWords(b.name)) return false;
  const street = streetKey(a.addressParts?.street), city = placeWords(a.addressParts?.city);
  if (!numberedStreet(street) || street !== streetKey(b.addressParts?.street) || !city || city !== placeWords(b.addressParts?.city) || conflictingVenueAddress(a, b)) return false;
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return false;
  const metres = Math.hypot((a.latitude - b.latitude) * 111320, (a.longitude - b.longitude) * 111320 * Math.cos(a.latitude * Math.PI / 180));
  return metres <= 30;
}
