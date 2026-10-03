"use client";
import { useMemo } from "react";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import { addDays, localFor } from "../../lib/modules/planning/calendar-model";
import CalendarMiniMonth from "./CalendarMiniMonth";
import styles from "./CalendarWorkspace.module.css";

export default function CalendarYearView({ date, today, zone, events, linked, showWeekends, onDay, onMonth, compact = false }: {
  compact?: boolean; date: string; today: string; zone: string; events: EventOccurrence[]; linked: { start: string; end: string }[]; showWeekends: boolean; onDay: (day: string) => void; onMonth: (day: string) => void;
}) {
  const year = date.slice(0, 4);
  const counts = useMemo(() => {
    const result = new Map<string, number>(), first = `${year}-01-01`, last = `${Number(year) + 1}-01-01`;
    const ranges = [...events.map(event => ({ start: localFor(event.startMs, zone).slice(0, 10), end: addDays(localFor(event.endMs - 1, zone).slice(0, 10), 1) })), ...linked];
    for (const item of ranges) for (let day = item.start < first ? first : item.start; day < item.end && day < last; day = addDays(day, 1)) result.set(day, (result.get(day) || 0) + 1);
    return result;
  }, [events, linked, year, zone]);
  return <div className={styles.yearView} data-month-collection aria-label={`${year} year calendar`}>
    {Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}-01`).map(month => <CalendarMiniMonth key={month} overview={compact} month={month} value={date} today={today} showWeekends={showWeekends} counts={counts} onSelect={onDay} onMonth={onMonth} />)}
  </div>;
}
