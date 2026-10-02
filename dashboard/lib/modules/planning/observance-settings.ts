import { Temporal } from "@js-temporal/polyfill";
import type { CalendarObservanceSettings } from "./types";

export function normalizeObservances(value: unknown): CalendarObservanceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid calendar observances");
  const raw = value as Record<string, unknown>;
  const strings = (input: unknown, limit: number, maxLength: number) => {
    if (!Array.isArray(input) || input.length > limit || input.some(x => typeof x !== "string" || !x || x.length > maxLength)) throw new Error("Invalid holiday selection");
    return [...new Set(input as string[])];
  };
  const countries = strings(raw.countries, 250, 2);
  if (countries.some(x => !/^[A-Z]{2}$/.test(x))) throw new Error("Choose a valid holiday country");
  if (!Array.isArray(raw.custom) || raw.custom.length > 100) throw new Error("Use up to 100 custom dates");
  const custom = raw.custom.map(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)) throw new Error("Invalid custom date");
    if (typeof item.title !== "string" || !item.title.trim() || item.title.trim().length > 240) throw new Error("Custom dates need a name of up to 240 characters");
    if (typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error("Choose a valid custom date");
    Temporal.PlainDate.from(item.date, { overflow: "reject" });
    const base = { id: item.id, title: item.title.trim(), date: item.date, annual: item.annual === true, visible: item.visible !== false };
    if (item.allDay !== false) return base;
    if (![item.startTime, item.endTime].every(time => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error("Choose valid start and end times");
    const endDate = typeof item.endDate === "string" ? item.endDate : item.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("Choose a valid end date");
    Temporal.PlainDate.from(endDate, { overflow: "reject" });
    const timeZone = typeof item.timeZone === "string" ? item.timeZone : "UTC";
    try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new Error("Choose a recognized time zone"); }
    const start = Temporal.PlainDateTime.from(`${item.date}T${item.startTime}`).toZonedDateTime(timeZone);
    const end = Temporal.PlainDateTime.from(`${endDate}T${item.endTime}`).toZonedDateTime(timeZone);
    if (end.epochMilliseconds <= start.epochMilliseconds) throw new Error("The end must be after the start");
    if (Temporal.PlainDate.from(endDate).since(Temporal.PlainDate.from(item.date)).days > 366) throw new Error("Custom dates can span up to one year");
    return { ...base, allDay: false, startTime: item.startTime, endTime: item.endTime, endDate, timeZone };
  });
  if (new Set(custom.map(x => x.id)).size !== custom.length) throw new Error("Custom dates must have unique ids");
  const appearances: NonNullable<CalendarObservanceSettings["appearances"]> = {};
  if (raw.appearances !== undefined) {
    if (!raw.appearances || typeof raw.appearances !== "object" || Array.isArray(raw.appearances) || Object.keys(raw.appearances).length > 252) throw new Error("Invalid calendar colors");
    for (const [key, entry] of Object.entries(raw.appearances)) {
      const appearance = entry as { name?: unknown; color?: unknown };
      if (!/^(birthdays|custom|holidays:[A-Z]{2})$/.test(key) || !appearance || typeof appearance.name !== "string" || !appearance.name.trim() || appearance.name.length > 120 || typeof appearance.color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(appearance.color)) throw new Error("Choose a calendar name and color");
      appearances[key] = { name: appearance.name.trim(), color: appearance.color };
    }
  }
  return { birthdays: raw.birthdays !== false, countries, hiddenHolidays: strings(raw.hiddenHolidays, 5000, 600), extraHolidays: strings(raw.extraHolidays, 5000, 600), custom, ...(raw.appearances !== undefined ? { appearances } : {}) };
}
