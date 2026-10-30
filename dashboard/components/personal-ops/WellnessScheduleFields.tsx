"use client";
import { useEffect, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import SelectField from "../ui/SelectField";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import type { Calendar } from "../../lib/modules/planning/types";
import type { WellnessSchedule } from "../../lib/modules/personal-wellness/types";
import { moveWellnessStart, WELLNESS_WEEKDAYS } from "../../lib/modules/personal-wellness/schedule";
import styles from "./WellnessScheduleFields.module.css";

export default function WellnessScheduleFields({ value, date, minutes = 60, onChange, occurrenceOnly = false, allowRepeat = true, initialStart }: { allowRepeat?: boolean; initialStart?: string; occurrenceOnly?: boolean; value?: WellnessSchedule | null; date: string; minutes?: number; onChange: (value: WellnessSchedule | null) => void }) {
  const [calendars, setCalendars] = useState<Calendar[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch("/api/planning?scope=calendars", { cache: "no-store" }); const result = await response.json(); if (!response.ok || !result.ok) throw new Error("Calendars could not be loaded."); setCalendars(result.calendars); return result.calendars as Calendar[]; }
    catch (e) { setError((e as Error).message); return []; }
    finally { setLoading(false); }
  }
  useEffect(() => { if (value && !calendars.length) void load(); }, [Boolean(value)]);
  async function enable() {
    const choices = calendars.length ? calendars : await load();
    if (!choices.length) { setError("Create a local calendar before scheduling this plan."); return; }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const start = initialStart || `${date || new Date().toISOString().slice(0, 10)}T09:00`;
    const end = Temporal.PlainDateTime.from(start).add({ minutes: Math.max(1, Math.min(minutes, 1440)) }).toString({ smallestUnit: "minute" });
    onChange({ calendarId: choices[0].id, start, end, timeZone });
  }
  const repeatDay = () => { try { return Temporal.PlainDate.from(value!.start.slice(0,10)).dayOfWeek; } catch { return 1; } };
  const zones = [...new Set([value?.timeZone || "UTC", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", ...Intl.supportedValuesOf("timeZone")])];
  return <div className={styles.schedule}>
    <div className={styles.heading}><strong>Calendar</strong>{value && !occurrenceOnly ? <WorkspaceButton icon="close" onClick={() => onChange(null)}>Remove schedule</WorkspaceButton> : !value ? <WorkspaceButton icon="calendar" busy={loading} onClick={() => void enable()}>Add to Calendar</WorkspaceButton> : null}</div>
    {error && <p role="alert">{error} {value && <button type="button" onClick={() => void load()}>Retry</button>}</p>}
    {value && <><div className={styles.fields}>
      <label>Calendar<SelectField aria-label="Schedule calendar" value={value.calendarId} disabled={loading || occurrenceOnly} optionColors={Object.fromEntries(calendars.map(item => [item.id, item.color]))} onChange={event => onChange({ ...value, calendarId: event.target.value })}>{!calendars.some(item => item.id === value.calendarId) && <option value={value.calendarId}>{loading ? "Loading…" : "Unavailable calendar"}</option>}{calendars.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField></label>
      <label>Time zone<SelectField aria-label="Schedule time zone" disabled={occurrenceOnly} searchable value={value.timeZone} onChange={event => onChange({ ...value, timeZone: event.target.value })}>{zones.map(zone => <option value={zone} key={zone}>{zone.replaceAll("_", " ")}</option>)}</SelectField></label>
      <label>Starts<input aria-label="Schedule starts" type="datetime-local" required value={value.start} onChange={event => onChange(moveWellnessStart(value, event.target.value))} /></label>
      <label>Ends<input aria-label="Schedule ends" type="datetime-local" required value={value.end} onChange={event => onChange({ ...value, end: event.target.value })} /></label>
    </div>{!occurrenceOnly && allowRepeat && <div className={styles.repeat}>
      <label>Repeat<SelectField aria-label="Repeat schedule" value={value.repeat ? "weekly" : "once"} onChange={event=>onChange({ ...value, repeat: event.target.value === "weekly" ? { weekdays:[repeatDay()] } : undefined })}><option value="once">Does not repeat</option><option value="weekly">Every week</option></SelectField></label>
      {value.repeat && <><div className={styles.days} role="group" aria-label="Repeat on days">{WELLNESS_WEEKDAYS.map((day,index)=><button type="button" key={day} aria-label={day} aria-pressed={value.repeat!.weekdays.includes(index+1)} onClick={()=>onChange({...value,repeat:{...value.repeat!,weekdays:value.repeat!.weekdays.includes(index+1)?value.repeat!.weekdays.filter(item=>item!==index+1):[...value.repeat!.weekdays,index+1].sort((a,b)=>a-b)}})}>{day.slice(0,2)}</button>)}</div><label><span>Last date <span className={styles.optional}>(optional)</span></span><input aria-label="Repeat last date" type="date" min={value.start.slice(0,10)} value={value.repeat.until || ""} onChange={event=>onChange({...value,repeat:{...value.repeat!,until:event.target.value || undefined}})} /></label><p className={styles.hint}>Complete each occurrence separately. Leave the last date blank to keep repeating.</p></>}
    </div>}<p className={styles.hint}>Uses this calendar’s sharing and booking-conflict settings. Personal notes stay private.</p></>}
  </div>;
}
