import { mutateJsonFile, readJsonFile } from "../../file-store";
import {
  DOG_TRACKER_SCHEMA_VERSION,
  type DogCareEvent,
  type DogCareInput,
  type DogTrackerState
} from "./types";

const FILE_NAME = "personal-dog-tracker.json";

export function emptyDogTrackerState(): DogTrackerState {
  return { schemaVersion: DOG_TRACKER_SCHEMA_VERSION, events: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, field: string, maximum: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maximum) throw new Error(`${field} is too long`);
  return normalized;
}

function iso(value: unknown, field: string): string {
  const normalized = text(value, field, 40);
  if (!normalized || Number.isNaN(Date.parse(normalized))) throw new Error(`${field} is required`);
  return new Date(normalized).toISOString();
}

function normalizeEvent(value: unknown): DogCareEvent {
  if (!isRecord(value)) throw new Error("Dog care entry must be an object");
  const kind = value.kind === "feed" ? "feed" : "walk";
  const now = new Date().toISOString();
  return {
    id: text(value.id, "Entry id", 120) || crypto.randomUUID(),
    kind,
    occurredAt: iso(value.occurredAt, "Occurred at"),
    peed: kind === "walk" && value.peed === true,
    pooped: kind === "walk" && value.pooped === true,
    notes: text(value.notes, "Notes", 2_000),
    createdAt: text(value.createdAt, "createdAt", 40) || now,
    updatedAt: text(value.updatedAt, "updatedAt", 40) || now
  };
}

function normalizeState(value: unknown): DogTrackerState {
  const record = isRecord(value) ? value : {};
  const events = Array.isArray(record.events)
    ? record.events.slice(0, 2_000).map(normalizeEvent).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    : [];
  return { schemaVersion: DOG_TRACKER_SCHEMA_VERSION, events };
}

export async function readDogTrackerState(): Promise<DogTrackerState> {
  return normalizeState(await readJsonFile<unknown>(FILE_NAME, emptyDogTrackerState()));
}

export async function createDogCareEvent(input: DogCareInput): Promise<DogCareEvent> {
  return mutateJsonFile<unknown, DogCareEvent>(FILE_NAME, emptyDogTrackerState(), (raw) => {
    const state = normalizeState(raw);
    const now = new Date().toISOString();
    const event = normalizeEvent({ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
    return { value: { ...state, events: [event, ...state.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) }, result: event };
  });
}

export async function updateDogCareEvent(id: string, input: Partial<DogCareInput>, expectedUpdatedAt: string): Promise<DogCareEvent> {
  return mutateJsonFile<unknown, DogCareEvent>(FILE_NAME, emptyDogTrackerState(), (raw) => {
    const state = normalizeState(raw);
    const current = state.events.find((event) => event.id === id);
    if (!current) throw new Error("Dog care entry was not found");
    if (current.updatedAt !== expectedUpdatedAt) throw new Error("This dog care entry changed after it was opened. Refresh and try again.");
    const event = normalizeEvent({ ...current, ...input, id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
    return { value: { ...state, events: state.events.map((candidate) => candidate.id === id ? event : candidate).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) }, result: event };
  });
}

export async function deleteDogCareEvent(id: string, expectedUpdatedAt: string): Promise<void> {
  await mutateJsonFile<unknown, void>(FILE_NAME, emptyDogTrackerState(), (raw) => {
    const state = normalizeState(raw);
    const current = state.events.find((event) => event.id === id);
    if (!current) throw new Error("Dog care entry was not found");
    if (current.updatedAt !== expectedUpdatedAt) throw new Error("This dog care entry changed after it was opened. Refresh and try again.");
    return { value: { ...state, events: state.events.filter((event) => event.id !== id) }, result: undefined };
  });
}
