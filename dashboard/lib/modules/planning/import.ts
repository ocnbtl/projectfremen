import ICAL from "ical.js";
import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { normalizePlanningRecord } from "./store";
import type { CalendarEvent, PlanningState } from "./types";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const sourceId = (...parts: string[]) =>
  hash(JSON.stringify(parts)).slice(0, 32);

export function parseCalendarFile(
  text: string,
  connectionId: string,
  calendarId: string,
  defaultZone: string,
): CalendarEvent[] {
  if (Buffer.byteLength(text) > 2_000_000)
    throw new Error("Calendar files must be smaller than 2 MB");
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== "vcalendar")
    throw new Error("Choose a valid iCalendar file");
  const components = root.getAllSubcomponents("vevent");
  if (components.length > 5000)
    throw new Error("Import no more than 5,000 events at a time");
  const componentZone = (component: ICAL.Component) => {
    const start = component.getFirstPropertyValue("dtstart");
    return String(
      component.getFirstProperty("dtstart")?.getParameter("tzid") ||
        (start instanceof ICAL.Time && start.zone.tzid === "UTC"
          ? "UTC"
          : defaultZone),
    );
  };
  const seriesZones = new Map(
    components
      .filter((component) => !component.hasProperty("recurrence-id"))
      .map((component) => [
        String(component.getFirstPropertyValue("uid") || ""),
        componentZone(component),
      ]),
  );
  const result: CalendarEvent[] = [];
  const now = new Date().toISOString();
  for (const component of components) {
    if (
      component.getAllProperties("rrule").length > 1 ||
      component.hasProperty("exrule")
    )
      throw new Error(
        "This calendar uses multiple recurrence rules. Export it with one recurrence rule per event.",
      );
    if (component.getFirstProperty("recurrence-id")?.getParameter("range"))
      throw new Error(
        "This calendar changes an occurrence and all future instances. Export these as separate series before importing.",
      );
    const event = new ICAL.Event(component);
    if (!event.uid || !event.startDate)
      throw new Error(
        "An imported event is missing its identifier or start date",
      );
    const startZone = componentZone(component);
    // Express detached instances in their series zone before matching occurrence IDs.
    const zone = component.hasProperty("recurrence-id")
      ? seriesZones.get(event.uid) || startZone
      : startZone;
    new Intl.DateTimeFormat("en", { timeZone: zone });
    const dateInZone = (value: ICAL.Time, sourceZone = zone) => {
      if (value.isDate) return value.toString();
      const text = value.toString();
      const from = text.endsWith("Z") ? "UTC" : sourceZone;
      return Temporal.PlainDateTime.from(text.replace(/Z$/, ""))
        .toZonedDateTime(from)
        .withTimeZone(zone)
        .toPlainDateTime()
        .toString({ smallestUnit: "second" });
    };
    const start = dateInZone(event.startDate, startZone),
      end = dateInZone(
        event.endDate,
        String(
          component.getFirstProperty("dtend")?.getParameter("tzid") ||
            startZone,
        ),
      );
    const recurrenceId = event.recurrenceId
      ? dateInZone(
          event.recurrenceId,
          String(
            component.getFirstProperty("recurrence-id")?.getParameter("tzid") ||
              zone,
          ),
        )
      : "";
    const recurrence =
      component.getFirstPropertyValue("rrule")?.toString() || "";
    const uid = event.uid,
      fingerprint = hash(component.toString());
    const item = normalizePlanningRecord("events", {
      id: sourceId(connectionId, calendarId, uid, recurrenceId),
      createdAt: now,
      updatedAt: now,
      title: event.summary || "Untitled event",
      description: event.description || "",
      start,
      end,
      timeZone: zone,
      allDay: event.startDate.isDate,
      calendarId,
      location: event.location || "",
      linkedRefs: [],
      kind: "event",
      reminderMinutes: null,
      recurrence,
      recurrenceDates: [],
      participants: component.getAllProperties("attendee").map((property) => {
        const value = String(property.getFirstValue() || ""),
          email = value.replace(/^mailto:/i, "");
        return {
          name: String(property.getParameter("cn") || email),
          ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
        };
      }),
      exceptions: {},
      source: {
        connectionId,
        calendarId,
        uid,
        recurrenceId,
        fingerprint,
        cancelled: component.getFirstPropertyValue("status") === "CANCELLED",
      },
    });
    for (const property of component.getAllProperties("rdate")) {
      for (const value of property.getValues()) {
        if (value instanceof ICAL.Period) {
          const key = dateInZone(
            value.start,
            String(property.getParameter("tzid") || zone),
          );
          item.recurrenceDates!.push(key);
          item.exceptions[key] = {
            end: dateInZone(
              value.getEnd(),
              String(property.getParameter("tzid") || zone),
            ),
          };
        } else if (value instanceof ICAL.Time) {
          item.recurrenceDates!.push(
            dateInZone(value, String(property.getParameter("tzid") || zone)),
          );
        } else
          throw new Error("An additional recurrence date could not be read");
      }
    }
    for (const property of component.getAllProperties("exdate"))
      for (const value of property.getValues()) {
        if (!(value instanceof ICAL.Time))
          throw new Error("An excluded recurrence date could not be read");
        item.exceptions[
          dateInZone(value, String(property.getParameter("tzid") || zone))
        ] = { cancelled: true };
      }
    result.push(item);
  }
  // Detached recurrence instances are overrides on the original series, never duplicates.
  for (const item of result.filter((x) => x.source?.recurrenceId)) {
    const parent = result.find(
      (x) => x.source?.uid === item.source?.uid && !x.source?.recurrenceId,
    );
    if (parent && item.source?.recurrenceId)
      parent.exceptions[item.source.recurrenceId] = {
        title: item.title,
        start: item.start,
        end: item.end,
        location: item.location,
        description: item.description,
        cancelled: item.source.cancelled,
      };
  }
  for (const item of result) {
    item.sourceExceptions = item.exceptions;
    item.exceptions = {};
    if (item.source)
      item.source.fingerprint = hash(
        JSON.stringify([item.source.fingerprint, item.sourceExceptions]),
      );
  }
  const identities = result.map((item) => item.id);
  if (new Set(identities).size !== identities.length)
    throw new Error("The file contains duplicate event identities");
  return result.filter(
    (item) =>
      !item.source?.recurrenceId ||
      !result.some(
        (parent) =>
          parent.source?.uid === item.source?.uid &&
          !parent.source?.recurrenceId,
      ),
  );
}

