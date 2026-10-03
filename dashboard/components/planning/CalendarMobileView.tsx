"use client";
import { useRef, type ReactNode } from "react";
import Link from "next/link";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { localFor } from "../../lib/modules/planning/calendar-model";
import { calendarDateLabel as label } from "./CalendarMiniMonth";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useCalendarMotion } from "./CalendarMotion";
import styles from "./CalendarWorkspace.module.css";

/** Phone calendars use full-width event rows instead of seven unreadable time columns. */
export default function CalendarMobileView({ view, date, today, days, events, linked, zone, onDate, renderEvent }: {
  view: "day" | "week" | "month"; date: string; today: string; days: string[];
  events: EventOccurrence[]; linked: PlanningSnapshot["dated"]; zone: string;
  onDate: (day: string) => void; renderEvent: (event: EventOccurrence) => ReactNode;
}) {
  const { reduced } = useCalendarMotion();
  const list = useRef<HTMLDivElement>(null);
  const eventsOn = (day: string) => events.filter(event => localFor(event.startMs, zone).slice(0, 10) <= day && localFor(event.endMs - 1, zone).slice(0, 10) >= day);
  const linksOn = (day: string) => linked.filter(item => item.start <= day && item.end > day);
  const choose = (day: string) => {
    onDate(day);
    if (view === "week") {
      const row = list.current?.querySelector<HTMLElement>(`[data-schedule-day="${day}"]`);
      if (row && list.current) list.current.scrollTo({ top: row.offsetTop, behavior: reduced ? "instant" : "smooth" });
    }
  };
  const shown = view === "week" ? days : [date];
  return <div className={styles.mobileCalendar} data-mobile-view={view}>
    {view !== "day" && <div className={view === "month" ? styles.mobileMonthGrid : styles.mobileWeekStrip} style={{ gridTemplateColumns: `repeat(${days.length === 30 || days.length === 5 ? 5 : 7}, minmax(0, 1fr))` }} aria-label={view === "month" ? "Month dates" : "Week dates"}>
      {view === "month" && ["Mo", "Tu", "We", "Th", "Fr", ...(days.length === 30 ? [] : ["Sa", "Su"])].map(name => <span key={name} className={styles.mobileWeekday}>{name}</span>)}
      {days.map(day => {
        const count = eventsOn(day).length + linksOn(day).length;
        return <button type="button" key={day} data-mobile-date={day} data-outside={view === "month" && day.slice(0, 7) !== date.slice(0, 7)} aria-pressed={day === date} aria-current={day === today ? "date" : undefined}
          aria-label={`${label(day, { dateStyle: "full" })}${count ? ` · ${count} events` : ""}`} onClick={() => choose(day)}>
          {view === "week" && <small>{label(day, { weekday: "short" }).slice(0, 2)}</small>}<strong>{Number(day.slice(-2))}</strong>
          <span className={styles.mobileDateMarks} aria-hidden="true">{count > 0 && <><i />{count > 1 && <i />}{count > 2 && <i />}</>}</span>
        </button>;
      })}
    </div>}
    <div className={styles.mobileSchedule} ref={list} aria-label={view === "week" ? "Week events" : "Day events"}>
      {shown.map(day => {
        const items = eventsOn(day), links = linksOn(day);
        return <section key={day} data-schedule-day={day} className={styles.mobileScheduleDay}>
          <header><h2>{day === today ? "Today" : label(day, { weekday: "long" })}<span>{label(day, { month: "short", day: "numeric" })}</span></h2><small>{items.length + links.length} {items.length + links.length === 1 ? "event" : "events"}</small></header>
          {items.map(renderEvent)}
          {links.map(item => <Link className={styles.mobileLinked} key={item.id} href={item.ownerRef?.route || "/admin/personal"}><UnigentamosIcon role={item.completed ? "check" : "link"} size={16} /><span>{item.title}</span></Link>)}
          {!items.length && !links.length && <p className={styles.mobileEmpty}>No events scheduled</p>}
        </section>;
      })}
    </div>
  </div>;
}
