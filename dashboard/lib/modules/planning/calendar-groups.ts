import type { Calendar, EventGroup } from "./types";

export const GROUP_ICONS = [
  "briefcase",
  "university",
  "person",
  "routine",
  "travel",
  "star",
  "goal",
  "users",
];
export const DEFAULT_EVENT_GROUPS: EventGroup[] = [
  { id: "work", name: "Work", color: "#59518B", icon: "briefcase" },
  { id: "school", name: "School", color: "#A17B35", icon: "university" },
  { id: "personal", name: "Personal", color: "#79824E", icon: "person" },
  { id: "wellness", name: "Wellness", color: "#548580", icon: "routine" },
  { id: "travel", name: "Travel", color: "#AD6C55", icon: "travel" },
];
export const calendarGroups = (calendar?: Calendar) =>
  calendar?.groups ?? DEFAULT_EVENT_GROUPS;
export const eventGroup = (calendar: Calendar | undefined, groupId?: string) =>
  calendarGroups(calendar).find((g) => g.id === groupId);
