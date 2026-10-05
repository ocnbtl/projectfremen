"use client";
import { useMemo, type CSSProperties } from "react";
import type { Calendar, EventOccurrence } from "../../lib/modules/planning/types";
import { addDays, localFor, weekStart } from "../../lib/modules/planning/calendar-model";
import { monthWeekLayout } from "../../lib/modules/planning/month-layout";
import { eventColors } from "./calendar-presentation";
import CalendarMiniMonth from "./CalendarMiniMonth";
import styles from "./CalendarWorkspace.module.css";

export default function CalendarYearView({ date, today, zone, events, calendars, linked, showWeekends, onDay, onMonth, compact = false }: {
  compact?: boolean; date: string; today: string; zone: string; events: EventOccurrence[]; calendars: Calendar[]; linked: { start: string; end: string }[]; showWeekends: boolean; onDay: (day: string) => void; onMonth: (day: string) => void;
}) {
  const year = date.slice(0, 4);
  const counts = useMemo(() => {
    const result = new Map<string, number>(), first = `${year}-01-01`, last = `${Number(year) + 1}-01-01`;
    const ranges = [...events.map(event => ({ start: localFor(event.startMs, zone).slice(0, 10), end: addDays(localFor(event.endMs - 1, zone).slice(0, 10), 1) })), ...linked];
    for (const item of ranges) for (let day = item.start < first ? first : item.start; day < item.end && day < last; day = addDays(day, 1)) result.set(day, (result.get(day) || 0) + 1);
    return result;
  }, [events, linked, year, zone]);
  const marks = useMemo(() => {
    const result = new Map<string, { event: EventOccurrence; lane: number; before: boolean; after: boolean }[]>();
    const end = `${Number(year) + 1}-01-01`;
    for (let start = weekStart(`${year}-01-01`); start < end; start = addDays(start, 7)) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(day => showWeekends || ![0, 6].includes(new Date(day + "T12:00").getDay()));
      for (const segment of monthWeekLayout(days, events, zone, 3).segments) for (let i = segment.first; i <= segment.last; i++) {
        const day = days[i], rows = result.get(day) || [];
        rows.push({ event: segment.event, lane: segment.lane, before: i > segment.first && day.slice(-2) !== "01", after: i < segment.last && addDays(day, 1).slice(0, 7) === day.slice(0, 7) });
        result.set(day, rows);
      }
    }
    return result;
  }, [events, year, zone, showWeekends]);
  const renderMarks = (day: string) => <span className={styles.yearMarks} aria-hidden="true">{(marks.get(day) || []).map(mark => <span key={mark.event.id} data-year-event={mark.event.id} data-before={mark.before} data-after={mark.after} title={mark.event.title} style={{ ...eventColors(mark.event, calendars.find(c => c.id === mark.event.calendarId)), "--year-lane": mark.lane } as CSSProperties} />)}{(counts.get(day) || 0) > (marks.get(day)?.length || 0) && <b>+</b>}</span>;
  return <div className={styles.yearView} data-month-collection aria-label={`${year} year calendar`}>
    {Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}-01`).map(month => <CalendarMiniMonth key={month} overview={compact} month={month} value={date} today={today} showWeekends={showWeekends} counts={counts} renderMarks={renderMarks} onSelect={onDay} onMonth={onMonth} />)}
  </div>;
}
