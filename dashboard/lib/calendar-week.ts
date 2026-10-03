import { Temporal } from "@js-temporal/polyfill";

/** Product-wide week convention: Sunday through Saturday. */
export const calendarWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekStart(date: string): string {
  const day = Temporal.PlainDate.from(date);
  return day.subtract({ days: day.dayOfWeek % 7 }).toString();
}

export function visibleWeekdays(showWeekends = true): string[] {
  return showWeekends ? calendarWeekdays : calendarWeekdays.slice(1, 6);
}
