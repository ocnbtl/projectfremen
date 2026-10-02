import type { FeatureCollection } from "geojson";

/** Smallest longitudinal extent, including countries crossing the date line. */
export function regionBounds(collection: FeatureCollection): [[number, number], [number, number]] | undefined {
  const longitudes: number[] = [];
  let south = 90, north = -90;
  const visit = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      longitudes.push(((coordinates[0] % 360) + 360) % 360);
      south = Math.min(south, coordinates[1]); north = Math.max(north, coordinates[1]);
    } else coordinates.forEach(visit);
  };
  for (const feature of collection.features) if ("coordinates" in feature.geometry) visit(feature.geometry.coordinates);
  if (!longitudes.length) return;
  const sorted = [...new Set(longitudes)].sort((a, b) => a - b);
  let gap = -1, start = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
    if (next - sorted[i] > gap) { gap = next - sorted[i]; start = next % 360; }
  }
  const west = start > 180 ? start - 360 : start;
  return [[west, south], [west + 360 - gap, north]];
}
