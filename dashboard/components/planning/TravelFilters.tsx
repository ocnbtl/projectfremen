"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { travelStatuses, travelStatusLabels, type TravelKind, type TravelStatus } from "../../lib/modules/planning/travel";
import { travelKinds } from "../../lib/modules/planning/travel-filters";
import { travelKindIcons, travelStatusIcons } from "../../lib/modules/planning/travel-icons";
import styles from "./TravelPanel.module.css";

export default function TravelFilters({ kinds, statuses, onKinds, onStatuses }: { kinds: TravelKind[]; statuses: TravelStatus[]; onKinds:(value:TravelKind[])=>void; onStatuses:(value:TravelStatus[])=>void }) {
  const trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const reduced=useReducedMotion();
  const count=kinds.length+statuses.length;
  useEffect(()=>{
    if(!open)return;
    // Handle the inner filter before the sheet's document-level Escape listener.
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}};
    window.addEventListener("keydown",escape,true);
    return()=>window.removeEventListener("keydown",escape,true);
  },[open]);
  return <><button type="button" className="work-button work-button--secondary" ref={trigger} aria-label="Filter saved travel places" aria-pressed={!!count} aria-expanded={open} onClick={()=>setOpen(!open)}><UnigentamosIcon role="filter" size={18}/><span>Filter{count ? ` (${count})` : ""}</span></button>
    {open&&<motion.section initial={{opacity:reduced?1:0}} animate={{opacity:1}} transition={{duration:reduced?0:.2}} className={styles.savedFilterMenu} aria-label="Filter saved travel places" onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
      <header><strong>Filter by</strong><Button intent="quiet" icon="close" aria-label="Close travel filters" onClick={()=>{setOpen(false);trigger.current?.focus();}}/></header>
      <fieldset><legend>Place types</legend><div><button type="button" aria-pressed={!kinds.length} onClick={()=>onKinds([])}>All types</button>{travelKinds.map(kind=><button type="button" key={kind.value} aria-label={`Show ${kind.label}`} aria-pressed={kinds.includes(kind.value)} onClick={()=>onKinds(kinds.includes(kind.value)?kinds.filter(k=>k!==kind.value):[...kinds,kind.value])}><span className={styles.filterCheck} aria-hidden="true">{kinds.includes(kind.value)&&<UnigentamosIcon role="check" size={12}/>}</span><UnigentamosIcon role={travelKindIcons[kind.value]} size={16}/>{kind.label}</button>)}</div></fieldset>
      <fieldset><legend>Travel status</legend><div><button type="button" aria-pressed={!statuses.length} onClick={()=>onStatuses([])}>All statuses</button>{travelStatuses.map(status=><button type="button" key={status} aria-label={`Show ${travelStatusLabels[status]}`} aria-pressed={statuses.includes(status)} onClick={()=>onStatuses(statuses.includes(status)?statuses.filter(s=>s!==status):[...statuses,status])}><span className={styles.filterCheck} aria-hidden="true">{statuses.includes(status)&&<UnigentamosIcon role="check" size={12}/>}</span><UnigentamosIcon role={travelStatusIcons[status]} size={16}/>{travelStatusLabels[status]}</button>)}</div></fieldset>
      <small>Combine types and statuses to narrow your list.</small>
    </motion.section>}
  </>;
}
