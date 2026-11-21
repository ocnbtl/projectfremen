import { readDeviceDaily } from "./settings/device";
import { Temporal } from "@js-temporal/polyfill";

/** Public calendars keep the established Sunday start. */
const mondayFirst = () => typeof window !== "undefined" && window.location.pathname.startsWith("/admin/") && readDeviceDaily().weekStart === "monday";
export const calendarWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekStart(date: string): string {
  const day = Temporal.PlainDate.from(date);
  return day.subtract({ days: (day.dayOfWeek - Number(mondayFirst())) % 7 }).toString();
}

export function visibleWeekdays(showWeekends = true): string[] {
  if (!showWeekends) return calendarWeekdays.slice(1, 6);
  return mondayFirst() ? [...calendarWeekdays.slice(1),calendarWeekdays[0]] : calendarWeekdays;
}
