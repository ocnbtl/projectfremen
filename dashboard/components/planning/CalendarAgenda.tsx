"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { addDays, localFor } from "../../lib/modules/planning/calendar-model";
import { WorkspaceEmpty } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { calendarDateLabel as label } from "./CalendarMiniMonth";
import styles from "./CalendarWorkspace.module.css";
import SelectField from "../ui/SelectField";

export default function CalendarAgenda({ events, linked, zone, start, today, renderEvent, onDay, rangeDays, onRangeDays }: {
  rangeDays: number; onRangeDays: (days: number) => void;
  events: EventOccurrence[]; linked: PlanningSnapshot["dated"]; zone: string; start: string; today: string; renderEvent: (item: EventOccurrence) => ReactNode; onDay: (day: string) => void;
}) {
  const [month, setMonth] = useState("");
  const rows = useMemo(() => [
    ...events.map(event => ({ id: event.id, day: localFor(event.startMs, zone).slice(0, 10), first: localFor(event.startMs, zone).slice(0, 10), last: localFor(event.endMs - 1, zone).slice(0, 10), order: event.allDay ? 0 : event.startMs, event })),
    ...linked.map(link => ({ id: link.id, day: link.start, first: link.start, last: addDays(link.end, -1), order: 0, link })),
  ].map(row => ({ ...row, day: row.day < start ? start : row.day })), [events, linked, zone, start]);
  const nextMonth = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const months: string[] = [];
  const end = addDays(start, rangeDays);
  for (let day = start.slice(0, 7) + "-01"; day < end; day = nextMonth(day)) months.push(day.slice(0, 7));
  const activeMonth = months.includes(month) ? month : "";
  const inMonth = (row: typeof rows[number], key: string) => row.day < nextMonth(key) && row.last >= key + "-01";
  const grouped = new Map<string, typeof rows>();
  for (const row of rows.filter(row => !activeMonth || inMonth(row, activeMonth)).map(row => ({...row, day: activeMonth && row.day < activeMonth + "-01" ? activeMonth + "-01" : row.day})).sort((a,b) => a.day.localeCompare(b.day) || a.order - b.order)) grouped.set(row.day, [...(grouped.get(row.day) || []), row]);
  const visible = [...grouped];
  return <div className={styles.agenda}>
    <div className={styles.agendaHeading}><span>{events.length + linked.length} {events.length + linked.length === 1 ? "event" : "events"} in the next</span><SelectField aria-label="Agenda date range" value={String(rangeDays)} menuClassName={styles.calendarChoiceMenu} onChange={event => onRangeDays(Number(event.target.value))}>{[7, 14, 30, 60, 90].map(days => <option key={days} value={days}>{days} days</option>)}</SelectField></div>
    <nav className={styles.agendaMonths} aria-label="Filter agenda by month"><button type="button" aria-pressed={!activeMonth} onClick={() => setMonth("")}>All dates<span>{events.length + linked.length}</span></button>{months.map(key => <button type="button" key={key} aria-pressed={activeMonth === key} onClick={() => setMonth(key)}>{label(key + "-01", {month: "long", year: "numeric"})}<span>{rows.filter(row => inMonth(row, key)).length}</span></button>)}</nav>
    {visible.map(([day, rows]) => <section className={styles.agendaDay} key={day} data-today={day === today}>
      <button type="button" className={styles.agendaDate} onClick={() => onDay(day)} aria-label={`View ${label(day, { dateStyle: "full" })}`}>
        <strong data-morph-date={day}>{Number(day.slice(-2))}</strong><span>{label(day, { month: "short" })}<small>{day === today ? "Today" : label(day, { weekday: "long" })}</small></span>
      </button>
      <div className={styles.agendaRows}>{rows.map(row => <div className={styles.agendaEntry} key={row.id}>{row.last > row.first && <div className={styles.agendaSpan}><UnigentamosIcon role="calendar" size={14} /><time dateTime={row.first}>{label(row.first, {month: "short", day: "numeric", ...(row.first.slice(0,4) !== row.last.slice(0,4) ? {year: "numeric" as const} : {})})}</time><UnigentamosIcon role="chevron-right" size={12} /><time dateTime={row.last}>{label(row.last, {month: "short", day: "numeric", year: "numeric"})}</time>{row.first < start && <small>Ongoing</small>}</div>}{"event" in row ? renderEvent(row.event) : <Link key={row.id} className={styles.agendaLinked} href={row.link.ownerRef?.route || "/admin/personal"}>
        <span>Linked</span><UnigentamosIcon role={row.link.completed ? "check" : "link"} size={17} /><strong>{row.link.title}</strong>{row.link.completed && <small>Completed</small>}
      </Link>}</div>)}</div>
    </section>)}
    {!visible.length && <WorkspaceEmpty title={activeMonth ? "No events this month" : "Room to plan"}>Add an event, choose another month, or expand the date range.</WorkspaceEmpty>}
  </div>;
}
