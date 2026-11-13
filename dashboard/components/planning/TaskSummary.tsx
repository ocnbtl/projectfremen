"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { eventObjectRefs, EventObjectIdentity } from "./EventObjects";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./TaskSummary.module.css";
export default function TaskSummary({day,tasks,refs,onOpen,className,style}:{day:string;tasks:EventOccurrence[];refs:NativeObjectRef[];onOpen:()=>void;className?:string;style?:CSSProperties}){
 const faces=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(0);
 const linked=[...new Map(tasks.flatMap(event=>[...eventObjectRefs(event,refs),...(event.taskContext?.peopleIds||[]).flatMap(id=>refs.filter(ref=>ref.module==="people"&&ref.objectId===id))]).filter(ref=>ref.module==="people"||ref.module==="projects").map(ref=>[ref.module+":"+ref.objectId,ref])).values()];
 useLayoutEffect(()=>{if(!faces.current)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(faces.current);return()=>observer.disconnect();},[]);
 const capacity=Math.max(0,Math.floor(width/26)),limit=capacity>=linked.length?linked.length:Math.max(0,Math.floor((width-30)/26));
 return <button type="button" className={[styles.summary,className].filter(Boolean).join(" ")} style={style} onClick={onOpen} aria-label={tasks.length+" tasks on "+day} data-task-summary={day}><UnigentamosIcon role="check" size={16}/><strong>{tasks.length} {tasks.length===1?"task":"tasks"}</strong><span ref={faces} className={styles.faces} aria-hidden="true">{linked.slice(0,limit).map(ref=><EventObjectIdentity key={ref.module+":"+ref.objectId} record={ref}/>)}{linked.length>limit&&<small>+{linked.length-limit}</small>}</span><UnigentamosIcon role="chevron-right" size={14}/></button>;
}
