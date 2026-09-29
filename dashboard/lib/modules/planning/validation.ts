import { instantFor, validateEventTime } from "./calendar-model";
import { normalizePlanningRecord as normalizeRecord } from "./record-validation";
import type { PlanningCollection, PlanningCollections } from "./types";

/** Server and Calendar validation retain the complete recurrence/time-zone checks. */
export function normalizePlanningRecord<K extends PlanningCollection>(
  collection: K,
  raw: Record<string, unknown>,
): PlanningCollections[K] {
  return normalizeRecord(collection, raw, { instantFor, validateEventTime });
}
