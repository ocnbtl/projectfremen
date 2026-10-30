import type { CalendarEvent, EventOccurrence } from "../planning/types";
import type { WellnessEntry } from "./types";
import { readWellnessState } from "./store";
export type WellnessCalendarEvent = CalendarEvent & { wellnessSource: NonNullable<EventOccurrence["wellnessSource"]> };
export const wellnessCalendarId = (section: "meals" | "fitness", id: string) => `wellness-${section}-${id}`;
export function wellnessCalendarEvents(section: "meals" | "fitness", entries: WellnessEntry[]): WellnessCalendarEvent[] {
  return entries.filter(entry => !entry.archived && entry.schedule && entry.kind === (section === "meals" ? "meal" : "workout")).map(entry => ({
    ...entry.schedule!, id: wellnessCalendarId(section, entry.id), title: entry.title, description: "", allDay: false,
    // Private recipe, exercise and care notes stay in Personal, including in shared feeds.
    location: "", linkedRefs: [], recurrence: "", reminderMinutes: null, kind: "event", isTask: true, completed: entry.status === "completed",
    createdAt: entry.createdAt, updatedAt: entry.updatedAt, exceptions: {}, wellnessSource: { section, id: entry.id, updatedAt: entry.updatedAt }
  }));
}
export async function readWellnessCalendarEvents(): Promise<WellnessCalendarEvent[]> {
  const [meals, fitness] = await Promise.all([readWellnessState("meals"), readWellnessState("fitness")]);
  return [...wellnessCalendarEvents("meals", meals.entries), ...wellnessCalendarEvents("fitness", fitness.entries)];
}
