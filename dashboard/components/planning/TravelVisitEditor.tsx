"use client";
import { useState } from "react";
import type { TravelEntry } from "../../lib/modules/planning/travel-sync";
import { normalizeTravelVisits, travelStatusLabels, type TravelVisit } from "../../lib/modules/planning/travel";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import DateField from "../people/DateField";
import styles from "./TravelPanel.module.css";

export function visitDates(start:string,end:string) {
  if(!start)return "Dates to decide";
  const format=(date:string)=>new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
  return `${format(start)}${end&&end!==start?` – ${format(end)}`:""}`;
}
export default function TravelVisitEditor({entry,busy,onSave,onTrip,onPlan}:{entry:TravelEntry;busy:boolean;onSave:(visits:TravelVisit[])=>Promise<boolean>;onTrip:(id:string)=>void;onPlan:()=>void}) {
  const [draft,setDraft]=useState<TravelVisit>(),[error,setError]=useState("");
  const visits=entry.visits||[];
  async function save(){
    if(!draft)return;
    try { const next=normalizeTravelVisits([...visits.filter(v=>v.id!==draft.id),draft]);if(await onSave(next)){setDraft(undefined);setError("");} }
    catch(e){setError(e instanceof Error?e.message:"Check your visit dates");}
  }
  return <div className={styles.visitEditor}>
    <div className={styles.resultHeading}><strong>Visits & dates</strong><button type="button" onClick={()=>{setDraft({id:crypto.randomUUID(),startDate:"",endDate:"",note:""});setError("")}} disabled={busy}>Add visit</button><button type="button" onClick={onPlan}>Plan a trip</button></div>
    {!visits.length&&!entry.tripVisits.length&&!draft&&<p className={styles.hint}>Record past visits, or plan a trip to keep dates in sync.</p>}
    {[...visits].sort((a,b)=>b.startDate.localeCompare(a.startDate)).map(v=><div className={styles.visitRow} key={v.id}><UnigentamosIcon role="calendar" size={16}/><div><strong>{visitDates(v.startDate,v.endDate)}</strong>{v.note&&<small>{v.note}</small>}</div><button type="button" className={styles.textAction} onClick={()=>{setDraft(v);setError("")}} disabled={busy} aria-label={`Edit visit ${visitDates(v.startDate,v.endDate)}`}>Edit</button><button type="button" className={styles.textAction} disabled={busy} aria-label={`Remove visit ${visitDates(v.startDate,v.endDate)}`} onClick={()=>void onSave(visits.filter(x=>x.id!==v.id))}><UnigentamosIcon role="delete" size={16}/></button></div>)}
    {entry.tripVisits.map(v=><button type="button" className={styles.tripVisit} key={v.tripId} onClick={()=>onTrip(v.tripId)}><UnigentamosIcon role="travel" size={16}/><span><strong>{v.title}</strong><small>{visitDates(v.startDate,v.endDate)} · {travelStatusLabels[v.status]} · From trip</small></span><UnigentamosIcon role="chevron-right" size={16}/></button>)}
    {draft&&<div className={styles.visitForm}><div className={styles.datePair}><DateField compact label="First day" value={draft.startDate} onChange={startDate=>setDraft({...draft,startDate})}/><DateField compact required={false} label="Last day" value={draft.endDate} onChange={endDate=>setDraft({...draft,endDate})}/></div><label>Note <span className={styles.hint}>(optional)</span><input aria-label="Visit note" maxLength={500} value={draft.note} placeholder="A weekend away, a favorite memory…" onChange={e=>setDraft({...draft,note:e.target.value})}/></label><p className={styles.hint}>Leave the last day blank for a one-day visit. Saved visits appear in Calendar.</p>{error&&<p role="alert">{error}</p>}<div className={styles.formActions}><Button intent="primary" busy={busy} disabled={!draft.startDate||busy} onClick={()=>void save()}>Save visit</Button><Button intent="quiet" disabled={busy} onClick={()=>setDraft(undefined)}>Cancel</Button></div></div>}
  </div>;
}
