import { ADDRESS_COUNTRIES, formatPlaceAddress, type AddressParts } from "./place-address";
export type PlaceSearchResult = { name: string; address: string; latitude: number; longitude: number; countryCode?: string; addressParts?: AddressParts };

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
    const name = text("name") || text("street") || query;
    const parts: AddressParts = { street: [text("housenumber"), text("street")].filter(Boolean).join(" "), city: text("city") || text("town") || text("village"), region: text("statecode").replace(/^[A-Z]{2}-/, "") || text("state"), postalCode: text("postcode"), district: "" };
    const code = text("countrycode").toUpperCase();
    const countryCode = Object.hasOwn(ADDRESS_COUNTRIES, code) ? code : undefined;
    const address = countryCode ? formatPlaceAddress(parts, countryCode) : [parts.street, parts.city, [parts.region, parts.postalCode].filter(Boolean).join(" "), text("country")].filter(Boolean).join(", ");
    return [{ name, address: address || name, longitude, latitude, ...(countryCode ? { countryCode, addressParts: parts } : {}) }];
  }).slice(0, 8);
}
