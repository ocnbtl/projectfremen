import { Temporal } from "@js-temporal/polyfill";
import type { WellnessEntry, WellnessSchedule } from "./types";

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
  const schedule: WellnessSchedule = { start: raw.start, end: raw.end, timeZone: raw.timeZone, calendarId: raw.calendarId };
  if (raw.repeat != null) {
    const repeat = raw.repeat as Record<string, unknown>;
    if (!repeat || typeof repeat !== "object" || !Array.isArray(repeat.weekdays) || !repeat.weekdays.length || repeat.weekdays.length > 7 || repeat.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error("Choose at least one day to repeat.");
    let until: string | undefined;
    if (repeat.until !== undefined && repeat.until !== "") { try { if (typeof repeat.until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(repeat.until)) throw Error(); until = Temporal.PlainDate.from(repeat.until, { overflow: "reject" }).toString(); } catch { throw new Error("Choose a valid repeat end date."); } }
    schedule.repeat = { weekdays: [...new Set(repeat.weekdays as number[])].sort((a,b) => a-b), ...(until ? { until } : {}) };
    if (until && until < firstWellnessDate(schedule)) throw new Error("The end date must include at least one selected day.");
  }
  return schedule;
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

export const WELLNESS_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function firstWellnessDate(schedule: WellnessSchedule): string {
  let date = Temporal.PlainDate.from(schedule.start.slice(0,10));
  for (let i=0;i<7;i++,date=date.add({days:1})) if (!schedule.repeat || schedule.repeat.weekdays.includes(date.dayOfWeek)) return date.toString();
  return schedule.start.slice(0,10);
}
export function isWellnessDate(schedule: WellnessSchedule, date: string): boolean {
  try { const day = Temporal.PlainDate.from(date); return day.toString() === date && date >= schedule.start.slice(0,10) && (!schedule.repeat ? date === schedule.start.slice(0,10) : schedule.repeat.weekdays.includes(day.dayOfWeek) && (!schedule.repeat.until || date <= schedule.repeat.until)); } catch { return false; }
}
export function wellnessOccurrence(entry: WellnessEntry, date: string) {
  const schedule = entry.schedule;
  if (!schedule || !isWellnessDate(schedule, date)) return null;
  const duration = Temporal.PlainDateTime.from(schedule.end).since(Temporal.PlainDateTime.from(schedule.start));
  const original = Temporal.PlainDateTime.from(date + schedule.start.slice(10));
  const override = entry.occurrenceOverrides?.[date];
  return { date, skipped: Boolean(schedule.repeat && override?.skipped === true), start: override?.start || original.toString({smallestUnit:"minute"}), end: override?.end || original.add(duration).toString({smallestUnit:"minute"}), completed: schedule.repeat ? override?.completed === true : entry.status === "completed" };
}
export function wellnessOccurrences(entry: WellnessEntry, from: string, through: string) {
  const rows: NonNullable<ReturnType<typeof wellnessOccurrence>>[] = [];
  if (!entry.schedule || entry.archived) return rows;
  // Bounded windows for cards and summaries; no records are generated or preloaded.
  let date = Temporal.PlainDate.from(from);
  for (let i=0;i<366 && date.toString()<=through;i++,date=date.add({days:1})) { const row = wellnessOccurrence(entry,date.toString()); if(row && row.start.slice(0,10)>=from && row.start.slice(0,10)<=through) rows.push(row); }
  for(const [key,override] of Object.entries(entry.occurrenceOverrides || {})) if(override.start && override.start.slice(0,10)>=from && override.start.slice(0,10)<=through && !rows.some(row=>row.date===key)) {const row=wellnessOccurrence(entry,key);if(row)rows.push(row);}
  return rows.sort((a,b)=>a.start.localeCompare(b.start));
}
export function wellnessRepeatLabel(schedule: WellnessSchedule) { return schedule.repeat ? schedule.repeat.weekdays.map(day=>WELLNESS_WEEKDAYS[day-1].slice(0,3)).join(" · ") : ""; }
