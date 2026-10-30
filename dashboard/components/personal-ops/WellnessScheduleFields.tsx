"use client";
import { useEffect, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import SelectField from "../ui/SelectField";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import type { Calendar } from "../../lib/modules/planning/types";
import type { WellnessSchedule } from "../../lib/modules/personal-wellness/types";
import { moveWellnessStart } from "../../lib/modules/personal-wellness/schedule";
import styles from "./WellnessScheduleFields.module.css";

export default function WellnessScheduleFields({ value, date, minutes = 60, onChange }: { value?: WellnessSchedule | null; date: string; minutes?: number; onChange: (value: WellnessSchedule | null) => void }) {
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
    const start = `${date || new Date().toISOString().slice(0, 10)}T09:00`;
    const end = Temporal.PlainDateTime.from(start).add({ minutes: Math.max(1, Math.min(minutes, 1440)) }).toString({ smallestUnit: "minute" });
    onChange({ calendarId: choices[0].id, start, end, timeZone });
  }
  const zones = [...new Set([value?.timeZone || "UTC", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", ...Intl.supportedValuesOf("timeZone")])];
  return <div className={styles.schedule}>
    <div className={styles.heading}><strong>Calendar</strong>{value ? <WorkspaceButton icon="close" onClick={() => onChange(null)}>Remove schedule</WorkspaceButton> : <WorkspaceButton icon="calendar" busy={loading} onClick={() => void enable()}>Add to Calendar</WorkspaceButton>}</div>
    {error && <p role="alert">{error} {value && <button type="button" onClick={() => void load()}>Retry</button>}</p>}
    {value && <><div className={styles.fields}>
      <label>Calendar<SelectField aria-label="Schedule calendar" value={value.calendarId} disabled={loading} optionColors={Object.fromEntries(calendars.map(item => [item.id, item.color]))} onChange={event => onChange({ ...value, calendarId: event.target.value })}>{!calendars.some(item => item.id === value.calendarId) && <option value={value.calendarId}>{loading ? "Loading…" : "Unavailable calendar"}</option>}{calendars.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField></label>
      <label>Time zone<SelectField aria-label="Schedule time zone" searchable value={value.timeZone} onChange={event => onChange({ ...value, timeZone: event.target.value })}>{zones.map(zone => <option value={zone} key={zone}>{zone.replaceAll("_", " ")}</option>)}</SelectField></label>
      <label>Starts<input aria-label="Schedule starts" type="datetime-local" required value={value.start} onChange={event => onChange(moveWellnessStart(value, event.target.value))} /></label>
      <label>Ends<input aria-label="Schedule ends" type="datetime-local" required value={value.end} onChange={event => onChange({ ...value, end: event.target.value })} /></label>
    </div><p className={styles.hint}>Uses this calendar’s sharing and booking-conflict settings. Personal notes stay private.</p></>}
  </div>;
}