export function mergeImportedEvents(
  state: PlanningState,
  incoming: CalendarEvent[],
  connectionId: string,
  scope?: { start: string; end: string },
): PlanningState {
  const existing = new Map(state.events.map((x) => [x.id, x]));
  for (const next of incoming) {
    const previous = existing.get(next.id);
    if (previous)
      existing.set(next.id, {
        ...next,
        createdAt: previous.createdAt,
        archivedAt: previous.archivedAt,
        overrides: previous.overrides,
        exceptions: previous.exceptions,
        source: {
          ...next.source!,
          changed: Boolean(
            previous.source?.changed ||
              (previous.source?.fingerprint !== next.source?.fingerprint &&
                (previous.overrides ||
                  Object.keys(previous.exceptions).length)),
          ),
        },
      });
    else existing.set(next.id, next);
  }
  const ids = new Set(incoming.map((x) => x.id));
  for (const previous of state.events) {
    if (previous.source?.connectionId !== connectionId || ids.has(previous.id))
      continue;
    // Windowed provider queries are not proof of deletion: events can move outside the window.
    if (scope) continue;
    existing.set(previous.id, {
      ...previous,
      source: { ...previous.source, cancelled: true, changed: true },
    });
  }
  return { ...state, events: [...existing.values()] };
}

export function morgenEvent(
  raw: Record<string, unknown>,
  connectionId: string,
  accountId: string,
  calendarId: string,
): CalendarEvent {
  const now = new Date().toISOString(),
    start = String(raw.start || ""),
    zone = String(raw.timeZone || "UTC");
  const allDay = raw.showWithoutTime === true;
  const duration = Temporal.Duration.from(
    String(raw.duration || (allDay ? "P1D" : "PT1H")),
  );
  const startValue = allDay ? start.slice(0, 10) : start.replace(/Z$/, "");
  const end = Temporal.PlainDateTime.from(
    startValue.length === 10 ? `${startValue}T00:00:00` : startValue,
  )
    .add(duration)
    .toString();
  const uid = String(raw.id || raw.uid || ""),
    recurrenceId = String(raw.recurrenceId || "");
  if (!uid) throw new Error("Morgen returned an event without an identifier");
  return normalizePlanningRecord("events", {
    id: sourceId(connectionId, accountId, calendarId, uid, recurrenceId),
    createdAt: now,
    updatedAt: now,
    title: String(raw.title || "Untitled event"),
    description: String(raw.description || "").replace(/<[^>]*>/g, ""),
    start: startValue,
    end: allDay ? end.slice(0, 10) : end,
    timeZone: zone,
    allDay,
    calendarId: sourceId(connectionId, accountId, calendarId),
    location:
      raw.locations && typeof raw.locations === "object"
        ? Object.values(raw.locations as Record<string, { name?: string }>)
            .map((location) => location.name || "")
            .filter(Boolean)
            .join(" · ")
        : String(raw.location || ""),
    participants:
      raw.participants && typeof raw.participants === "object"
        ? Object.values(
            raw.participants as Record<
              string,
              { name?: string; email?: string }
            >,
          ).map((person) => ({
            name: person.name || person.email || "Participant",
            ...(person.email ? { email: person.email } : {}),
          }))
        : [],
    linkedRefs: [],
    recurrence: "",
    exceptions: {},
    kind: "event",
    reminderMinutes: null,
    source: {
      connectionId,
      calendarId,
      accountId,
      uid,
      recurrenceId,
      fingerprint: hash(JSON.stringify(raw)),
    },
  });
}
