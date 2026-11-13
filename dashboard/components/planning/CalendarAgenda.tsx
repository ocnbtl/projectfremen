"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCalendarMotion } from "./CalendarMotion";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { addDays, localFor } from "../../lib/modules/planning/calendar-model";
import { WorkspaceEmpty } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { calendarDateLabel as label } from "./CalendarMiniMonth";
import styles from "./CalendarWorkspace.module.css";
import TaskSummary from "./TaskSummary";
import SelectField from "../ui/SelectField";

export default function CalendarAgenda({ events, linked, zone, start, today, renderEvent, onDay, rangeDays, onRangeDays,refs,onTasks }: {
  refs:PlanningSnapshot["refs"];onTasks:(day:string)=>void;rangeDays: number; onRangeDays: (days: number) => void;
  events: EventOccurrence[]; linked: PlanningSnapshot["dated"]; zone: string; start: string; today: string; renderEvent: (item: EventOccurrence) => ReactNode; onDay: (day: string) => void;
}) {
  const { reduced, layoutTransition } = useCalendarMotion();
  const [month, setMonth] = useState("");
  const rows = useMemo(() => [
    ...events.filter(event=>!event.isTask).map(event => ({ id: event.id+":"+event.occurrenceKey, day: localFor(event.startMs, zone).slice(0, 10), first: localFor(event.startMs, zone).slice(0, 10), last: localFor(event.endMs - 1, zone).slice(0, 10), order: event.allDay ? 0 : event.startMs, event })),
    ...Array.from({length:rangeDays},(_,i)=>addDays(start,i)).flatMap(day=>{const tasks=events.filter(event=>event.isTask&&localFor(event.startMs,zone).slice(0,10)<=day&&localFor(event.endMs-1,zone).slice(0,10)>=day);return tasks.length?[{id:"tasks:"+day,day,first:day,last:day,order:Number.MAX_SAFE_INTEGER,tasks}]:[];}),
    ...linked.map(link => ({ id: link.id, day: link.start, first: link.start, last: addDays(link.end, -1), order: 0, link })),
  ].map(row => ({ ...row, day: row.day < start ? start : row.day })), [events, linked, zone, start,rangeDays]);
  const nextMonth = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const months: string[] = [];
  const end = addDays(start, rangeDays);
  for (let day = start.slice(0, 7) + "-01"; day < end; day = nextMonth(day)) months.push(day.slice(0, 7));
  const activeMonth = months.includes(month) ? month : "";
  const inMonth = (row: typeof rows[number], key: string) => row.day < nextMonth(key) && row.last >= key + "-01";
  const grouped = new Map<string, typeof rows>();
  for (const row of rows.filter(row => !activeMonth || inMonth(row, activeMonth)).map(row => ({...row, day: activeMonth && row.day < activeMonth + "-01" ? activeMonth + "-01" : row.day})).sort((a,b) => a.day.localeCompare(b.day) || a.order - b.order)) grouped.set(row.day, [...(grouped.get(row.day) || []), row]);
  const visible = [...grouped];
  return <div className={styles.agenda} style={{overflowAnchor:"none"}}>
    <div className={styles.agendaHeading}><span>{rows.length} {rows.length === 1 ? "entry" : "entries"} in the next</span><SelectField aria-label="Agenda date range" value={String(rangeDays)} menuClassName={styles.calendarChoiceMenu} onChange={event => onRangeDays(Number(event.target.value))}>{[7, 14, 30, 60, 90].map(days => <option key={days} value={days}>{days} days</option>)}</SelectField></div>
    <motion.nav layout transition={layoutTransition} className={styles.agendaMonths} aria-label="Filter agenda by month"><button type="button" aria-pressed={!activeMonth} onClick={() => setMonth("")}>All dates<span>{rows.length}</span></button><AnimatePresence initial={false}>{months.map(key => <motion.button layout initial={reduced ? false : { opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }} transition={layoutTransition} type="button" key={key} aria-pressed={activeMonth === key} onClick={() => setMonth(key)}>{label(key + "-01", {month: "long", year: "numeric"})}<span>{rows.filter(row => inMonth(row, key)).length}</span></motion.button>)}</AnimatePresence></motion.nav>
    <motion.div layout transition={layoutTransition} style={{position:"relative",minHeight:240}}><AnimatePresence initial={false} mode="popLayout">{visible.map(([day, rows]) => <motion.section layout="position" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y:0 }} exit={{ opacity: 0, y:reduced?0:-6 }} transition={layoutTransition} className={styles.agendaDay} key={day} data-today={day === today}>
      <button type="button" className={styles.agendaDate} onClick={() => onDay(day)} aria-label={`View ${label(day, { dateStyle: "full" })}`}>
        <strong data-morph-date={day}>{Number(day.slice(-2))}</strong><span>{label(day, { month: "short" })}<small>{day === today ? "Today" : label(day, { weekday: "long" })}</small></span>
      </button>
      <div className={styles.agendaRows}><AnimatePresence initial={false}>{rows.map(row => <motion.div layout initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={layoutTransition} className={styles.agendaEntry} key={row.id}>{"tasks" in row ? <TaskSummary day={day} tasks={row.tasks} refs={refs} onOpen={()=>onTasks(day)}/> : "event" in row ? renderEvent(row.event) : <Link key={row.id} className={styles.agendaLinked} href={row.link.ownerRef?.route || "/admin/personal"}>
        <UnigentamosIcon role={row.link.completed ? "check" : "link"} size={17} /><strong>{row.link.title}</strong>{row.last > row.first && <span className={styles.eventDateRange}>{label(row.first, {month: "short", day: "numeric"})} – {label(row.last, {month: "short", day: "numeric"})}</span>}{row.link.completed && <small>Completed</small>}
      </Link>}</motion.div>)}</AnimatePresence></div>
    </motion.section>)}</AnimatePresence></motion.div>
    {!visible.length && <WorkspaceEmpty title={activeMonth ? "No events this month" : "Room to plan"}>Add an event, choose another month, or expand the date range.</WorkspaceEmpty>}
  </div>;
}
