"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { writeTask, type TaskUndoReceipt } from "./task-client";
import styles from "./TaskCompletionUndo.module.css";
export default function TaskCompletionUndo(){
 const [receipts,setReceipts]=useState<TaskUndoReceipt[]>([]),[host,setHost]=useState<HTMLElement>(),[busy,setBusy]=useState(false),[error,setError]=useState("");const reduced=useReducedMotion(),receipt=receipts.at(-1);
 useEffect(()=>{const completed=(event:Event)=>{setReceipts(previous=>[...previous.slice(-4),(event as CustomEvent<TaskUndoReceipt>).detail]);setError("");};window.addEventListener("unigentamos-task-completed",completed);return()=>window.removeEventListener("unigentamos-task-completed",completed);},[]);
 useEffect(()=>{if(!receipt)return;const update=()=>setHost([...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')].at(-1)||document.body);update();const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["data-state"]});return()=>observer.disconnect();},[receipt]);
 const dismiss=()=>{setReceipts(previous=>previous.slice(0,-1));setError("");};
 async function undo(){if(!receipt||busy)return;setBusy(true);setError("");try{await writeTask(receipt.command);dismiss();window.dispatchEvent(new Event("unigentamos-tasks-restored"));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return host?createPortal(<AnimatePresence>{receipt&&<motion.aside key={receipt.command.id as string} className={styles.toast} aria-label="Task completion" initial={{opacity:0,y:reduced?0:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:5}} transition={{duration:reduced?0:.18}}><UnigentamosIcon role="check" size={18}/><div className={styles.message} role="status"><strong>Task done</strong><span>{receipt.title}</span></div><button type="button" disabled={busy} onClick={()=>void undo()}>{busy?"Undoing…":"Undo"}</button><button className={styles.dismiss} type="button" disabled={busy} onClick={dismiss} aria-label="Dismiss task completion"><UnigentamosIcon role="close" size={16}/></button>{error&&<p role="alert">{error}</p>}</motion.aside>}</AnimatePresence>,host):null;
}
