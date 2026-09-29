import type { PersonalTrip } from "./types";
export const TRIP_WRITABLE_KEYS = [
  "name",
  "place",
  "region",
  "status",
  "travelMode",
  "latitude",
  "longitude",
  "startDate",
  "endDate",
  "notes",
  "stops",
  "route",
];
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function text(value: unknown, field: string, max = 4000, required = false) {
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) throw new Error(`${field} is required`);
  if (s.length > max) throw new Error(`${field} is too long`);
  return s;
}
function member<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && options.includes(value as T)
    ? (value as T)
    : fallback;
}
function identifier(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : crypto.randomUUID();
}
function iso(value: unknown, field: string) {
  const s = text(value, field, 40);
  if (s && !Number.isFinite(Date.parse(s)))
    throw new Error(`${field} is not a valid date`);
  return s;
}
function coordinate(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error("Choose valid map coordinates");
  return n;
}
function base(raw: Record<string, unknown>, now: string) {
  return {
    id: identifier(raw.id),
    createdAt: iso(raw.createdAt, "Created") || now,
    updatedAt: iso(raw.updatedAt, "Updated") || now,
  };
}
function normalizeRoute(value: unknown): PersonalTrip["route"] | undefined {
  if (value == null) return undefined;
  if (
    !isRecord(value) ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features) ||
    value.features.length > 50
  )
    throw new Error("Invalid trip route");
  const nonnegative = (x: unknown) => {
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0) throw new Error("Invalid route estimate");
    return n;
  };
  let count = 0;
  const features = value.features.map((f) => {
    if (
      !isRecord(f) ||
      !isRecord(f.geometry) ||
      f.geometry.type !== "LineString" ||
      !Array.isArray(f.geometry.coordinates)
    )
      throw new Error("Invalid route geometry");
    const coordinates = f.geometry.coordinates.map((p) => {
      if (++count > 100000 || !Array.isArray(p) || p.length < 2)
        throw new Error("Route geometry is too large or invalid");
      return [coordinate(p[0], -180, 180), coordinate(p[1], -90, 90)];
    });
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    };
  });
  const legs = Array.isArray(value.legs)
    ? value.legs.slice(0, 49).map((l) => {
        if (!isRecord(l)) throw new Error("Invalid travel leg");
        return {
          distance: nonnegative(l.distance),
          duration: nonnegative(l.duration),
        };
      })
    : [];
  return {
    type: "FeatureCollection",
    features,
    distance: nonnegative(value.distance),
    duration: nonnegative(value.duration),
    calculatedAt: iso(value.calculatedAt, "Route calculation date"),
    mode: member(value.mode, ["car", "walk", "bike"] as const, "car"),
    legs,
  };
}

export function normalizeTrip(
  raw: Record<string, unknown>,
  now: string,
): PersonalTrip {
  return {
    ...base(raw, now),
    stops: Array.isArray(raw.stops)
      ? raw.stops.slice(0, 50).map((value, index) => {
          if (!isRecord(value)) throw new Error("Invalid trip stop");
          return {
            id: identifier(value.id),
            placeId:
              text(value.placeId, `Stop ${index + 1} place`, 240) || undefined,
            name: text(value.name, `Stop ${index + 1} name`, 240, true),
            latitude: coordinate(value.latitude, -90, 90),
            longitude: coordinate(value.longitude, -180, 180),
            arrival: text(value.arrival, "Arrival", 40),
            notes: text(value.notes, "Stop notes", 2000),
          };
        })
      : [],
    route: normalizeRoute(raw.route),
    name: text(raw.name, "Trip name", 240, true),
    place: text(raw.place, "Place", 240, true),
    region: text(raw.region, "Region", 160),
    status: member(
      raw.status,
      ["been", "want", "lived", "planned"] as const,
      "want",
    ),
    travelMode: member(
      raw.travelMode,
      [
        "car",
        "plane",
        "train",
        "boat",
        "bus",
        "bike",
        "walk",
        "other",
      ] as const,
      "plane",
    ),
    latitude: coordinate(raw.latitude, -90, 90),
    longitude: coordinate(raw.longitude, -180, 180),
    startDate: iso(raw.startDate, "Start date"),
    endDate: iso(raw.endDate, "End date"),
    notes: text(raw.notes, "Trip notes", 4_000),
  };
}
