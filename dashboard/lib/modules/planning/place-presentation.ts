import type { Place } from "./types";

export function formatPlaceCoordinates(latitude: number, longitude: number) {
  return `${Math.abs(latitude).toFixed(6)}° ${latitude < 0 ? "S" : "N"}, ${Math.abs(longitude).toFixed(6)}° ${longitude < 0 ? "W" : "E"}`;
}

/** Hide an address appended by import, without renaming the stored place. */
export function placeDisplayName(place: Pick<Place, "name" | "address">) {
  const parts = place.name.split(/\s+·\s+/);
  if (parts.length < 2) return place.name;
  const suffix = parts.slice(1).join(" · ").trim().toLocaleLowerCase();
  const address = place.address.trim().toLocaleLowerCase();
  return address && (address.includes(suffix) || suffix.includes(address)) ? parts[0] : place.name;
}

/** Custom pictures are small, private, normalized raster thumbnails, never executable SVG or remote URLs. */
export function normalizePlaceImage(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 180000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("Choose a valid place picture.");
  const header = atob(value.slice(22, 66));
  const dimension = (offset: number) => [...header.slice(offset, offset + 4)].reduce((n, char) => n * 256 + char.charCodeAt(0), 0);
  if (header.slice(12, 16) !== "IHDR" || dimension(16) < 1 || dimension(20) < 1 || dimension(16) > 192 || dimension(20) > 192) throw new Error("Place pictures must be at most 192 pixels.");
  return value;
}

export type PlaceOrganization = { objectId: string; label: string; href: string; imageUrl?: string; imageUpdatedAt?: string };
export function placePicture(place: Partial<Place>, organizations: PlaceOrganization[] = []) {
  if (place.image) return place.image;
  const name = placeDisplayName({ name: place.name || "", address: place.address || "" }).toLocaleLowerCase();
  const organization = organizations.find(org => org.label.toLocaleLowerCase() === name) || (organizations.length === 1 ? organizations[0] : undefined);
  const url = organization?.imageUrl;
  if (!url || !/^\/api\/people\/photos\/personal-[a-f0-9-]+$/i.test(url)) return undefined;
  return url + (organization.imageUpdatedAt ? `?v=${encodeURIComponent(organization.imageUpdatedAt)}` : "");
}
