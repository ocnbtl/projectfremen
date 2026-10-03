import { Temporal } from "@js-temporal/polyfill";

export type CalendarView = "day" | "3-day" | "week" | "month" | "year" | "agenda";
export type DateScale = Exclude<CalendarView, "agenda" | "3-day">;
export const dateScales: DateScale[] = ["day", "week", "month", "year"];
export const navigationYear = (value: string, view: CalendarView) => {
  const date = Temporal.PlainDate.from(value);
  return view === "week" ? date.yearOfWeek! : date.year;
};
export const viewIcons: Record<CalendarView, string> = { day: "today", "3-day": "week", week: "week", month: "calendar-month-view", year: "view-grid", agenda: "list" };
export function calendarRange(value: string, view: CalendarView) {
  const day = Temporal.PlainDate.from(value);
  const first = view === "year" ? day.with({ month: 1, day: 1 }) : view === "month" ? day.with({ day: 1 }) : day;
  const start = view === "month" || view === "week" ? first.subtract({ days: first.dayOfWeek - 1 }) : first;
  const end = view === "year" ? start.add({ years: 1 }) : start.add({ days: view === "month" ? 42 : view === "week" ? 7 : view === "agenda" ? 30 : view === "3-day" ? 3 : 1 });
  return { start: start.toString(), end: end.toString() };
}
export function shiftCalendar(value: string, view: CalendarView, direction: number) {
  return Temporal.PlainDate.from(value).add(view === "year" ? { years: direction } : view === "month" ? { months: direction } : { days: direction * (view === "week" ? 7 : view === "agenda" ? 30 : view === "3-day" ? 3 : 1) }).toString();
}
/** ISO weeks start Monday; the first contains January 4. */
export function weeksOfYear(year: number) {
  const jan4 = Temporal.PlainDate.from({ year, month: 1, day: 4 });
  const start = jan4.subtract({ days: jan4.dayOfWeek - 1 });
  const nextJan4 = jan4.add({ years: 1 });
  const end = nextJan4.subtract({ days: nextJan4.dayOfWeek - 1 });
  return Array.from({ length: start.until(end).days / 7 }, (_, index) => ({ number: index + 1, start: start.add({ days: index * 7 }).toString(), end: start.add({ days: index * 7 + 6 }).toString() }));
}
