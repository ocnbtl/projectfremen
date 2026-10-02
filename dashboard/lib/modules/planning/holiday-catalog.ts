import Holidays from "date-holidays";
import { addDays } from "./calendar-model";
import type { HolidayCatalog } from "./observances";

const countries = Object.entries(new Holidays().getCountries("en")).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
const commonUS = new Set(["Valentine's Day", "St. Patrick's Day", "Easter Sunday", "Mother's Day", "Father's Day", "Halloween", "Christmas Eve", "New Year's Eve"]);
const cache = new Map<string, HolidayCatalog["holidays"]>();

/** Public rules are computed locally; private calendar data is never sent to a provider. */
export function holidayCatalog(selected: string[], years: number[]): HolidayCatalog {
  const holidays: HolidayCatalog["holidays"] = [];
  for (const country of selected) {
    if (!countries.some(x => x.code === country)) continue;
    for (const year of years) {
      const cacheKey = `${country}:${year}`;
      let dates = cache.get(cacheKey);
      if (!dates) {
        const calendar = new Holidays(country, { languages: ["en"], timezone: "UTC" });
        dates = calendar.getHolidays(year).map(item => {
          const date = item.date.slice(0, 10), end = item.end.toISOString().slice(0, 10);
          return { key: `${country}:${item.rule}`, country, name: item.name, date, end: end > date ? end : addDays(date, 1), type: item.type, defaultVisible: item.type === "public" || (country === "US" && commonUS.has(item.name)) };
        });
        if (cache.size >= 300) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, dates);
      }
      holidays.push(...dates);
    }
  }
  return { countries, holidays: [...new Map(holidays.map(x => [`${x.key}:${x.date}`, x])).values()] };
}
