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
    return { id: item.id, title: item.title.trim(), date: item.date, annual: item.annual === true, visible: item.visible !== false };
  });
  if (new Set(custom.map(x => x.id)).size !== custom.length) throw new Error("Custom dates must have unique ids");
  return { birthdays: raw.birthdays !== false, countries, hiddenHolidays: strings(raw.hiddenHolidays, 5000, 600), extraHolidays: strings(raw.extraHolidays, 5000, 600), custom };
}
