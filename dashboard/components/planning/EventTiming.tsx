import type { EventOccurrence } from "../../lib/modules/planning/types";
import { localFor } from "../../lib/modules/planning/calendar-model";
import { calendarDateLabel } from "./CalendarMiniMonth";
import { eventTimeLabel, eventTimeRange } from "./calendar-presentation";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./CalendarWorkspace.module.css";

export default function EventTiming({ event, zone }: { event: EventOccurrence; zone: string }) {
  const start = localFor(event.startMs, zone).slice(0, 10), end = localFor(event.allDay ? event.endMs - 1 : event.endMs, zone).slice(0, 10);
  if (start === end) return event.allDay ? null : <span className={styles.timeLine}><UnigentamosIcon role="clock" size={14} />{eventTimeRange(event.startMs, event.endMs, zone)}</span>;
  return <span className={styles.eventRangeColumns} aria-label={`${start} to ${end}`}>
    {[start, end].map((day, index) => <span key={index}><span className={styles.timeLine}><UnigentamosIcon role="calendar" size={14} />{calendarDateLabel(day, { month: "short", day: "numeric", ...(start.slice(0, 4) !== end.slice(0, 4) ? { year: "numeric" } : {}) })}</span>{!event.allDay && <span className={styles.timeLine}><UnigentamosIcon role="clock" size={14} />{eventTimeLabel(index ? event.endMs : event.startMs, zone)}</span>}</span>)}
  </span>;
}
