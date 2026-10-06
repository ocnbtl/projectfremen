import { effectiveEvent, type CalendarEvent, type EventOccurrence } from "./types";
import { Temporal } from "@js-temporal/polyfill";

export type EventTimeChange = {
  eventId: string;
  title: string;
  occurrenceKey?: string;
  timeZone: string;
  before: { start: string; end: string };
  after: { start: string; end: string };
};
export function timeChange(event: CalendarEvent, occurrence: EventOccurrence, start: string, end: string): EventTimeChange {
  return { eventId: event.id, title: occurrence.title, occurrenceKey: event.recurrence || event.recurrenceDates?.length ? occurrence.occurrenceKey : undefined,
    timeZone: occurrence.timeZone, before: { start: occurrence.start, end: occurrence.end }, after: { start, end } };
}
export function timeChangePatch(event: CalendarEvent, change: EventTimeChange, undo = false): Partial<CalendarEvent> {
  const timing = undo ? change.before : change.after;
  if (!change.occurrenceKey) return { id: event.id, ...timing };
  return { id: event.id, exceptions: { ...event.exceptions, [change.occurrenceKey]: { ...event.exceptions[change.occurrenceKey], ...timing } } };
}
export function canUndoTimeChange(event: CalendarEvent, change: EventTimeChange): boolean {
  const current = { ...effectiveEvent(event), ...(change.occurrenceKey ? { ...event.sourceExceptions?.[change.occurrenceKey], ...event.exceptions[change.occurrenceKey] } : {}) };
  const sameTime = (a: string, b: string) => Temporal.PlainDateTime.compare(a.length === 10 ? `${a}T00:00` : a, b.length === 10 ? `${b}T00:00` : b) === 0;
  return !event.archivedAt && !current.cancelled && current.timeZone === change.timeZone && sameTime(current.start, change.after.start) && sameTime(current.end, change.after.end);
}
