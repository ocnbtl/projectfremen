"use client";
import { instantFor, addDays } from "../../lib/modules/planning/calendar-model";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./CalendarWorkspace.module.css";
export default function CalendarHourControls({ days, events, zone, early, late, setEarly, setLate }: {
  days: string[]; events: EventOccurrence[]; zone: string; early: boolean; late: boolean;
  setEarly: (value: boolean) => void; setLate: (value: boolean) => void;
}) {
  const count = (before: boolean) => events.filter(event => !event.allDay && days.some(day =>
    event.startMs < instantFor(before ? day + "T08:00" : addDays(day, 1), zone) &&
    event.endMs > instantFor(before ? day : day + "T22:00", zone))).length;
  return <div className={styles.toolbarHours} role="group" aria-label="Visible hours">
    {([true, false] as const).map(before => { const expanded = before ? early : late, n = count(before), time = before ? "8 am" : "10 pm", relation = before ? "before" : "after";
      return <button key={time} type="button" aria-expanded={expanded} aria-controls="calendar-hour-grid" title={(expanded ? "Hide " : "Show ") + relation + " " + time}
        aria-label={(expanded ? "Hide " : "Show ") + relation + " " + time + (n ? " · " + n + (n === 1 ? " event" : " events") : "")}
        onClick={() => before ? setEarly(!early) : setLate(!late)}>
        <UnigentamosIcon role="chevron-down" size={13} style={{ transform: before !== expanded ? "rotate(180deg)" : undefined }} />
        <span className={styles.hourVerb}>{expanded ? "Hide" : "Show"} </span><span className={styles.hourRelation}>{before ? "Before" : "After"} </span><span>{time}</span>
        {!!n && <b aria-hidden="true">{n}</b>}
      </button>;
    })}
  </div>;
}
