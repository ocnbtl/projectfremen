"use client";
import { instantFor, addDays } from "../../lib/modules/planning/calendar-model";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./CalendarWorkspace.module.css";
export default function CalendarHourControls({ days, events, zone, early, late, setEarly, setLate, available = true }: {
  days: string[]; events: EventOccurrence[]; zone: string; early: boolean; late: boolean;
  setEarly: (value: boolean) => void; setLate: (value: boolean) => void;
  available?: boolean;
}) {
  const count = (before: boolean) => events.filter(event => !event.allDay && days.some(day =>
    event.startMs < instantFor(before ? day + "T08:00" : addDays(day, 1), zone) &&
    event.endMs > instantFor(before ? day : day + "T22:00", zone))).length;
  return <div className={styles.toolbarHours} role="group" aria-label="Visible hours">
    {([true, false] as const).map(before => { const expanded = before ? early : late, n = count(before), time = before ? "8 am" : "10 pm", relation = before ? "before" : "after";
      return <button key={time} type="button" aria-disabled={!available} aria-expanded={available ? expanded : undefined} aria-controls={available ? "calendar-hour-grid" : undefined} title={available ? (expanded ? "Hide " : "Show ") + relation + " " + time : "Available in Day, 3 days and Week views"}
        aria-label={(expanded ? "Hide " : "Show ") + relation + " " + time + (n ? " · " + n + (n === 1 ? " event" : " events") : "")}
        onClick={event => { if (!available) { event.currentTarget.animate([{ borderColor: "#b54d58" }, { borderColor: "transparent" }], { duration: 600 }); return; } before ? setEarly(!early) : setLate(!late); }}>
        <UnigentamosIcon role="chevron-down" size={13} style={{ transform: before !== expanded ? "rotate(180deg)" : undefined }} />
        <span className={styles.hourVerb}>{expanded ? "Hide" : "Show"} </span><span className={styles.hourRelation}>{before ? "Before" : "After"} </span><span>{time}</span>
        {available && !!n && <b aria-hidden="true">{n}</b>}
      </button>;
    })}
  </div>;
}
