export const DOG_TRACKER_SCHEMA_VERSION = 1 as const;

export type DogCareKind = "walk" | "feed";

export type DogCareEvent = {
  id: string;
  kind: DogCareKind;
  occurredAt: string;
  peed: boolean;
  pooped: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DogTrackerState = {
  schemaVersion: typeof DOG_TRACKER_SCHEMA_VERSION;
  events: DogCareEvent[];
};

export type DogCareInput = Pick<DogCareEvent, "kind" | "occurredAt" | "peed" | "pooped" | "notes">;
