import type { PersonalOpsObject, PersonalOpsRoutine } from "./types";
export const PERSONAL_HOME_TYPES = ["goal", "routine", "follow_up", "decision", "obligation"] as const;
export type PersonalHomeType = typeof PERSONAL_HOME_TYPES[number];
export type PersonalAgendaEntry = { id: string; title: string; date: string; endDate?: string; time?: string; sortTime?: number; href: string; source: string; type?: PersonalHomeType; completed?: boolean };
export function parseHomeTypes(value: string | null): PersonalHomeType[] {
  const selected = PERSONAL_HOME_TYPES.filter(type => value?.split(",").includes(type));
  return selected.length ? selected : [...PERSONAL_HOME_TYPES];
}
export function toggleHomeType(selected: PersonalHomeType[], type: PersonalHomeType): PersonalHomeType[] {
  if (selected.length === PERSONAL_HOME_TYPES.length) return [type];
  const next = selected.includes(type) ? selected.filter(item=>item!==type) : [...selected,type];
  return next.length ? next : [...PERSONAL_HOME_TYPES];
}
export function personalAgendaDate(item: PersonalOpsObject | PersonalOpsRoutine): string {
  if (item.objectType === "routine") return (item.nextRunDate || item.nextRunAt || "").slice(0,10);
  if (item.objectType === "follow_up") return (item.deferredUntil || item.dueAt || "").slice(0,10);
  if (item.objectType === "decision") return (item.revisitAt || item.dueAt || "").slice(0,10);
  return (item.dueAt || "").slice(0,10);
}
export function weekStart(today = new Date()): string {
  const date = new Date(today.getFullYear(),today.getMonth(),today.getDate(),12);
  date.setDate(date.getDate() - (date.getDay()+6)%7);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
