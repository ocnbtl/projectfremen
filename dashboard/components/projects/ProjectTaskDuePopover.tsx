"use client";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import EventDateSegments from "../planning/EventDateSegments";
import { writeTask } from "../planning/task-client";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import type { TaskItem } from "../../lib/modules/planning/task-model";
import styles from "./ProjectTaskDuePopover.module.css";

export default function ProjectTaskDuePopover({item,zone,disabled,onOpen,onSaved,children}:{item:TaskItem;zone:string;disabled:boolean;onOpen:()=>void;onSaved:()=>Promise<void>;children:ReactNode}) {
  const [open,setOpen]=useState(false),[date,setDate]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  const baseline=useRef(item),lock=useRef(false);
  function changeOpen(next:boolean) {
    if(lock.current)return;
    if(next){baseline.current=item;setDate(item.dueAt?.slice(0,10)||"");setError("");setSaved(false);onOpen();}
    setOpen(next);
  }
  async function save() {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError("");let persisted=saved;
    try {
      if(!persisted&&date!==baseline.current.dueAt?.slice(0,10)) {
        const current=baseline.current;
        // Older entity goals keep their deadline in the shared scheduling metadata.
        await writeTask({operation:current.source?.family==="legacyGoals"?"schedule":"details",id:current.id,expectedUpdatedAt:current.updatedAt,sourceUpdatedAt:current.sourceUpdatedAt,timeZone:zone,input:{...current,dueAt:date}});
        persisted=true;setSaved(true);
      }
      if(persisted)await onSaved();
      setOpen(false);
    } catch(cause) {setError(persisted?"Saved. Refresh tasks to see the update.":cause instanceof Error?cause.message:"Could not update the due date.");}
    finally {lock.current=false;setBusy(false);}
  }
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild><button type="button" data-task-due-button disabled={disabled} aria-label={`Change due date for ${item.title}`} onClick={e=>e.stopPropagation()}>{children}</button></Popover.Trigger>
    <Popover.Portal><Popover.Content className={styles.panel} style={moduleThemeVariables("projects") as CSSProperties} data-picker-boundary="viewport" aria-label={`Due date for ${item.title}`} align="end" side="top" sideOffset={8} collisionPadding={12}>
      <header><UnigentamosIcon role="calendar" size={17}/><strong>Due date</strong><Popover.Close disabled={busy} aria-label="Close due date"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
      <p className={styles.title}>{item.title}</p>
      <form onSubmit={e=>{e.preventDefault();void save();}}>
        <fieldset disabled={busy||saved}><EventDateSegments label="Due date" hideLabel value={date} allDay timeZone={zone} onChange={setDate}/></fieldset>
        {error&&<p role="alert" className={styles.error}>{error}</p>}
        <footer><Button disabled={busy} onClick={()=>changeOpen(false)}>Cancel</Button><Button intent="primary" icon={saved?"refresh":"edit"} type="submit" disabled={busy}>{busy?"Saving…":saved?"Refresh":"Save date"}</Button></footer>
      </form>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
