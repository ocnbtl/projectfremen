"use client";
import type { ReactNode } from "react";
import { addDays, monthStart, weekStart } from "../../lib/modules/planning/calendar-model";
import { visibleWeekdays } from "../../lib/calendar-week";
import styles from "./CalendarWorkspace.module.css";

export const calendarDateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00`).toLocaleDateString(undefined, options);

export default function CalendarMiniMonth({ month, value, today, showWeekends = true, counts, renderMarks, onSelect, onMonth, onFocusDate, overview = false }: {
  renderMarks?: (day: string) => ReactNode;
  overview?: boolean; month: string; value: string; today: string; showWeekends?: boolean; counts?: Map<string, number>;
  onSelect: (day: string) => void; onMonth?: (day: string) => void; onFocusDate?: (day: string) => void;
}) {
  const start = weekStart(monthStart(month));
  const title = calendarDateLabel(month, { month: "long" });
  return <section className={styles.miniMonth} data-overview={overview || undefined} data-mini-month={month.slice(0, 7)} aria-label={calendarDateLabel(month, { month: "long", year: "numeric" })}>
    {onMonth ? <button type="button" className={styles.miniMonthHeading} onClick={() => onMonth(month)} aria-label={`View ${calendarDateLabel(month, { month: "long", year: "numeric" })}`}>{title}</button> : <h3>{title}</h3>}
    <div className={styles.miniDays} style={{ gridTemplateColumns: `repeat(${showWeekends ? 7 : 5}, minmax(0, 1fr))` }}>
      {visibleWeekdays(showWeekends).map(day => <span className={styles.miniWeekday} key={day} title={day}>{day.slice(0, 2)}</span>)}
      {Array.from({ length: 42 }, (_, index) => {
        if (!showWeekends && [0, 6].includes(index % 7)) return null;
        const day = addDays(start, index), outside = day.slice(0, 7) !== month.slice(0, 7), count = counts?.get(day) || 0;
        if (outside) return <span key={day} aria-hidden="true" />;
        if (overview) return <span className={styles.overviewDate} key={day} data-morph-date={counts ? day : undefined} data-current={day === today} data-has-events={count > 0 || undefined}>{Number(day.slice(-2))}{renderMarks?.(day)}</span>;
        return <button type="button" key={day} data-mini-date={day} data-has-events={count > 0 || undefined}
          aria-label={`${calendarDateLabel(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${count ? ` · ${count} ${count === 1 ? "event" : "events"}` : ""}`}
          aria-pressed={day === value} aria-current={day === today ? "date" : undefined}
          tabIndex={day === value || (value.slice(0, 7) !== month.slice(0, 7) && day.endsWith("-01")) ? 0 : -1}
          onClick={() => onSelect(day)} onKeyDown={event => {
            const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: (showWeekends ? 0 : 1) - index % 7, End: (showWeekends ? 6 : 5) - index % 7 };
            if (!(event.key in offsets)) return;
            event.preventDefault();
            let next = addDays(day, offsets[event.key]);
            if (!showWeekends && [0, 6].includes(new Date(`${next}T12:00`).getDay())) next = addDays(next, event.key === "ArrowLeft" ? -2 : 2);
            const button = event.currentTarget.closest('[data-month-collection]')?.querySelector<HTMLButtonElement>(`[data-mini-date="${next}"]`);
            if (button) button.focus(); else onFocusDate?.(next);
          }}><span data-morph-date={counts ? day : undefined}>{Number(day.slice(-2))}</span>{renderMarks ? renderMarks(day) : count > 0 && <i aria-hidden="true" />}</button>;
      })}
    </div>
  </section>;
}
