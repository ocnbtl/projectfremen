"use client";
import { useEffect, useState } from "react";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import type { WellnessEntry, WellnessSchedule } from "../../lib/modules/personal-wellness/types";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import { updateWellnessEntry } from "../../lib/modules/personal-wellness/client";
import { wellnessOccurrence } from "../../lib/modules/personal-wellness/schedule";
import WellnessScheduleFields from "./WellnessScheduleFields";
import styles from "./WellnessScheduleFields.module.css";
export default function WellnessScheduleDialog({ target, onClose, onSaved }: { target: NonNullable<EventOccurrence["wellnessSource"]>; onClose: () => void; onSaved: () => void }) {
  const [entry, setEntry] = useState<WellnessEntry>(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [scope,setScope]=useState<"occurrence"|"series">(target.repeating && target.occurrenceDate ? "occurrence" : "series");
  const [original,setOriginal]=useState<WellnessEntry>();
  const forOccurrence=(item:WellnessEntry):WellnessSchedule|null=>{const row=target.occurrenceDate && wellnessOccurrence(item,target.occurrenceDate);return row && item.schedule ? {...item.schedule,start:row.start,end:row.end,repeat:undefined}:null;};
  useEffect(() => { const controller = new AbortController(); void fetch(`/api/personal/wellness?section=${target.section}`, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "This plan could not be loaded."); const item = data.state.entries.find((item: WellnessEntry) => item.id === target.id && !item.archived); if (!item) throw new Error("This plan is no longer available."); if(target.repeating && (!item.schedule?.repeat || !forOccurrence(item))) throw new Error("This occurrence changed. Close and reopen the plan."); setOriginal(item); setEntry(target.repeating ? {...item,schedule:forOccurrence(item)} : item); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [target.section, target.id, target.occurrenceDate]);
  return <WorkspaceSheet open onClose={() => { if (!busy) onClose(); }} title={`Schedule ${target.section === "meals" ? "meal" : "workout"}`} titleIcon={target.section === "meals" ? "meals" : "fitness"} presentation="center" className={styles.sheet}>
    <form className={styles.form} onSubmit={async event => { event.preventDefault(); if (!entry || busy) return; setBusy(true); setError(""); try { if(scope === "occurrence" && target.occurrenceDate && entry.schedule) await updateWellnessEntry(target.section,entry.id,entry.updatedAt,{}, {date:target.occurrenceDate,start:entry.schedule.start,end:entry.schedule.end}); else await updateWellnessEntry(target.section, entry.id, entry.updatedAt, { schedule: entry.schedule || null }); onSaved(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      {entry ? <><h3>{entry.title}</h3>{original?.schedule?.repeat && target.occurrenceDate && <div className={styles.scope} role="group" aria-label="Edit schedule scope">{(["occurrence","series"] as const).map(value=><WorkspaceButton key={value} aria-pressed={scope===value} onClick={()=>{setScope(value);setEntry({...original,schedule:value==="occurrence"?forOccurrence(original):original.schedule});}}>{value==="occurrence"?"This occurrence":"All repeats"}</WorkspaceButton>)}</div>}<WellnessScheduleFields occurrenceOnly={scope === "occurrence"} value={entry.schedule} date={entry.date} minutes={Number(entry.fields.minutes) || (target.section === "meals" ? 30 : 60)} onChange={schedule => setEntry({ ...entry, schedule })} /></> : !error && <p>Loading plan…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><WorkspaceButton disabled={busy} onClick={onClose}>Cancel</WorkspaceButton><WorkspaceButton type="submit" intent="primary" icon="check" busy={busy} disabled={!entry}>Save schedule</WorkspaceButton></div>
    </form>
  </WorkspaceSheet>;
}
