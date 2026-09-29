import { createNativeObjectRef } from "../../native-objects/routes";
import { isModuleId, type NativeObjectRef } from "../../native-objects/types";
import type {
  PlanningCollection,
  PlanningCollections,
  EventFields,
  EventOverride,
} from "./types";
function string(
  value: unknown,
  label: string,
  max = 500,
  required = false,
): string {
  const out = typeof value === "string" ? value.trim() : "";
  if (required && !out) throw new Error(`${label} is required`);
  if (out.length > max)
    throw new Error(`${label} must be ${max} characters or fewer`);
  return out;
}
function coordinate(value: unknown, max: number) {
  const n = Number(value);
  if (value === "" || value == null || !Number.isFinite(n) || Math.abs(n) > max)
    throw new Error("Choose valid map coordinates");
  return n;
}
function refs(value: unknown): NativeObjectRef[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 100)
    throw new Error("Use no more than 100 linked records");
  return value.map((ref) => {
    if (!ref || !isModuleId(ref.module))
      throw new Error("Invalid linked record");
    return createNativeObjectRef({
      module: ref.module,
      objectId: string(ref.objectId, "Record id", 240, true),
      objectType: string(ref.objectType, "Record type", 100, true),
      label: string(ref.label, "Record name", 500, true),
      containerObjectId: ref.containerObjectId,
    });
  });
}
export type EventTimeValidator = {
  instantFor: (value: string, zone: string) => number;
  validateEventTime: (fields: EventFields) => void;
};

