"use client";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { TaskItem } from "../../lib/modules/planning/task-model";
import { validateEventTime } from "../../lib/modules/planning/calendar-model";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import TaskScheduleFields from "./TaskScheduleFields";
import { writeTask } from "./task-client";
import taskStyles from "./TaskWorkspace.module.css";
import styles from "./TaskSchedulePopover.module.css";

const timingKeys = ["start", "end", "allDay", "timeZone", "recurrence"] as const;

export default function TaskSchedulePopover({item,zone,onSaved,disabled,children}:{item:TaskItem;zone:string;onSaved:()=>Promise<void>;disabled:boolean;children:ReactNode}) {
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(item),[busy,setBusy]=useState(false),[error,setError]=useState(""),[repeatError,setRepeatError]=useState(""),[refreshNeeded,setRefreshNeeded]=useState(false);
 const baseline=useRef(item),inFlight=useRef(false);
 function changeOpen(next:boolean){if(inFlight.current)return;if(next){baseline.current=item;setDraft(item);setError("");setRepeatError("");setRefreshNeeded(false);}setOpen(next);}
 async function save(){
  if(inFlight.current||repeatError)return;
  inFlight.current=true;setBusy(true);setError("");let dueSaved=false,saved=false;
  try{
   if(refreshNeeded){await onSaved();setOpen(false);return;}
   if(draft.start)validateEventTime({...draft,calendarId:"native",kind:"event",location:"",linkedRefs:[],reminderMinutes:null});
   else if(draft.end||draft.recurrence)throw new Error("Choose a start date for this schedule.");
   let current=baseline.current;
   if((draft.dueAt||"")!==(current.dueAt||"")){
    current=await writeTask({operation:"details",id:current.id,expectedUpdatedAt:current.updatedAt,sourceUpdatedAt:current.sourceUpdatedAt,timeZone:zone,input:{...current,dueAt:draft.dueAt||""}});
    baseline.current=current;dueSaved=true;
   }
   if(timingKeys.some(key=>draft[key]!==current[key])){
    const input={...current,start:draft.start,end:draft.end,allDay:draft.allDay,timeZone:draft.timeZone,recurrence:draft.recurrence,dueAt:draft.dueAt||""};
    const result=await writeTask({operation:"schedule",id:current.id,expectedUpdatedAt:current.updatedAt,sourceUpdatedAt:current.sourceUpdatedAt,timeZone:draft.timeZone,input});
    baseline.current={...input,updatedAt:result.updatedAt,sourceUpdatedAt:current.source?.family==="events"?result.updatedAt:current.sourceUpdatedAt};
   }
   saved=true;await onSaved();setOpen(false);
  }catch(e){setRefreshNeeded(saved);setError(saved?"Saved. Refresh tasks to see the update.":`${dueSaved?"Due date saved. Schedule needs attention: ":""}${(e as Error).message}`);}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <Popover.Root open={open} onOpenChange={changeOpen}>
  <Popover.Trigger asChild><button type="button" className={`${taskStyles.schedule} ${styles.trigger}`} data-task-date disabled={disabled} aria-label={`Edit schedule for ${item.title}`} title="Edit schedule or due date" onClick={e=>e.stopPropagation()}>{children}</button></Popover.Trigger>
  <Popover.Portal><Popover.Content className={styles.panel} data-picker-boundary="viewport" style={moduleThemeVariables("personal_ops") as CSSProperties} align="end" side="top" sideOffset={8} collisionPadding={12} aria-label={`Schedule for ${item.title}`}>
   <header><UnigentamosIcon role="calendar" size={17}/><strong>{item.title}</strong><Popover.Close aria-label="Close task schedule" disabled={busy}><UnigentamosIcon role="close" size={17}/></Popover.Close></header>
   <form className={`${taskStyles.editor} ${styles.form}`} onSubmit={e=>{e.preventDefault();void save();}}>
    <fieldset disabled={busy||refreshNeeded}><TaskScheduleFields draft={draft} update={patch=>setDraft(previous=>({...previous,...patch}))} zone={zone} onRepeatError={setRepeatError}/></fieldset>
    {(item.recurrence||draft.recurrence)&&<p className={styles.hint}>Schedule changes apply to the repeating series. Completed occurrences stay recorded.</p>}
    {(error||repeatError)&&<p className={styles.error} role="alert">{error||repeatError}</p>}
    <footer><Button disabled={busy} onClick={()=>changeOpen(false)}>Cancel</Button><Button type="submit" intent="primary" icon={refreshNeeded?"refresh":"edit"} disabled={busy||!!repeatError}>{busy?"Saving…":refreshNeeded?"Refresh tasks":"Save updates"}</Button></footer>
   </form>
  </Popover.Content></Popover.Portal>
 </Popover.Root>;
}
