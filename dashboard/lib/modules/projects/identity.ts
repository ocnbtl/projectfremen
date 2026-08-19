const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isProjectUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hash32(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable public UUID for older Projects whose relationship key must not change. */
export function stableProjectUuid(identity: string) {
  const source = `unigentamos-project:${identity.trim().toLowerCase()}`;
  const bytes = [
    hash32(source, 0x811c9dc5),
    hash32(`${source}:1`, 0x9e3779b9),
    hash32(`${source}:2`, 0x85ebca6b),
    hash32(`${source}:3`, 0xc2b2ae35)
  ]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("")
    .split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const hex = bytes.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function projectUuid(value: unknown, identity: string) {
  return isProjectUuid(value) ? value.toLowerCase() : stableProjectUuid(identity);
}
