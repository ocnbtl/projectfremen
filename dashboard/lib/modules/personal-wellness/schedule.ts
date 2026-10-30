import { Temporal } from "@js-temporal/polyfill";
import type { WellnessSchedule } from "./types";

export function validateWellnessSchedule(value: unknown): WellnessSchedule | null {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a valid calendar schedule.");
  const raw = value as Record<string, unknown>;
  if (typeof raw.start !== "string" || typeof raw.end !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw.start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw.end) || typeof raw.timeZone !== "string" || raw.timeZone.length > 100 || typeof raw.calendarId !== "string" || !raw.calendarId || raw.calendarId.length > 200) throw new Error("Choose a calendar, start, end and time zone.");
  let start: Temporal.ZonedDateTime, end: Temporal.ZonedDateTime;
  try {
    start = Temporal.PlainDateTime.from(raw.start, { overflow: "reject" }).toZonedDateTime(raw.timeZone);
    end = Temporal.PlainDateTime.from(raw.end, { overflow: "reject" }).toZonedDateTime(raw.timeZone);
  } catch { throw new Error("Choose valid dates, times and a time zone."); }
  if (start.toPlainDateTime().toString({ smallestUnit: "minute" }) !== raw.start || end.toPlainDateTime().toString({ smallestUnit: "minute" }) !== raw.end) throw new Error("That time does not exist because the clocks change. Choose another time.");
  if (end.epochMilliseconds <= start.epochMilliseconds) throw new Error("End time must be after start time.");
  if (end.epochMilliseconds - start.epochMilliseconds > 7 * 86400000) throw new Error("A meal or workout schedule can span up to seven days.");
  return { start: raw.start, end: raw.end, timeZone: raw.timeZone, calendarId: raw.calendarId };
}
/** Moving the start preserves duration; editing the end never moves the start. */
export function moveWellnessStart(schedule: WellnessSchedule, start: string): WellnessSchedule {
  try {
    const priorStart = Temporal.PlainDateTime.from(schedule.start).toZonedDateTime(schedule.timeZone);
    const priorEnd = Temporal.PlainDateTime.from(schedule.end).toZonedDateTime(schedule.timeZone);
    const nextStart = Temporal.PlainDateTime.from(start).toZonedDateTime(schedule.timeZone);
    const duration = Math.max(60000, priorEnd.epochMilliseconds - priorStart.epochMilliseconds);
    const end = Temporal.Instant.fromEpochMilliseconds(nextStart.epochMilliseconds + duration).toZonedDateTimeISO(schedule.timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
    return { ...schedule, start, end };
  } catch { return { ...schedule, start }; }
}
