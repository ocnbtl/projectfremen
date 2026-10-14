export const PLACE_TAGS = ["Food", "House", "School", "Organization", "Area", "Personal", "Travel"] as const;

/** Keep tag identity stable regardless of capitalization in imported place records. */
export function placeTagIconRole(tag: string): string {
  const key = tag.trim().toLowerCase();
  return PLACE_TAGS.some(label => label.toLowerCase() === key) ? `place-tag-${key}` : "place-tag-custom";
}

/** Prefer a known category over custom tags; preserve the owner's tag order. */
export function placePinIconRole(tags: readonly string[]): string {
  const category = tags.find(tag => placeTagIconRole(tag) !== "place-tag-custom");
  return category ? placeTagIconRole(category) : tags.some(tag => tag.trim()) ? "place-tag-custom" : "location";
}
