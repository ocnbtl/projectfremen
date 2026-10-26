"use client";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import { useCalendarDetails } from "./CalendarDisplayPreferences";
import EventDetail from "./EventDetail";
import { localFor } from "../../lib/modules/planning/calendar-model";
import { calendarDateLabel } from "./CalendarMiniMonth";
import { eventTimeLabel, eventTimeRange } from "./calendar-presentation";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./EventTiming.module.css";

export default function EventTiming({ event, zone, showDate = false, stacked = false, respectDisplayPreferences = false }: { event: EventOccurrence; zone: string; showDate?: boolean; stacked?: boolean; respectDisplayPreferences?: boolean }) {
  const details = useCalendarDetails();
  const start = localFor(event.startMs, zone).slice(0, 10), end = localFor(event.allDay ? event.endMs - 1 : event.endMs, zone).slice(0, 10), multi = start !== end;
  const dateLabel = (day:string) => calendarDateLabel(day,{month:"short",day:"numeric",...(start.slice(0,4)!==end.slice(0,4)?{year:"numeric"}:{})});
  if (respectDisplayPreferences && !details.time && !event.allDay) return <span className={styles.timing} data-stacked={stacked || undefined}>{showDate && <span className={styles.line}><UnigentamosIcon role="calendar" size={14}/>{dateLabel(start)}{multi && ` to ${dateLabel(end)}`}</span>}<EventDetail kind="time" text={eventTimeRange(event.startMs,event.endMs,zone)} eventTitle={event.title}/></span>;
  if (!multi) return <span className={styles.timing} data-stacked={stacked || undefined}>{showDate && <span className={styles.line}><UnigentamosIcon role="calendar" size={14}/>{dateLabel(start)}</span>}{!event.allDay && <span className={styles.line}><UnigentamosIcon role="clock" size={14}/>{eventTimeRange(event.startMs,event.endMs,zone)}</span>}</span>;
  return <span className={styles.range} aria-label={`${start} to ${end}`}>
    <UnigentamosIcon role="calendar" size={14}/><span>{dateLabel(start)}</span><span className={styles.separator}>to</span><span>{dateLabel(end)}</span>
    {!event.allDay && <><UnigentamosIcon role="clock" size={14}/><span>{eventTimeLabel(event.startMs,zone)}</span><span className={styles.separator}>to</span><span>{eventTimeLabel(event.endMs,zone)}</span></>}
  </span>;
}
