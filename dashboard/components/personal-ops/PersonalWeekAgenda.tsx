"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDays } from "../../lib/modules/planning/calendar-model";
import { weekStart, type PersonalAgendaEntry } from "../../lib/modules/personal-ops/agenda";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import styles from "./PersonalWeekAgenda.module.css";

export default function PersonalWeekAgenda({ entries, includeConnected, query, onOpen }: {entries: PersonalAgendaEntry[]; includeConnected: boolean; query: string; onOpen: (id: string)=>void}) {
  const [start,setStart] = useState(()=>weekStart());
  const [remote,setRemote] = useState<PersonalAgendaEntry[]>([]);
  const [warnings,setWarnings] = useState<string[]>([]);
  const [loading,setLoading] = useState(false);
  const [retry,setRetry] = useState(0);
  const zone = useMemo(()=>Intl.DateTimeFormat().resolvedOptions().timeZone,[]);
  useEffect(()=>{
    if (!includeConnected) {setRemote([]);setWarnings([]);setLoading(false);return;}
    const controller = new AbortController();setLoading(true);setRemote([]);setWarnings([]);
    fetch(`/api/personal/agenda?${new URLSearchParams({start,timeZone:zone})}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error("Connected schedules could not load.");return response.json();}).then(data=>{if (!controller.signal.aborted) {setRemote(data.entries);setWarnings(data.warnings || []);}}).catch(error=>{if(!controller.signal.aborted)setWarnings([error.message]);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[start,zone,includeConnected,retry]);
  const days=Array.from({length:7},(_,index)=>addDays(start,index));
  const combined=[...entries,...remote.filter(item=>`${item.title} ${item.source}`.toLowerCase().includes(query.toLowerCase()))];
  const label=(date:string,weekday=false)=>new Date(date+"T12:00:00").toLocaleDateString(undefined,weekday?{weekday:"short",month:"short",day:"numeric"}:{month:"short",day:"numeric"});
  const row=(item:PersonalAgendaEntry)=><li key={item.id} data-complete={item.completed || undefined}>{item.type && item.type !== "routine" ? <button type="button" onClick={()=>onOpen(item.id)}><span><strong>{item.title}</strong><small>{item.source}</small></span><time>{item.time || (item.completed ? "Complete" : "Any time")}</time></button> : <Link prefetch={false} href={item.href}><span><strong>{item.title}</strong><small>{item.source}</small></span><time>{item.time || (item.completed ? "Complete" : "All day")}</time></Link>}</li>;
  const overdue=entries.filter(item=>item.date && item.date<start && !item.completed);
  const undated=entries.filter(item=>!item.date);
  return <section className={styles.agenda} aria-label="Personal weekly agenda">
    <header><div><h2>{label(start)} – {label(addDays(start,6))}</h2><p>{includeConnected ? "Personal, Calendar, meals, workouts, pet care and project deadlines." : "Your selected Personal records."} <span>{zone.replaceAll("_"," ")}</span></p></div><div className={styles.navigation}><WorkspaceButton icon="back" aria-label="Previous week" onClick={()=>setStart(addDays(start,-7))}/><WorkspaceButton onClick={()=>setStart(weekStart())}>This week</WorkspaceButton><WorkspaceButton icon="chevron-right" aria-label="Next week" onClick={()=>setStart(addDays(start,7))}/></div></header>
    {loading && <p role="status">Loading connected schedules…</p>}
    {warnings.length>0 && <div role="alert">{warnings.join(" ")} <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
    {overdue.length>0 && <section className={styles.overdue}><h3>Overdue <span>{overdue.length}</span></h3><ul>{overdue.map(row)}</ul></section>}
    <div className={styles.days}>{days.map(day=>{const items=combined.filter(item=>item.date && item.date<=day && (item.endDate || item.date)>=day).sort((a,b)=>(a.sortTime || 0)-(b.sortTime || 0) || a.title.localeCompare(b.title));return <section key={day}><h3>{label(day,true)}<span>{items.length}</span></h3>{items.length ? <ul>{items.map(row)}</ul> : <p className={styles.empty}>Nothing scheduled</p>}</section>;})}</div>
    {undated.length>0 && <details><summary>No date <span>{undated.length}</span></summary><ul>{undated.map(row)}</ul></details>}
  </section>;
}
