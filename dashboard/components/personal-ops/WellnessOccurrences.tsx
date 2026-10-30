"use client";
import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { WellnessEntry, WellnessSection } from "../../lib/modules/personal-wellness/types";
import { wellnessOccurrences } from "../../lib/modules/personal-wellness/schedule";
import { updateWellnessEntry } from "../../lib/modules/personal-wellness/client";
import styles from "./WellnessOccurrences.module.css";
const label = (date: string) => Temporal.PlainDate.from(date).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"});
export default function WellnessOccurrences({ entry, section, today, onSaved }: {entry:WellnessEntry;section:WellnessSection;today:string;onSaved:(item:WellnessEntry)=>void}) {
  const [week,setWeek]=useState(entry.date>today?entry.date:today),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const day=Temporal.PlainDate.from(week),from=day.subtract({days:day.dayOfWeek-1}),through=from.add({days:6});
  const rows=wellnessOccurrences(entry,from.toString(),through.toString());
  return <details className={styles.panel}><summary><UnigentamosIcon role="calendar" size={15}/>Occurrences<UnigentamosIcon role="chevron-right" size={14}/></summary><div className={styles.navigation}>
    <button type="button" aria-label="Previous week" onClick={()=>setWeek(from.subtract({days:7}).toString())}><UnigentamosIcon role="back" size={16}/></button>
    <label>Week of<input type="date" aria-label="Week containing" value={from.toString()} onChange={event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))setWeek(event.target.value);}} /></label>
    <button type="button" aria-label="Next week" onClick={()=>setWeek(from.add({days:7}).toString())}><UnigentamosIcon role="chevron-right" size={16}/></button>
  </div>{!rows.length && <p>No occurrences this week.</p>}{rows.map(row=><div className={styles.row} key={row.date} data-completed={row.completed} data-skipped={row.skipped}>
    <span><time dateTime={row.start}>{label(row.start.slice(0,10))}</time><small>{Temporal.PlainDateTime.from(row.start).toLocaleString("en-US",{hour:"numeric",minute:"2-digit"})} – {Temporal.PlainDateTime.from(row.end).toLocaleString("en-US",{hour:"numeric",minute:"2-digit"})}</small></span>
    <div className={styles.actions}><button type="button" disabled={busy || row.skipped} aria-pressed={row.completed} aria-label={`${row.completed?"Reopen":"Complete"} ${label(row.date)}`} onClick={async()=>{setBusy(true);setError("");try{onSaved(await updateWellnessEntry(section,entry.id,entry.updatedAt,{}, {date:row.date,completed:!row.completed}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><UnigentamosIcon role="check" size={15}/>{row.completed?"Completed":"Complete"}</button>
    <button type="button" disabled={busy} aria-pressed={row.skipped} aria-label={(row.skipped?"Restore":"Skip")+" "+label(row.date)} onClick={async()=>{setBusy(true);setError("");try{onSaved(await updateWellnessEntry(section,entry.id,entry.updatedAt,{}, {date:row.date,skipped:!row.skipped}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><UnigentamosIcon role={row.skipped?"back":"close"} size={15}/>{row.skipped?"Skipped · restore":"Skip"}</button></div>
  </div>)}{error && <p role="alert">{error}</p>}</details>;
}
