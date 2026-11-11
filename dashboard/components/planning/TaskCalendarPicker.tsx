"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { TASK_KINDS, type TaskItem } from "../../lib/modules/planning/task-model";
import type { Calendar } from "../../lib/modules/planning/types";
import { writeTask } from "./task-client";
import styles from "./TaskCalendarPicker.module.css";

const icons:Record<string,string>={task:"check",goal:"goal",routine:"routine",obligation:"check",decision:"decision",follow_up:"follow-up",objective:"goal"};
function Badge({calendar}:{calendar:Calendar}){
 return <span className={styles.badge} title={"Calendar: "+calendar.name} aria-label={"Calendar: "+calendar.name} style={{background:`color-mix(in srgb, ${calendar.color} 22%, white)`,borderColor:calendar.color}}>{[...calendar.name.trim()][0]?.toLocaleUpperCase()||"C"}</span>;
}
export default function TaskCalendarPicker({item,calendars,onSaved,disabled=false}:{item:TaskItem;calendars:Calendar[];onSaved:()=>Promise<void>;disabled?:boolean}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(item.calendarIds),[saving,setSaving]=useState(false),[error,setError]=useState(""),[needsRefresh,setNeedsRefresh]=useState(false),[status,setStatus]=useState("");
 const inFlight=useRef(false);
 useEffect(()=>{if(!inFlight.current&&!needsRefresh)setSelected(item.calendarIds);},[item.calendarIds,item.updatedAt,needsRefresh]);
 async function refresh(){
  if(inFlight.current)return;
  inFlight.current=true;setSaving(true);
  try{await onSaved();setNeedsRefresh(false);setError("");setStatus("Up to date");}catch{setError("Could not refresh. Your saved assignments are safe.");}
  finally{inFlight.current=false;setSaving(false);}
 }
 async function toggle(id:string){
  if(inFlight.current||disabled||needsRefresh)return;
  const before=selected,next=before.includes(id)?before.filter(value=>value!==id):[...before,id];
  inFlight.current=true;setSaving(true);setSelected(next);setError("");setStatus("Saving…");let saved=false;
  try{
   await writeTask({operation:"assign-calendars",id:item.id,timeZone:item.timeZone,expectedUpdatedAt:item.updatedAt,sourceUpdatedAt:item.sourceUpdatedAt,calendarIds:next});
   saved=true;await onSaved();setStatus("Saved");
  }catch(e){
   if(!saved)setSelected(before);
   setStatus("");setNeedsRefresh(true);
   setError(saved?"Calendars saved. Refresh to continue.":(e as Error).message||"Calendars could not be saved.");
  }finally{inFlight.current=false;setSaving(false);}
 }
 return <Popover.Root open={open} onOpenChange={setOpen}>
  <Popover.Trigger asChild><button type="button" className={styles.trigger} data-task-calendar-picker aria-label={"Change calendars for "+item.title} title="Change assigned calendars" disabled={disabled} aria-busy={saving} onClick={event=>event.stopPropagation()}>
   <span className={styles.kind} title={TASK_KINDS[item.kind]}><UnigentamosIcon role={icons[item.kind]||"check"} size={15}/><span>{TASK_KINDS[item.kind]}</span></span>
   <span className={styles.badges}>{selected.map(id=>{const calendar=calendars.find(c=>c.id===id);return calendar?<Badge calendar={calendar} key={id}/>:null;})}{!selected.length&&<UnigentamosIcon role="calendar" size={16}/>}</span>
  </button></Popover.Trigger>
  {!open&&error&&<button type="button" className={styles.errorTrigger} onClick={()=>setOpen(true)} role="alert">Assignment needs attention</button>}
  <Popover.Portal><Popover.Content className={styles.panel} sideOffset={7} collisionPadding={10} aria-label={"Calendars for "+item.title} onClick={event=>event.stopPropagation()}>
   <header><UnigentamosIcon role="calendar" size={17}/><strong>Calendars</strong><Popover.Close aria-label="Close calendar assignments"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
   <div className={styles.options} role="group" aria-label="Assigned calendars">{calendars.map(calendar=><button type="button" key={calendar.id} aria-label={calendar.name} style={selected.includes(calendar.id)?{background:`color-mix(in srgb, ${calendar.color} 12%, white)`,borderColor:`color-mix(in srgb, ${calendar.color} 45%, white)`}:undefined} aria-pressed={selected.includes(calendar.id)} disabled={saving||disabled||needsRefresh||(!selected.includes(calendar.id)&&selected.length>=12)} onClick={()=>void toggle(calendar.id)}><Badge calendar={calendar}/><span>{calendar.name}</span><span className={styles.check}>{selected.includes(calendar.id)&&<UnigentamosIcon role="check" size={16}/>}</span></button>)}</div>
   {!calendars.length&&<p>No available calendars.</p>}
   {error?<div className={styles.error} role="alert"><p>{error}</p><button type="button" disabled={saving} onClick={()=>void refresh()}>Refresh assignments</button></div>:<footer><span role="status" aria-live="polite">{status||(!selected.length?"No calendar assigned":"Changes save automatically")}</span>{item.recurrence&&<span>Applies to every occurrence.</span>}</footer>}
  </Popover.Content></Popover.Portal>
 </Popover.Root>;
}
