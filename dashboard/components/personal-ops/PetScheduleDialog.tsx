"use client";
import { useEffect, useState } from "react";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import WellnessScheduleFields from "./WellnessScheduleFields";
import { updatePetCare } from "../../lib/modules/dog-tracker/client";
import type { DogCareEvent } from "../../lib/modules/dog-tracker/types";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import styles from "./WellnessScheduleFields.module.css";
export default function PetScheduleDialog({target,onClose,onSaved}:{target:NonNullable<EventOccurrence["petSource"]>;onClose:()=>void;onSaved:()=>void}){
 const [entry,setEntry]=useState<DogCareEvent>(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();void fetch("/api/personal/pets",{cache:"no-store",signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error || "Care could not be loaded.");const item=d.state.events.find((e:DogCareEvent)=>e.id===target.id&&!e.archived);if(!item||!item.schedule||!d.state.pets.some((p:{id:string;archived:boolean})=>p.id===target.petId&&!p.archived))throw Error("This care schedule is no longer available.");setEntry(item);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[target]);
 return <WorkspaceSheet open title="Schedule pet care" titleIcon="dog" presentation="center" className={styles.sheet} onClose={()=>{if(!busy)onClose();}}><form className={styles.form} onSubmit={async e=>{e.preventDefault();if(!entry||busy)return;setBusy(true);setError("");try{await updatePetCare(entry.id,entry.updatedAt,{schedule:entry.schedule || null});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{entry?<WellnessScheduleFields allowRepeat={false} value={entry.schedule} date={entry.occurredAt.slice(0,10)} onChange={schedule=>setEntry({...entry,schedule})}/>:!error&&<p>Loading care…</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><WorkspaceButton onClick={onClose} disabled={busy}>Cancel</WorkspaceButton><WorkspaceButton type="submit" intent="primary" icon="check" busy={busy} disabled={!entry}>Save schedule</WorkspaceButton></div></form></WorkspaceSheet>;
}
