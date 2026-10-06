import type { PlanningCollection } from "./types";

export const planningOwner = (collection: PlanningCollection) =>
  collection === "places" || collection === "savedViews"
    ? ("map" as const)
    : ("calendar" as const);
export function planningWritableKeys(collection: PlanningCollection): string[] {
  const keys: Record<PlanningCollection, string[]> = {
    places: [
      "name",
      "address",
      "countryCode",
      "addressParts",
      "latitude",
      "longitude",
      "notes",
      "tags",
      "linkedRefs",
    ],
    events: [
      "title",
      "description",
      "start",
      "end",
      "timeZone",
      "allDay",
      "calendarId",
      "groupId",
      "placeId",
      "location",
      "linkedRefs",
      "recurrence",
      "recurrenceDates",
      "participants",
      "reminderMinutes",
      "kind",
      "exceptions",
      "overrides",
    ],
    calendars: ["name", "color", "visible", "connectionId", "groups", "observances"],
    connections: ["name", "kind", "url", "timeZone"],
    savedViews: [
      "name",
      "query",
      "tag",
      "layer",
      "level",
      "stateCode",
      "analysis",
      "center",
      "zoom",
      "sort",
      "dateFrom",
      "dateTo",
    ],
    reminders: ["occurrenceId", "state", "until"],
  };
  return [...keys[collection], "archivedAt"];
}
