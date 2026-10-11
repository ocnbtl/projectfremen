"use client";
import { useState } from "react";
import { addDays, monthStart, shiftMonth } from "../../lib/modules/planning/calendar-model";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import EventDateTimePicker from "./EventDateTimePicker";
import styles from "./CalendarBookings.module.css";

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Date(date + "T12:00").toLocaleDateString("en-US", options);
const timeLabel = (time: string) => new Date("2000-01-01T" + time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
export default function ManualBookingSlots({ from, through, duration, timeZone, values, onChange }: { from: string; through: string; duration: number; timeZone: string; values: string[]; onChange: (values: string[]) => void }) {
  const [selected, setSelected] = useState(values[0]?.slice(0,10) || from), [month, setMonth] = useState(monthStart(values[0]?.slice(0,10) || from)), [custom, setCustom] = useState("09:00");
  const day = selected < from || selected > through ? from : selected;
  const visibleMonth = month < monthStart(from) || month > monthStart(through) ? monthStart(from) : month;
  const offset = new Date(visibleMonth + "T12:00").getDay();
  const monthDays = Number(addDays(shiftMonth(visibleMonth,1),-1).slice(8));
  const days = Array.from({ length: Math.ceil((offset + monthDays) / 7) * 7 }, (_, index) => addDays(visibleMonth, index - offset));
  const times = Array.from({ length: Math.floor((17 * 60 - 9 * 60) / duration) }, (_, index) => { const minute = 9 * 60 + index * duration; return `${String(Math.floor(minute / 60)).padStart(2,"0")}:${String(minute % 60).padStart(2,"0")}`; });
  const selectedTimes = values.filter(value => value.startsWith(day + "T"));
  const inRange = (time: string) => day < through || Number(time.slice(0,2)) * 60 + Number(time.slice(3)) + duration <= 1440;
  function toggle(time: string) { const value = day + "T" + time; onChange(values.includes(value) ? values.filter(item => item !== value) : [...values, value].sort()); }
  return <div className={styles.slotPlanner}>
    <div className={styles.monthHeading}><Button icon="back" aria-label="Previous slot month" disabled={visibleMonth <= monthStart(from)} onClick={() => setMonth(shiftMonth(visibleMonth,-1))} /><strong>{dateLabel(visibleMonth,{month:"long",year:"numeric"})}</strong><Button icon="chevron-right" aria-label="Next slot month" disabled={visibleMonth >= monthStart(through)} onClick={() => setMonth(shiftMonth(visibleMonth,1))} /></div>
    <div className={styles.slotCalendar} aria-label="Choose a date for booking times">
      {["Su","Mo","Tu","We","Th","Fr","Sa"].map(label => <span key={label} aria-hidden="true">{label}</span>)}
      {days.map(date => <button type="button" key={date} aria-label={`${dateLabel(date,{weekday:"long",month:"long",day:"numeric"})}${values.some(value => value.startsWith(date)) ? ", has selected times" : ""}`} aria-pressed={date === day} disabled={date < from || date > through || date.slice(0,7) !== visibleMonth.slice(0,7)} data-outside={date.slice(0,7) !== visibleMonth.slice(0,7)} onClick={() => setSelected(date)}>{Number(date.slice(8))}<i data-selected={values.some(value => value.startsWith(date))} /></button>)}
    </div>
    <div className={styles.slotHeading}><strong>{dateLabel(day,{weekday:"short",month:"short",day:"numeric"})}</strong><span>{selectedTimes.length} selected · {duration} min each</span></div>
    <div className={styles.timeChoices} aria-label="Toggle available start times">{times.map(time => <button type="button" key={time} aria-pressed={values.includes(day+"T"+time)} disabled={!inRange(time) || (values.length >= 200 && !values.includes(day+"T"+time))} onClick={() => toggle(time)}>{timeLabel(time)}</button>)}</div>
    <div className={styles.customTime}><EventDateTimePicker compact timeOnly label="Another time" allDay={false} value={day+"T"+custom} timeZone={timeZone} onChange={value => setCustom(value.slice(11,16))} /><Button icon="plus" disabled={!inRange(custom) || values.length >= 200 || values.includes(day+"T"+custom)} onClick={() => toggle(custom)}>Add</Button></div>
    {selectedTimes.length > 0 && <div className={styles.selectedTimes} aria-label="Selected times on this date">{selectedTimes.map(value => <Button key={value} icon="close" aria-label={"Remove " + timeLabel(value.slice(11))} onClick={() => toggle(value.slice(11))}>{timeLabel(value.slice(11))}</Button>)}</div>}
    <p className={styles.slotNote} role="status">{values.length} times across {new Set(values.map(value => value.slice(0,10))).size} days. Dots mark selected dates. Busy times are excluded when guests book.</p>
  </div>;
}
