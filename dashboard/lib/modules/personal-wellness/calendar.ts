import type { CalendarEvent, EventOccurrence } from "../planning/types";
import type { WellnessEntry } from "./types";
import { firstWellnessDate, isWellnessDate, wellnessOccurrence } from "./schedule";
import { readWellnessState } from "./store";
export type WellnessCalendarEvent = CalendarEvent & { wellnessSource: NonNullable<EventOccurrence["wellnessSource"]> };
export const wellnessCalendarId = (section: "meals" | "fitness", id: string) => `wellness-${section}-${id}`;
export function wellnessCalendarEvents(section: "meals" | "fitness", entries: WellnessEntry[]): WellnessCalendarEvent[] {
  return entries.filter(entry => !entry.archived && entry.schedule && entry.kind === (section === "meals" ? "meal" : "workout")).map(entry => {
    const schedule = entry.schedule!;
    const dayCodes = ["MO","TU","WE","TH","FR","SA","SU"];
    const exceptions: CalendarEvent["exceptions"] = {};
    for (const [date, override] of Object.entries(entry.occurrenceOverrides || {})) if (schedule.repeat && isWellnessDate(schedule, date)) exceptions[`${date}${schedule.start.slice(10)}:00`] = { ...override, cancelled: override.skipped === true };
    return ({
    ...schedule, start: firstWellnessDate(schedule) + schedule.start.slice(10), end: wellnessOccurrence({ ...entry, occurrenceOverrides: {} }, firstWellnessDate(schedule))!.end, id: wellnessCalendarId(section, entry.id), title: entry.title, description: "", allDay: false,
    // Private recipe, exercise and care notes stay in Personal, including in shared feeds.
    location: "", linkedRefs: [], recurrence: schedule.repeat ? `FREQ=WEEKLY;BYDAY=${schedule.repeat.weekdays.map(day=>dayCodes[day-1]).join(",")}${schedule.repeat.until ? `;UNTIL=${schedule.repeat.until.replaceAll("-", "")}T235959` : ""}` : "", reminderMinutes: null, kind: "event", isTask: true, completed: schedule.repeat ? false : entry.status === "completed",
    createdAt: entry.createdAt, updatedAt: entry.updatedAt, exceptions, wellnessSource: { section, id: entry.id, updatedAt: entry.updatedAt, repeating: Boolean(schedule.repeat) }
  }); });
}
export async function readWellnessCalendarEvents(): Promise<WellnessCalendarEvent[]> {
  const [meals, fitness] = await Promise.all([readWellnessState("meals"), readWellnessState("fitness")]);
  return [...wellnessCalendarEvents("meals", meals.entries), ...wellnessCalendarEvents("fitness", fitness.entries)];
}
