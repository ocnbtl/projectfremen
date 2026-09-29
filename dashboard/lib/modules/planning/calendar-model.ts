import { Temporal } from "@js-temporal/polyfill";
import ICAL from "ical.js";
import {
  effectiveEvent,
  type CalendarEvent,
  type EventOccurrence,
  type EventFields,
} from "./types";

export const localDate = (instant: Date, zone: string) =>
  Temporal.Instant.from(instant.toISOString())
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
export function instantFor(value: string, zone: string): number {
  const dateTime = value.length === 10 ? `${value}T00:00:00` : value;
  return Number(
    Temporal.PlainDateTime.from(dateTime).toZonedDateTime(zone)
      .epochMilliseconds,
  );
}
export function localFor(ms: number, zone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export function addDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date.slice(0, 10)).add({ days }).toString();
}
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
export function weekStart(date: string): string {
  const d = Temporal.PlainDate.from(date);
  return d.subtract({ days: d.dayOfWeek - 1 }).toString();
}
export function shiftMonth(date: string, months: number): string {
  return Temporal.PlainDate.from(date).add({ months }).toString();
}

export function validateEventTime(fields: EventFields): void {
  if (
    fields.allDay &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(fields.start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fields.end))
  )
    throw new Error("All-day events need date-only start and end values");
  if (
    !fields.allDay &&
    (!fields.start.includes("T") || !fields.end.includes("T"))
  )
    throw new Error("Choose a start and end time");
  if (
    instantFor(fields.end, fields.timeZone) <=
    instantFor(fields.start, fields.timeZone)
  )
    throw new Error("The end must be after the start");
  if (fields.recurrence) {
    const rule = ICAL.Recur.fromString(fields.recurrence);
    if (
      !rule.freq ||
      !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.freq)
    )
      throw new Error("Use a daily, weekly, monthly, or yearly recurrence");
    if (rule.interval < 1 || (rule.count !== null && rule.count < 1))
      throw new Error("Recurrence intervals and counts must be positive");
  }
}

/** Expand wall-clock recurrence in its owning zone so DST does not shift appointments. */
export function eventOccurrences(
  events: CalendarEvent[],
  from: string,
  to: string,
  displayZone: string,
): EventOccurrence[] {
  const low = instantFor(from, displayZone),
    high = instantFor(to, displayZone);
  const output: EventOccurrence[] = [];
  for (const original of events) {
    if (
      original.archivedAt ||
      original.source?.cancelled ||
      original.overrides?.cancelled
    )
      continue;
    const event = effectiveEvent(original);
    const exceptions = { ...original.sourceExceptions, ...original.exceptions };
    const duration = Temporal.PlainDateTime.from(
      event.end.length === 10 ? `${event.end}T00:00:00` : event.end,
    ).since(
      Temporal.PlainDateTime.from(
        event.start.length === 10 ? `${event.start}T00:00:00` : event.start,
      ),
    );
    const added = new Set<string>();
    const add = (key: string) => {
      if (added.has(key)) return;
      added.add(key);
      const exception = exceptions[key];
      if (exception?.cancelled) return;
      const end = Temporal.PlainDateTime.from(
        key.length === 10 ? `${key}T00:00:00` : key,
      )
        .add(duration)
        .toString();
      const item = {
        ...event,
        start: key,
        end: event.allDay ? end.slice(0, 10) : end,
        ...exception,
      };
      // All-day dates belong to calendar days, not UTC instants.
      const startMs = instantFor(
        item.start,
        item.allDay ? displayZone : item.timeZone,
      );
      const endMs = instantFor(
        item.end,
        item.allDay ? displayZone : item.timeZone,
      );
      if (startMs < high && endMs > low)
        output.push({
          ...item,
          id: `${original.id}@${key}`,
          eventId: original.id,
          occurrenceKey: key,
          startMs,
          endMs,
          overridden: Boolean(original.overrides || exception),
        });
    };
    for (const date of event.recurrenceDates || []) add(date);
    if (!event.recurrence) {
      add(event.start);
      continue;
    }
    const initial =
      event.start.length === 10
        ? ICAL.Time.fromDateString(event.start)
        : ICAL.Time.fromDateTimeString(
            Temporal.PlainDateTime.from(event.start).toString({
              smallestUnit: "second",
            }),
          );
    const rule = ICAL.Recur.fromString(event.recurrence);
    // DTSTART is deliberately floating for wall-clock recurrence. Convert an
    // absolute UNTIL into that same zone before the iterator compares it.
    if (rule.until && rule.until.zone.tzid === "UTC" && !event.allDay) {
      const until = Temporal.Instant.from(rule.until.toJSDate().toISOString())
        .toZonedDateTimeISO(event.timeZone)
        .toPlainDateTime()
        .toString({ smallestUnit: "second" });
      rule.until = ICAL.Time.fromDateTimeString(until);
    }
    const iterator = rule.iterator(initial);
    let step = 0;
    for (
      let occurrence = iterator.next();
      occurrence;
      occurrence = iterator.next()
    ) {
      if (++step > 50_000)
        throw new Error(
          "This recurrence is too large to display. Narrow its date range or add an end date.",
        );
      const key = occurrence.toString();
      if (instantFor(key, event.timeZone) >= high) break;
      add(key);
    }
    // An exception may have been moved into this range from an occurrence outside it.
    for (const [key, exception] of Object.entries(exceptions)) {
      if (
        exception.start &&
        !output.some((item) => item.id === `${original.id}@${key}`)
      )
        add(key);
    }
  }
  return output.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function calendarLayout(
  items: EventOccurrence[],
): Array<EventOccurrence & { column: number; columns: number }> {
  const result: Array<EventOccurrence & { column: number; columns: number }> =
    [];
  let group: typeof result = [],
    groupEnd = -Infinity;
  const finish = () => {
    const columns = Math.max(1, ...group.map((x) => x.column + 1));
    group.forEach((x) => {
      x.columns = columns;
    });
    result.push(...group);
    group = [];
  };
  for (const item of [...items].sort(
    (a, b) => a.startMs - b.startMs || b.endMs - a.endMs,
  )) {
    if (item.startMs >= groupEnd) finish();
    const used = new Set(
      group.filter((x) => x.endMs > item.startMs).map((x) => x.column),
    );
    let column = 0;
    while (used.has(column)) column++;
    group.push({ ...item, column, columns: 1 });
    groupEnd = Math.max(group.length === 1 ? -Infinity : groupEnd, item.endMs);
  }
  finish();
  return result;
}

/** Connected overlap groups let the UI offer a readable overflow list at high density. */
export function calendarOverlapGroups(
  items: EventOccurrence[],
): EventOccurrence[][] {
  const groups: EventOccurrence[][] = [];
  let end = -Infinity;
  for (const item of [...items].sort(
    (a, b) => a.startMs - b.startMs || b.endMs - a.endMs,
  )) {
    if (item.startMs >= end) {
      groups.push([]);
      end = item.endMs;
    }
    groups[groups.length - 1].push(item);
    end = Math.max(end, item.endMs);
  }
  return groups;
}
