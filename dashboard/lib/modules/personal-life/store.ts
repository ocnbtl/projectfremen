import { mutateJsonFile, readJsonFile } from "../../file-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import { isModuleId, type NativeObjectRef } from "../../native-objects/types";
import {
  PERSONAL_LIFE_COLLECTIONS,
  PERSONAL_LIST_COLUMN_TYPES,
  PERSONAL_LIFE_SCHEMA_VERSION,
  type PersonalBuildItem,
  type PersonalLifeCollection,
  type PersonalLifeInputByCollection,
  type PersonalLifeObjectByCollection,
  type PersonalLifeState,
  type PersonalListCell,
  type PersonalListColumn,
  type PersonalListRow,
  type PersonalList,
  type PersonalTrip,
  type PersonalVehicle,
  type VehicleModification
} from "./types";

const FILE_NAME = "personal-life.json";

export function emptyPersonalLifeState(): PersonalLifeState {
  return {
    schemaVersion: PERSONAL_LIFE_SCHEMA_VERSION,
    lists: [],
    trips: [],
    buildItems: [],
    vehicles: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, field: string, maximum = 4_000, required = false): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new Error(`${field} is required`);
  if (result.length > maximum) throw new Error(`${field} is too long`);
  return result;
}

function member<Value extends string>(value: unknown, options: readonly Value[], fallback: Value): Value {
  return typeof value === "string" && options.includes(value as Value) ? value as Value : fallback;
}

function identifier(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  return id || crypto.randomUUID();
}

function iso(value: unknown, field: string): string {
  const result = text(value, field, 40);
  if (result && Number.isNaN(Date.parse(result))) throw new Error(`${field} is not a valid date`);
  return result;
}

function listItems(value: unknown): PersonalList["items"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    return {
      id: identifier(item.id),
      text: text(item.text, `items.${index}.text`, 500, true),
      note: text(item.note, `items.${index}.note`, 1_000),
      completed: item.completed === true
    };
  });
}

function nativeRef(value: unknown, field: string): NativeObjectRef | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isRecord(value)) throw new Error(`${field} must be a linked object`);
  const module = text(value.module, `${field}.module`, 40, true);
  if (!isModuleId(module)) throw new Error(`${field}.module is not supported`);
  return createNativeObjectRef({
    module,
    objectType: text(value.objectType, `${field}.objectType`, 120, true),
    objectId: text(value.objectId, `${field}.objectId`, 240, true),
    containerObjectId: text(value.containerObjectId, `${field}.containerObjectId`, 240) || undefined,
    label: text(value.label, `${field}.label`, 500, true),
    versionId: text(value.versionId, `${field}.versionId`, 240) || undefined
  });
}

function listColumns(value: unknown, legacyItems: PersonalList["items"]): PersonalListColumn[] {
  if (Array.isArray(value) && value.length) {
    return value.slice(0, 24).map((candidate, index) => {
      const column = isRecord(candidate) ? candidate : {};
      return {
        id: identifier(column.id),
        label: text(column.label, `columns.${index}.label`, 80, true),
        type: member(column.type, PERSONAL_LIST_COLUMN_TYPES, "text")
      };
    });
  }
  return [
    { id: "item", label: "Item", type: "text" as const },
    ...(legacyItems.some((item) => item.note) ? [{ id: "notes", label: "Notes", type: "text" as const }] : [])
  ];
}

function listCell(value: unknown, field: string, column: PersonalListColumn): PersonalListCell {
  const candidate = isRecord(value) ? value : { value };
  const ref = nativeRef(candidate.ref, `${field}.ref`);
  if (ref && column.type === "person" && ref.module !== "people") {
    throw new Error(`${field} must link to a People record`);
  }
  if (ref && column.type === "object" && ref.module === "people") {
    throw new Error(`${field} must link to an object record`);
  }
  return {
    value: text(candidate.value, `${field}.value`, 4_000),
    ...(ref ? { ref } : {})
  };
}

