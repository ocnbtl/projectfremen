"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { TravelEntry } from "../../lib/modules/planning/travel-sync";
import { normalizeTravelVisits, travelStatusLabels, formatVisitDates, visitPrecision, type VisitPrecision, type TravelVisit } from "../../lib/modules/planning/travel";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import TravelVisitDateField from "./TravelVisitDateField";
import SelectField from "../ui/SelectField";
import styles from "./TravelPanel.module.css";

export const visitDates=formatVisitDates;
const emptyVisit=():TravelVisit=>({id:crypto.randomUUID(),startDate:"",endDate:"",note:""});

export default function TravelVisitEditor({entry,busy,addRequest=0,onSave,onTrip,onPlan}:{entry:TravelEntry;busy:boolean;addRequest?:number;onSave:(visits:TravelVisit[])=>Promise<boolean>;onTrip:(id:string)=>void;onPlan:()=>void}) {
  const [draft,setDraft]=useState<TravelVisit>(),[error,setError]=useState(""),[range,setRange]=useState(false),[precision,setPrecision]=useState<VisitPrecision>("day");
  const reduced=useReducedMotion(), visits=entry.visits||[], hasHistory=!!(visits.length||entry.tripVisits.length);
  const editing=!!draft&&visits.some(v=>v.id===draft.id);
  useEffect(()=>{if(addRequest){setDraft(current=>current||emptyVisit());setError("");}},[addRequest]);
  function begin(visit?:TravelVisit){setPrecision(visit?visitPrecision(visit.startDate):"day");setDraft(visit||emptyVisit());setRange(!!visit?.endDate&&visit.endDate!==visit.startDate);setError("");}
  async function save(){
    if(!draft||busy)return;
    if(range&&!draft.endDate){setError("Choose an end date, or switch to a single date.");return;}
    try {
      const next=normalizeTravelVisits([...visits.filter(v=>v.id!==draft.id),{...draft,endDate:range?draft.endDate:draft.startDate}]);
      if(await onSave(next)){setDraft(undefined);setRange(false);setPrecision("day");setError("");}else setError("Your visit wasn’t saved. Your dates are still here — try again.");
    }catch(e){setError(e instanceof Error?e.message:"Check your visit dates");}
  }
  return <section className={styles.visitEditor} aria-label={`Visit dates for ${entry.name}`}>
    <div className={styles.visitHeading}>
      <div><h4>{draft?editing?"Edit visit":"Record a visit":"Visit dates"}</h4><p>{draft?"Exact dates appear in Calendar; approximate dates stay in your travel history.":hasHistory?"Your recorded visits and linked trips.":"Add dates for a past visit, or plan an upcoming trip."}</p></div>
      {!draft&&hasHistory&&<Button intent="secondary" icon="plus" disabled={busy} onClick={()=>begin()}>Add visit</Button>}
    </div>
    {!draft&&!hasHistory&&<div className={styles.visitEmptyActions}><Button intent="primary" icon="calendar" disabled={busy} onClick={()=>begin()}>Record a visit</Button><Button intent="quiet" icon="travel" onClick={onPlan}>Plan a trip</Button></div>}
    <AnimatePresence initial={false}>
      {draft&&<motion.div key="visit-form" initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}} className={styles.visitFormMotion}>
        <form className={styles.visitForm} onSubmit={e=>{e.preventDefault();void save();}}>
          <fieldset disabled={busy}>
            <legend className={styles.srOnly}>Visit details</legend>
            <div className={styles.visitOptions}><SelectField contained aria-label="Date detail" value={precision} onChange={e=>{const next=e.target.value as VisitPrecision;const length={day:10,month:7,year:4}[next];setDraft({...draft,startDate:draft.startDate.length>=length?draft.startDate.slice(0,length):"",endDate:draft.endDate.length>=length?draft.endDate.slice(0,length):""});setPrecision(next);setError("");}}><option value="day">Exact dates</option><option value="month">Month &amp; year</option><option value="year">Year only</option></SelectField>
            <div className={styles.visitDuration} role="group" aria-label="Visit duration">
              {[{value:false,label:precision==="day"?"One day":precision==="month"?"One month":"One year"},{value:true,label:precision==="day"?"Date range":precision==="month"?"Month range":"Year range"}].map(option=><button type="button" key={option.label} aria-pressed={range===option.value} onClick={()=>{setRange(option.value);setError("");}}>{option.label}</button>)}
            </div></div>
            <div className={styles.visitFields}>
              <TravelVisitDateField precision={precision} label={range?"Start":"Visit"} value={draft.startDate} onChange={startDate=>{setDraft({...draft,startDate});setError("");}}/>
              {range&&<TravelVisitDateField precision={precision} label="End" value={draft.endDate} onChange={endDate=>{setDraft({...draft,endDate});setError("");}}/>}
              <label className={styles.visitNote}>Note <span>Optional</span><input aria-label="Visit note" maxLength={500} value={draft.note} placeholder="A memory or reason for the visit" onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
            </div>
          </fieldset>
          {error&&<p className={styles.visitError} role="alert">{error}</p>}
          <div className={styles.formActions}><Button type="submit" intent="primary" icon="check" busy={busy} disabled={!draft.startDate||busy}>{editing?"Save changes":"Save visit"}</Button><Button intent="quiet" disabled={busy} onClick={()=>{setDraft(undefined);setRange(false);setPrecision("day");setError("");}}>Cancel</Button></div>
        </form>
      </motion.div>}
    </AnimatePresence>
    {!!visits.length&&<div className={styles.visitHistory}><h5>Recorded visits <span>{visits.length}</span></h5>{[...visits].sort((a,b)=>b.startDate.localeCompare(a.startDate)).map(v=><div className={styles.visitRow} key={v.id}><UnigentamosIcon role="calendar" size={16}/><div><strong>{visitDates(v.startDate,v.endDate)}</strong>{v.note&&<small>{v.note}</small>}</div><button type="button" className={styles.textAction} onClick={()=>begin(v)} disabled={busy||!!draft} aria-label={`Edit visit ${visitDates(v.startDate,v.endDate)}`}>Edit</button><button type="button" className={styles.textAction} data-icon-button="compact" disabled={busy||!!draft} aria-label={`Remove visit ${visitDates(v.startDate,v.endDate)}`} onClick={()=>void onSave(visits.filter(x=>x.id!==v.id))}><UnigentamosIcon role="delete" size={16}/></button></div>)}</div>}
    {!!entry.tripVisits.length&&<div className={styles.visitHistory}><h5>Linked trips</h5>{entry.tripVisits.map(v=><button type="button" className={styles.tripVisit} key={v.tripId} onClick={()=>onTrip(v.tripId)}><UnigentamosIcon role="travel" size={16}/><span><strong>{v.title}</strong><small>{visitDates(v.startDate,v.endDate)} · {travelStatusLabels[v.status]}</small></span><UnigentamosIcon role="chevron-right" size={16}/></button>)}</div>}
    {hasHistory&&!draft&&<Button intent="quiet" icon="travel" onClick={onPlan}>Plan a trip</Button>}
  </section>;
}
