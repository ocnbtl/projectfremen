"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { localFor } from "../../lib/modules/planning/calendar-model";
import { WorkspaceButton as Button, WorkspaceEmpty } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { calendarDateLabel as label } from "./CalendarMiniMonth";
import styles from "./CalendarWorkspace.module.css";
import SelectField from "../ui/SelectField";

export default function CalendarAgenda({ events, linked, zone, start, today, renderEvent, onDay, rangeDays, onRangeDays }: {
  rangeDays: number; onRangeDays: (days: number) => void;
  events: EventOccurrence[]; linked: PlanningSnapshot["dated"]; zone: string; start: string; today: string; renderEvent: (item: EventOccurrence) => ReactNode; onDay: (day: string) => void;
}) {
  const [page, setPage] = useState(0);
  const groups = useMemo(() => {
    const rows = [
      ...events.map(event => ({ id: event.id, day: localFor(event.startMs, zone).slice(0, 10), order: event.allDay ? 0 : event.startMs, event })),
      ...linked.map(link => ({ id: link.id, day: link.start, order: 0, link })),
    ].map(row => ({ ...row, day: row.day < start ? start : row.day })).sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order);
    const result = new Map<string, typeof rows>();
    for (const row of rows) result.set(row.day, [...(result.get(row.day) || []), row]);
    return [...result];
  }, [events, linked, zone, start]);
  const pages = Math.max(1, Math.ceil(groups.length / 4)), current = Math.min(page, pages - 1);
  return <div className={styles.agenda}>
    <div className={styles.agendaHeading}><span>{events.length + linked.length} {events.length + linked.length === 1 ? "event" : "events"} in the next</span><SelectField aria-label="Agenda date range" value={String(rangeDays)} menuClassName={styles.calendarChoiceMenu} onChange={event => onRangeDays(Number(event.target.value))}>{[7, 14, 30, 60, 90].map(days => <option key={days} value={days}>{days} days</option>)}</SelectField></div>
    {groups.slice(current * 4, current * 4 + 4).map(([day, rows]) => <section className={styles.agendaDay} key={day} data-today={day === today}>
      <button type="button" className={styles.agendaDate} onClick={() => onDay(day)} aria-label={`View ${label(day, { dateStyle: "full" })}`}>
        <strong data-morph-date={day}>{Number(day.slice(-2))}</strong><span>{label(day, { month: "short" })}<small>{day === today ? "Today" : label(day, { weekday: "long" })}</small></span>
      </button>
      <div className={styles.agendaRows}>{rows.map(row => "event" in row ? renderEvent(row.event) : <Link key={row.id} className={styles.agendaLinked} href={row.link.ownerRef?.route || "/admin/personal"}>
        <span>Linked</span><UnigentamosIcon role={row.link.completed ? "check" : "link"} size={17} /><strong>{row.link.title}</strong>{row.link.completed && <small>Completed</small>}
      </Link>)}</div>
    </section>)}
    {!groups.length && <WorkspaceEmpty title="Room to plan">Add an event, connect a calendar, or schedule linked work.</WorkspaceEmpty>}
    {pages > 1 && <div className={styles.agendaPagination}><Button disabled={!current} onClick={() => setPage(current - 1)} aria-label="Previous agenda days"><UnigentamosIcon role="chevron-right" size={16} style={{ transform: "rotate(180deg)" }} /></Button><span>{current + 1} / {pages}</span><Button disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label="Next agenda days"><UnigentamosIcon role="chevron-right" size={16} /></Button></div>}
  </div>;
}