export function normalizePlanningRecord<K extends PlanningCollection>(
  collection: K,
  raw: Record<string, unknown>,
  eventTime?: EventTimeValidator,
): PlanningCollections[K] {
  const base = {
    id: string(raw.id, "Record id", 300, true),
    createdAt: string(raw.createdAt, "Created date", 40, true),
    updatedAt: string(raw.updatedAt, "Updated date", 40, true),
    ...(raw.archivedAt
      ? { archivedAt: string(raw.archivedAt, "Archive date", 40) }
      : {}),
  };
  let fields: Record<string, unknown>;
  if (collection === "places")
    fields = {
      name: string(raw.name, "Place name", 240, true),
      address: string(raw.address, "Address"),
      latitude: coordinate(raw.latitude, 90),
      longitude: coordinate(raw.longitude, 180),
      notes: string(raw.notes, "Notes", 10000),
      tags: Array.isArray(raw.tags)
        ? raw.tags
            .slice(0, 30)
            .map((x) => string(x, "Tag", 80))
            .filter(Boolean)
        : [],
      linkedRefs: refs(raw.linkedRefs),
    };
  else if (collection === "events") {
    if (!eventTime) throw new Error("Open Calendar to edit events offline.");
    const { instantFor, validateEventTime } = eventTime;
    fields = {
      title: string(raw.title, "Event title", 240, true),
      description: string(raw.description, "Description", 20000),
      start: string(raw.start, "Start", 40, true),
      end: string(raw.end, "End", 40, true),
      timeZone: string(raw.timeZone, "Time zone", 100, true),
      allDay: raw.allDay === true,
      calendarId: string(raw.calendarId, "Calendar", 300, true),
      placeId: string(raw.placeId, "Place", 300) || undefined,
      location: string(raw.location, "Location"),
      linkedRefs: refs(raw.linkedRefs),
      recurrence: string(raw.recurrence, "Recurrence", 500),
      kind: raw.kind === "time_block" ? "time_block" : "event",
      reminderMinutes:
        raw.reminderMinutes == null
          ? null
          : Math.max(0, Math.min(43200, Number(raw.reminderMinutes))),
    };
    if (
      fields.reminderMinutes !== null &&
      !Number.isFinite(fields.reminderMinutes)
    )
      throw new Error("Choose a valid reminder time");
    if (raw.participants !== undefined) {
      if (!Array.isArray(raw.participants) || raw.participants.length > 100)
        throw new Error("Use no more than 100 participants");
      fields.participants = raw.participants.map((p) => {
        if (!p || typeof p !== "object") throw new Error("Invalid participant");
        const name = string(p.name, "Participant name", 240, true),
          email = string(p.email, "Participant email", 254);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new Error("Choose a valid participant email");
        return { name, ...(email ? { email } : {}) };
      });
    }
    if (raw.recurrenceDates !== undefined) {
      if (
        !Array.isArray(raw.recurrenceDates) ||
        raw.recurrenceDates.length > 5000
      )
        throw new Error("Use no more than 5,000 additional recurrence dates");
      fields.recurrenceDates = [
        ...new Set(
          raw.recurrenceDates.map((value) => {
            const date = string(value, "Recurrence date", 40, true);
            instantFor(date, String(fields.timeZone));
            if (fields.allDay !== (date.length === 10))
              throw new Error(
                "Additional recurrence dates must match the event's date type",
              );
            return date;
          }),
        ),
      ];
    }
    validateEventTime(fields as EventFields);
    const normalizeOverride = (value: unknown): EventOverride => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid event override");
      const input = value as Record<string, unknown>;
      const safe: Record<string, unknown> = {};
      for (const key of Object.keys(fields))
        if (Object.hasOwn(input, key)) safe[key] = input[key];
      const normalized = normalizePlanningRecord(
        "events",
        {
          ...base,
          ...fields,
          ...safe,
        },
        eventTime,
      );
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(safe))
        result[key] = normalized[key as keyof typeof normalized];
      if (Object.hasOwn(input, "cancelled"))
        result.cancelled = input.cancelled === true;
      return result;
    };
    const normalizeExceptions = (value: unknown) => {
      if (value == null) return {};
      if (
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length > 5000
      )
        throw new Error("Invalid recurrence exceptions");
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (key.length > 40)
            throw new Error("Invalid recurrence exception date");
          instantFor(key, String(fields.timeZone));
          return [key, normalizeOverride(item)];
        }),
      );
    };
    const source = raw.source as Record<string, unknown> | undefined;
    const extras = {
      exceptions: normalizeExceptions(raw.exceptions),
      ...(raw.sourceExceptions
        ? { sourceExceptions: normalizeExceptions(raw.sourceExceptions) }
        : {}),
      ...(raw.overrides ? { overrides: normalizeOverride(raw.overrides) } : {}),
      ...(source
        ? {
            source: {
              connectionId: string(
                source.connectionId,
                "Source connection",
                300,
                true,
              ),
              calendarId: string(
                source.calendarId,
                "Source calendar",
                500,
                true,
              ),
              uid: string(source.uid, "Source identity", 1000, true),
              fingerprint: string(
                source.fingerprint,
                "Source version",
                128,
                true,
              ),
              accountId:
                string(source.accountId, "Source account", 500) || undefined,
              recurrenceId:
                string(source.recurrenceId, "Source occurrence", 500) ||
                undefined,
              cancelled: source.cancelled === true,
              changed: source.changed === true,
            },
          }
        : {}),
    };
    fields = { ...fields, ...extras };
  } else if (collection === "calendars") {
    const color = string(raw.color, "Color", 7) || "#565B86";
    if (!/^#[a-f\d]{6}$/i.test(color))
      throw new Error("Choose a six-digit calendar color");
    fields = {
      name: string(raw.name, "Calendar name", 120, true),
      color,
      visible: raw.visible !== false,
      connectionId: string(raw.connectionId, "Connection", 300) || undefined,
      externalId: string(raw.externalId, "External calendar", 500) || undefined,
      accountId: string(raw.accountId, "Account", 500) || undefined,
    };
  } else if (collection === "connections") {
    if (!["ics_file", "ics_feed", "morgen"].includes(String(raw.kind)))
      throw new Error("Invalid connection type");
    const url = string(raw.url, "Calendar URL", 2048) || undefined;
    if (url && new URL(url).protocol !== "https:")
      throw new Error("Calendar feeds must use HTTPS");
    fields = {
      name: string(raw.name, "Connection name", 120, true),
      kind: raw.kind,
      timeZone: string(raw.timeZone, "Feed time zone", 100) || "UTC",
      url,
      lastSuccessAt: raw.lastSuccessAt,
      lastAttemptAt: raw.lastAttemptAt,
      lastError: raw.lastError,
    };
  } else if (collection === "savedViews") {
    const center = raw.center as number[];
    if (!Array.isArray(center) || center.length !== 2)
      throw new Error("Choose a map center");
    fields = {
      name: string(raw.name, "View name", 120, true),
      query: string(raw.query, "Search"),
      tag: string(raw.tag, "Tag", 80),
      layer: string(raw.layer, "Layer", 80),
      level: ["state", "county", "tract"].includes(String(raw.level))
        ? String(raw.level)
        : "state",
      stateCode: string(raw.stateCode, "State FIPS", 2),
      center: [coordinate(center[0], 180), coordinate(center[1], 90)],
      zoom: Math.max(0, Math.min(20, Number(raw.zoom) || 3)),
      sort: raw.sort === "updated" ? "updated" : "name",
      dateFrom: string(raw.dateFrom, "From", 10),
      dateTo: string(raw.dateTo, "To", 10),
    };
  } else {
    if (raw.until && !Number.isFinite(Date.parse(String(raw.until))))
      throw new Error("Choose a valid snooze time");
    fields = {
      occurrenceId: string(raw.occurrenceId, "Occurrence", 500, true),
      state: raw.state === "snoozed" ? "snoozed" : "dismissed",
      until: string(raw.until, "Snooze until", 40) || undefined,
    };
  }
  return { ...base, ...fields } as PlanningCollections[K];
}
