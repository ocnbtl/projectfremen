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
  for (const holiday of holidays) if (!settings.disabledCountries?.includes(holiday.country) && holidayVisible(holiday, settings)) push(`holiday:${holiday.key}:${holiday.date}`, holiday.name, holiday.date, holiday.end, { kind: "holiday", key: holiday.key, country: holiday.country, detail: `${holiday.type === "public" ? "Public holiday" : "Observance"} · ${holiday.country}` });
  for (const custom of settings.custom.filter(x => settings.customVisible !== false && x.visible)) for (const day of customDateOccurrences(custom, start, end)) {
    const allDay = custom.allDay !== false;
    const span = custom.endDate ? Temporal.PlainDate.from(custom.endDate).since(Temporal.PlainDate.from(custom.date)).days : 0;
    push(`custom:${custom.id}:${day}`, custom.title, allDay ? day : `${day}T${custom.startTime}`, allDay ? addDays(day, 1) : `${addDays(day, span)}T${custom.endTime}`, { kind: "custom", key: custom.id, detail: `Custom date · ${customRepeatLabel(custom)}` }, undefined, allDay, allDay ? zone : custom.timeZone || zone);
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

export function customRepeatLabel(custom: CalendarObservanceSettings["custom"][number]) {
  const repeat = custom.repeat;
  if (!repeat) return custom.annual ? "Every year" : "One time";
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[repeat.frequency];
  return repeat.interval === 1 ? `Every ${unit}` : `Every ${repeat.interval} ${unit}s`;
}

function customDateOccurrences(custom: CalendarObservanceSettings["custom"][number], start: string, end: string) {
  const seed = Temporal.PlainDate.from(custom.date), repeat = custom.repeat;
  if (!repeat) {
    const years = custom.annual ? Array.from({ length: Number(end.slice(0, 4)) - Number(start.slice(0, 4)) + 3 }, (_, i) => Number(start.slice(0, 4)) - 1 + i) : [seed.year];
    return years.flatMap(year => { try { return [seed.with({ year }, { overflow: "reject" }).toString()]; } catch { return []; } });
  }
  // Seek directly to the range, preserving the seed's day (Jan 31 skips February).
  const span = custom.endDate ? seed.until(Temporal.PlainDate.from(custom.endDate)).days : 0;
  const low = Temporal.PlainDate.from(start).subtract({ days: span + 1 }), high = Temporal.PlainDate.from(end).add({ days: 1 });
  const elapsed = repeat.frequency === "yearly" ? low.year - seed.year : repeat.frequency === "monthly" ? (low.year - seed.year) * 12 + low.month - seed.month : seed.until(low).days / (repeat.frequency === "weekly" ? 7 : 1);
  const unit = { daily: "days", weekly: "weeks", monthly: "months", yearly: "years" }[repeat.frequency];
  const dates: string[] = [];
  for (let index = Math.max(0, Math.floor(elapsed / repeat.interval)); ; index++) {
    const duration = { [unit]: index * repeat.interval };
    if (Temporal.PlainDate.compare(seed.add(duration), high) > 0) break;
    try { const day = seed.add(duration, { overflow: "reject" }); if (Temporal.PlainDate.compare(day, low) >= 0) dates.push(day.toString()); } catch { /* Skip dates absent from that month/year. */ }
  }
  return dates;
}
