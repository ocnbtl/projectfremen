import { Temporal } from "@js-temporal/polyfill";
import { weekStart } from "../../calendar-week";

export type CalendarView = "day" | "3-day" | "week" | "month" | "year" | "agenda";
export type DateScale = Exclude<CalendarView, "agenda" | "3-day">;
export const dateScales: DateScale[] = ["day", "week", "month", "year"];
export const navigationYear = (value: string, view: CalendarView) => {
  const date = Temporal.PlainDate.from(value);
  // A week belongs to the year containing its Saturday; week 1 contains January 1.
  return view === "week" ? Temporal.PlainDate.from(weekStart(value)).add({ days: 6 }).year : date.year;
};
export const viewIcons: Record<CalendarView, string> = { day: "today", "3-day": "calendar-three-days", week: "week", month: "calendar-month-view", year: "view-grid", agenda: "list" };
export function calendarRange(value: string, view: CalendarView, agendaDays = 30) {
  const day = Temporal.PlainDate.from(value);
  const first = view === "year" ? day.with({ month: 1, day: 1 }) : view === "month" ? day.with({ day: 1 }) : day;
  const start = view === "month" || view === "week" ? Temporal.PlainDate.from(weekStart(first.toString())) : first;
  const end = view === "year" ? start.add({ years: 1 }) : start.add({ days: view === "month" ? 42 : view === "week" ? 7 : view === "agenda" ? agendaDays : view === "3-day" ? 3 : 1 });
  return { start: start.toString(), end: end.toString() };
}
export function shiftCalendar(value: string, view: CalendarView, direction: number, agendaDays = 30) {
  return Temporal.PlainDate.from(value).add(view === "year" ? { years: direction } : view === "month" ? { months: direction } : { days: direction * (view === "week" ? 7 : view === "agenda" ? agendaDays : view === "3-day" ? 3 : 1) }).toString();
}
/** Sunday-first weeks; week 1 contains January 1, without duplicate boundary weeks. */
export function weeksOfYear(year: number) {
  const jan1 = Temporal.PlainDate.from({ year, month: 1, day: 1 });
  const start = Temporal.PlainDate.from(weekStart(jan1.toString()));
  const end = Temporal.PlainDate.from(weekStart(jan1.add({ years: 1 }).toString()));
  return Array.from({ length: start.until(end).days / 7 }, (_, index) => ({ number: index + 1, start: start.add({ days: index * 7 }).toString(), end: start.add({ days: index * 7 + 6 }).toString() }));
}
