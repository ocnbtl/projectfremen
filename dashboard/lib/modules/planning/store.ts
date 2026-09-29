import { normalizePlanningRecord } from "./validation";
export { normalizePlanningRecord } from "./validation";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import { isModuleId, type NativeObjectRef } from "../../native-objects/types";
import { instantFor, validateEventTime } from "./calendar-model";
import {
  emptyPlanningState,
  PLANNING_COLLECTIONS,
  type PlanningCollection,
  type PlanningCollections,
  type PlanningState,
  type EventFields,
  type EventOverride,
} from "./types";

const FILE = "planning-records.json";
export const isPlanningCollection = (
  value: unknown,
): value is PlanningCollection =>
  typeof value === "string" &&
  (PLANNING_COLLECTIONS as readonly string[]).includes(value);
export function planningState(value: unknown): PlanningState {
  if (!value || typeof value !== "object") return emptyPlanningState();
  const raw = value as PlanningState;
  if (raw.schemaVersion !== 1)
    throw new Error("This planning data needs a newer application version");
  const result = emptyPlanningState();
  for (const key of PLANNING_COLLECTIONS)
    if (Array.isArray(raw[key])) (result[key] as unknown[]) = raw[key];
  return result;
}
export const readPlanningState = async () =>
  planningState(await readJsonFile<unknown>(FILE, emptyPlanningState()));
export async function savePlanningRecord<K extends PlanningCollection>(
  collection: K,
  input: Record<string, unknown>,
  expectedUpdatedAt?: string,
): Promise<PlanningCollections[K]> {
  return mutateJsonFile<unknown, PlanningCollections[K]>(
    FILE,
    emptyPlanningState(),
    (raw) => {
      const state = planningState(raw),
        id = typeof input.id === "string" ? input.id : crypto.randomUUID();
      const current = state[collection].find((x) => x.id === id);
      if (current && current.updatedAt !== expectedUpdatedAt)
        throw Object.assign(
          new Error(
            "This record changed elsewhere. Refresh before saving; your draft is still available.",
          ),
          { status: 409 },
        );
      if (!current && expectedUpdatedAt)
        throw Object.assign(new Error("This record is no longer available"), {
          status: 404,
        });
      const now = new Date(
        Math.max(Date.now(), current ? Date.parse(current.updatedAt) + 1 : 0),
      ).toISOString();
      const item = normalizePlanningRecord(collection, {
        ...current,
        ...input,
        id,
        createdAt: current?.createdAt || now,
        updatedAt: now,
      });
      if (
        collection === "events" &&
        !state.calendars.some(
          (c) =>
            c.id === (item as PlanningCollections["events"]).calendarId &&
            !c.archivedAt,
        )
      )
        throw new Error("Choose an available calendar");
      const rows = current
        ? state[collection].map((x) => (x.id === id ? item : x))
        : [...state[collection], item];
      return { value: { ...state, [collection]: rows }, result: item };
    },
  );
}
export async function mutatePlanningState<T>(
  mutate: (state: PlanningState) => { state: PlanningState; result: T },
): Promise<T> {
  return mutateJsonFile<unknown, T>(FILE, emptyPlanningState(), (raw) => {
    const next = mutate(planningState(raw));
    return { value: next.state, result: next.result };
  });
}
