import { Temporal } from "@js-temporal/polyfill";
import type { NativeObjectRef } from "../../native-objects/types";
import { parseBirthday } from "../people/birthday";
import { addDays, instantFor } from "./calendar-model";
import type { CalendarObservanceSettings, EventOccurrence } from "./types";

export type BirthdaySource = { ref: NativeObjectRef; birthday: string };
export type HolidayDate = { key: string; country: string; name: string; date: string; end: string; type: string; defaultVisible: boolean };
export type HolidayCatalog = { countries: { code: string; name: string }[]; holidays: HolidayDate[] };
export const defaultObservances = (): CalendarObservanceSettings => ({ birthdays: true, countries: ["US"], hiddenHolidays: [], extraHolidays: [], custom: [] });
export const observanceAppearance = (settings: CalendarObservanceSettings, key: string, name = "Holidays") => settings.appearances?.[key] || { name: key === "birthdays" ? "People’s birthdays" : key === "custom" ? "Custom dates" : name, color: key === "birthdays" ? "#5A6040" : "#716B80" };

export const holidayVisible = (holiday: HolidayDate, settings: CalendarObservanceSettings) =>
  settings.countries.includes(holiday.country) && !settings.hiddenHolidays.includes(holiday.key) && (holiday.defaultVisible || settings.extraHolidays.includes(holiday.key));

/** Derived annotations never create editable copies of People or holiday records. */
export function calendarObservances(birthdays: BirthdaySource[], holidays: HolidayDate[], settings: CalendarObservanceSettings, start: string, end: string, zone: string): EventOccurrence[] {
  const items: EventOccurrence[] = [];
  const push = (id: string, title: string, day: string, until: string, system: NonNullable<EventOccurrence["system"]>, ownerRef?: NativeObjectRef, allDay = true, timeZone = zone) => {
    const startMs = instantFor(day, timeZone), endMs = instantFor(until, timeZone);
    if (startMs >= instantFor(end, zone) || endMs <= instantFor(start, zone)) return;
    const appearance = observanceAppearance(settings, system.kind === "birthday" ? "birthdays" : system.kind === "holiday" ? `holidays:${system.country}` : "custom");
    items.push({ id, eventId: id, occurrenceKey: day, title, description: system.detail, start: day, end: until, startMs, endMs, timeZone, allDay, calendarId: "system", location: "", linkedRefs: ownerRef ? [ownerRef] : [], recurrence: "", reminderMinutes: null, kind: "event", overridden: false, ownerRef, system: { ...system, color: appearance.color, calendarName: appearance.name } });
  };
  const years = Array.from({ length: Number(end.slice(0, 4)) - Number(start.slice(0, 4)) + 1 }, (_, i) => Number(start.slice(0, 4)) + i);
  if (settings.birthdays) for (const person of birthdays) {
    const parts = parseBirthday(person.birthday);
    if (!parts) continue;
    for (const year of years) {
      if (parts.year && year < parts.year) continue;
      // Keep leap-day birthdays on February 29; don't invent an alternate birthday.
      let day: string;
      try { day = Temporal.PlainDate.from({ year, month: parts.month, day: parts.day }, { overflow: "reject" }).toString(); } catch { continue; }
      push(`birthday:${person.ref.objectId}:${year}`, `${person.ref.label}’s birthday`, day, addDays(day, 1), { kind: "birthday", key: person.ref.objectId, detail: "Birthday from People. Update the date on their profile." }, person.ref);
    }
  }
  for (const holiday of holidays) if (holidayVisible(holiday, settings)) push(`holiday:${holiday.key}:${holiday.date}`, holiday.name, holiday.date, holiday.end, { kind: "holiday", key: holiday.key, country: holiday.country, detail: `${holiday.type === "public" ? "Public holiday" : "Observance"} · ${holiday.country}` });
  for (const custom of settings.custom.filter(x => x.visible)) for (const year of custom.annual ? [...new Set([years[0] - 1, ...years, years[years.length - 1] + 1])] : [Number(custom.date.slice(0, 4))]) {
    let day: string;
    try { day = Temporal.PlainDate.from(`${year}-${custom.date.slice(5)}`, { overflow: "reject" }).toString(); } catch { continue; }
    const allDay = custom.allDay !== false;
    const span = custom.endDate ? Temporal.PlainDate.from(custom.endDate).since(Temporal.PlainDate.from(custom.date)).days : 0;
    push(`custom:${custom.id}:${year}`, custom.title, allDay ? day : `${day}T${custom.startTime}`, allDay ? addDays(day, 1) : `${addDays(day, span)}T${custom.endTime}`, { kind: "custom", key: custom.id, detail: custom.annual ? "Custom date · Every year" : "Custom date · One time" }, undefined, allDay, allDay ? zone : custom.timeZone || zone);
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