function listRows(value: unknown, columns: PersonalListColumn[], legacyItems: PersonalList["items"]): PersonalListRow[] {
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((candidate, rowIndex) => {
      const row = isRecord(candidate) ? candidate : {};
      const rawCells = isRecord(row.cells) ? row.cells : {};
      return {
        id: identifier(row.id),
        completed: row.completed === true,
        cells: Object.fromEntries(columns.map((column) => [
          column.id,
          listCell(rawCells[column.id], `rows.${rowIndex}.cells.${column.id}`, column)
        ]))
      };
    });
  }
  return legacyItems.map((item) => ({
    id: item.id,
    completed: item.completed,
    cells: Object.fromEntries(columns.map((column) => [
      column.id,
      { value: column.id === "item" ? item.text : column.id === "notes" ? item.note : "" }
    ]))
  }));
}

function compatibilityItems(columns: PersonalListColumn[], rows: PersonalListRow[]): PersonalList["items"] {
  const primary = columns[0];
  const notes = columns.find((column) => column.label.toLowerCase() === "notes");
  return rows.map((row) => ({
    id: row.id,
    text: row.cells[primary.id]?.value || "Untitled item",
    note: notes ? row.cells[notes.id]?.value || "" : "",
    completed: row.completed
  }));
}

function modifications(value: unknown): VehicleModification[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    return {
      id: identifier(item.id),
      name: text(item.name, `modifications.${index}.name`, 240, true),
      category: text(item.category, `modifications.${index}.category`, 120),
      status: member(item.status, ["idea", "researching", "planned", "installed", "skipped"] as const, "idea"),
      estimate: text(item.estimate, `modifications.${index}.estimate`, 80),
      notes: text(item.notes, `modifications.${index}.notes`, 2_000)
    };
  });
}

function coordinate(value: unknown, minimum: number, maximum: number, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < minimum || parsed > maximum) throw new Error(`Map coordinates must be between ${minimum} and ${maximum}`);
  return parsed;
}

function base(raw: Record<string, unknown>, now: string) {
  return {
    id: identifier(raw.id),
    createdAt: iso(raw.createdAt, "createdAt") || now,
    updatedAt: iso(raw.updatedAt, "updatedAt") || now
  };
}

function normalizeList(raw: Record<string, unknown>, now: string): PersonalList {
  const legacyItems = listItems(raw.items);
  const columns = listColumns(raw.columns, legacyItems);
  const rows = listRows(raw.rows, columns, legacyItems);
  return {
    ...base(raw, now),
    title: text(raw.title, "List title", 240, true),
    description: text(raw.description, "List description", 2_000),
    kind: member(raw.kind, ["shopping", "watchlist", "favorites", "packing", "custom"] as const, "custom"),
    items: compatibilityItems(columns, rows),
    columns,
    rows
  };
}

function normalizeTrip(raw: Record<string, unknown>, now: string): PersonalTrip {
  return {
    ...base(raw, now),
    name: text(raw.name, "Trip name", 240, true),
    place: text(raw.place, "Place", 240, true),
    region: text(raw.region, "Region", 160),
    status: member(raw.status, ["been", "want", "lived", "planned"] as const, "want"),
    travelMode: member(raw.travelMode, ["car", "plane", "train", "boat", "bus", "bike", "walk", "other"] as const, "plane"),
    latitude: coordinate(raw.latitude, -90, 90),
    longitude: coordinate(raw.longitude, -180, 180),
    startDate: iso(raw.startDate, "Start date"),
    endDate: iso(raw.endDate, "End date"),
    notes: text(raw.notes, "Trip notes", 4_000)
  };
}

function normalizeBuildItem(raw: Record<string, unknown>, now: string): PersonalBuildItem {
  return {
    ...base(raw, now),
    name: text(raw.name, "Build item name", 240, true),
    category: text(raw.category, "Category", 120),
    status: member(raw.status, ["wanted", "researching", "acquired", "retired"] as const, "wanted"),
    targetDate: iso(raw.targetDate, "Target date"),
    budget: text(raw.budget, "Budget", 80),
    notes: text(raw.notes, "Build notes", 4_000)
  };
}

function normalizeVehicle(raw: Record<string, unknown>, now: string): PersonalVehicle {
  return {
    ...base(raw, now),
    name: text(raw.name, "Vehicle name", 240, true),
    year: text(raw.year, "Year", 12),
    make: text(raw.make, "Make", 120),
    model: text(raw.model, "Model", 120),
    trim: text(raw.trim, "Trim", 120),
    status: member(raw.status, ["current", "future", "previous"] as const, "future"),
    vinNote: text(raw.vinNote, "Identification note", 240),
    notes: text(raw.notes, "Vehicle notes", 4_000),
    modifications: modifications(raw.modifications)
  };
}

