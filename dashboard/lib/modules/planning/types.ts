import type { NativeObjectRef } from "../../native-objects/types";

export type PlanningBase = {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};
export type Place = PlanningBase & {
  name: string;
  address: string;
  countryCode?: string;
  addressParts?: import("./place-address").AddressParts;
  latitude?: number;
  longitude?: number;
  notes: string;
  tags: string[];
  linkedRefs: NativeObjectRef[];
};
export type EventGroup = { id: string; name: string; color: string; icon: string; iconSource?: "auto" | "manual" };
export type CalendarObservanceSettings = {
  birthdays: boolean;
  hiddenBirthdays?: string[];
  countries: string[];
  disabledCountries?: string[];
  customVisible?: boolean;
  hiddenHolidays: string[];
  extraHolidays: string[];
  appearances?: Record<string, { name: string; color: string }>;
  custom: { id: string; title: string; date: string; annual: boolean; repeat?: { frequency: "daily" | "weekly" | "monthly" | "yearly"; interval: number }; visible: boolean; allDay?: boolean; startTime?: string; endTime?: string; endDate?: string; timeZone?: string }[];
};
export type Calendar = PlanningBase & {
  name: string;
  color: string;
  visible: boolean;
  groups?: EventGroup[];
  observances?: CalendarObservanceSettings;
  connectionId?: string;
  externalId?: string;
  accountId?: string;
};
export type EventFields = {
  title: string;
  description: string;
  start: string;
  end: string;
  timeZone: string;
  allDay: boolean;
  isTask?: boolean;
  completed?: boolean;
  calendarId: string;
  groupId?: string;
  placeId?: string;
  location: string;
  linkedRefs: NativeObjectRef[];
  recurrence: string;
  recurrenceAnchor?: import("./repeat-language").RepeatAnchor | null;
  recurrenceDates?: string[];
  participants?: { name: string; email?: string }[];
  reminderMinutes: number | null;
  kind: "event" | "time_block";
};
export type EventOverride = Partial<EventFields> & { cancelled?: boolean };
export type CalendarEvent = PlanningBase &
  EventFields & {
    overrides?: EventOverride;
    sourceExceptions?: Record<string, EventOverride>;
    exceptions: Record<string, EventOverride>;
    source?: {
      connectionId: string;
      uid: string;
      calendarId: string;
      accountId?: string;
      recurrenceId?: string;
      fingerprint: string;
      cancelled?: boolean;
      changed?: boolean;
    };
  };
export type CalendarConnection = PlanningBase & {
  name: string;
  kind: "ics_file" | "ics_feed" | "morgen";
  url?: string;
  timeZone?: string;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
};
export type SavedMapView = PlanningBase & {
  name: string;
  query: string;
  tag: string;
  layer: string;
  level?: string;
  stateCode?: string;
  analysis?: import("./map-analysis").MapAnalysisSettings;
  center: [number, number];
  zoom: number;
  sort: "name" | "updated";
  dateFrom?: string;
  dateTo?: string;
};
export type ReminderReceipt = PlanningBase & {
  occurrenceId: string;
  state: "dismissed" | "snoozed";
  until?: string;
};
export type PlanningCollections = {
  places: Place;
  calendars: Calendar;
  events: CalendarEvent;
  connections: CalendarConnection;
  savedViews: SavedMapView;
  reminders: ReminderReceipt;
};
export type PlanningCollection = keyof PlanningCollections;
export type PlanningState = { schemaVersion: 1 } & {
  [K in PlanningCollection]: PlanningCollections[K][];
};
export type EventOccurrence = EventFields & {
  id: string;
  eventId: string;
  occurrenceKey: string;
  startMs: number;
  endMs: number;
  source?: CalendarEvent["source"];
  overridden: boolean;
  ownerRef?: NativeObjectRef;
  system?: { kind: "birthday" | "holiday" | "custom"; key: string; detail: string; country?: string; color?: string; calendarName?: string };
};
export const PLANNING_COLLECTIONS = [
  "places",
  "calendars",
  "events",
  "connections",
  "savedViews",
  "reminders",
] as const;
export const DEFAULT_CALENDAR: Calendar = {
  id: "native",
  name: "My calendar",
  color: "#565B86",
  visible: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
export function emptyPlanningState(): PlanningState {
  return {
    schemaVersion: 1,
    places: [],
    calendars: [{ ...DEFAULT_CALENDAR }],
    events: [],
    connections: [],
    savedViews: [],
    reminders: [],
  };
}
export function effectiveEvent(event: CalendarEvent): CalendarEvent {
  return { ...event, ...event.overrides };
}
