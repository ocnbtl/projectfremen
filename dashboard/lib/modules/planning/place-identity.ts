import type { Place } from "./types";

/** Conservative identity: preserve apartment numbers, accents, and country/region text. */
export function addressIdentity(address: string) {
  return address.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[,\n\r]+/g, " ").replace(/\s+/g, " ").trim();
}
export function profilePlaceAddress(address = "", locality = "") {
  const a = address.trim(), l = locality.trim();
  return !a ? l : !l || addressIdentity(a).includes(addressIdentity(l)) ? a : `${a}, ${l}`;
}
export function hasPlaceCoordinates(place: Place | undefined): place is Place & { latitude: number; longitude: number } {
  return !!place && typeof place.latitude === "number" && typeof place.longitude === "number" && Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180;
}
export const isPhysicalLocation = (text: string) => text.trim().length >= 2 && !/^(?:https?:|webcal:|tel:|mailto:)|\b(?:zoom\.us|meet\.google|teams\.microsoft)\b|^(?:online|remote|virtual|phone|zoom|tbd|to be confirmed)$/i.test(text.trim());