function normalizeObject<Collection extends PersonalLifeCollection>(
  collection: Collection,
  value: unknown,
  now: string
): PersonalLifeObjectByCollection[Collection] {
  if (!isRecord(value)) throw new Error("Record must be an object");
  const item = collection === "lists"
    ? normalizeList(value, now)
    : collection === "trips"
      ? normalizeTrip(value, now)
      : collection === "buildItems"
        ? normalizeBuildItem(value, now)
        : normalizeVehicle(value, now);
  return item as PersonalLifeObjectByCollection[Collection];
}

function normalizeState(value: unknown): PersonalLifeState {
  if (!isRecord(value)) return emptyPersonalLifeState();
  const now = new Date().toISOString();
  return {
    schemaVersion: PERSONAL_LIFE_SCHEMA_VERSION,
    lists: Array.isArray(value.lists) ? value.lists.map((item) => normalizeList(isRecord(item) ? item : {}, now)) : [],
    trips: Array.isArray(value.trips) ? value.trips.map((item) => normalizeTrip(isRecord(item) ? item : {}, now)) : [],
    buildItems: Array.isArray(value.buildItems) ? value.buildItems.map((item) => normalizeBuildItem(isRecord(item) ? item : {}, now)) : [],
    vehicles: Array.isArray(value.vehicles) ? value.vehicles.map((item) => normalizeVehicle(isRecord(item) ? item : {}, now)) : []
  };
}

export async function readPersonalLifeState(): Promise<PersonalLifeState> {
  return normalizeState(await readJsonFile<unknown>(FILE_NAME, emptyPersonalLifeState()));
}

export async function createPersonalLifeObject<Collection extends PersonalLifeCollection>(
  collection: Collection,
  input: PersonalLifeInputByCollection[Collection]
): Promise<PersonalLifeObjectByCollection[Collection]> {
  return mutateJsonFile<unknown, PersonalLifeObjectByCollection[Collection]>(FILE_NAME, emptyPersonalLifeState(), (raw) => {
    const state = normalizeState(raw);
    const now = new Date().toISOString();
    const item = normalizeObject(collection, { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, now);
    return { value: { ...state, [collection]: [item, ...state[collection]] }, result: item };
  });
}

export async function updatePersonalLifeObject<Collection extends PersonalLifeCollection>(
  collection: Collection,
  id: string,
  patch: Partial<PersonalLifeInputByCollection[Collection]>,
  expectedUpdatedAt: string
): Promise<PersonalLifeObjectByCollection[Collection]> {
  return mutateJsonFile<unknown, PersonalLifeObjectByCollection[Collection]>(FILE_NAME, emptyPersonalLifeState(), (raw) => {
    const state = normalizeState(raw);
    const current = state[collection].find((item) => item.id === id) as PersonalLifeObjectByCollection[Collection] | undefined;
    if (!current) throw new Error("Personal record was not found");
    if (current.updatedAt !== expectedUpdatedAt) throw new Error("This record changed after it was opened. Refresh and try again.");
    const now = new Date().toISOString();
    const item = normalizeObject(collection, { ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: now }, now);
    const next = state[collection].map((candidate) => candidate.id === id ? item : candidate);
    return { value: { ...state, [collection]: next }, result: item };
  });
}

export async function deletePersonalLifeObject(collection: PersonalLifeCollection, id: string, expectedUpdatedAt: string): Promise<void> {
  await mutateJsonFile<unknown, void>(FILE_NAME, emptyPersonalLifeState(), (raw) => {
    const state = normalizeState(raw);
    const current = state[collection].find((item) => item.id === id);
    if (!current) throw new Error("Personal record was not found");
    if (current.updatedAt !== expectedUpdatedAt) throw new Error("This record changed after it was opened. Refresh and try again.");
    return { value: { ...state, [collection]: state[collection].filter((item) => item.id !== id) }, result: undefined };
  });
}

export function isPersonalLifeCollection(value: unknown): value is PersonalLifeCollection {
  return typeof value === "string" && PERSONAL_LIFE_COLLECTIONS.includes(value as PersonalLifeCollection);
}
