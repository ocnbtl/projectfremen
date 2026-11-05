"use client";

import { useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./ProjectInspection.module.css";

export default function ProjectDisclosure({title,icon,children,defaultOpen=false}:{title:string;icon:string;children:ReactNode;defaultOpen?:boolean}) {
  const [open,setOpen]=useState(defaultOpen);
  const id=useId(), reduced=useReducedMotion();
  return <section className={styles.expandable}>
    <button type="button" className={styles.disclosureTrigger} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>
      <span><UnigentamosIcon role={icon} size={16}/>{title}</span><UnigentamosIcon role="chevron-down" size={16}/>
    </button>
    <motion.div id={id} initial={false} animate={{height:open?"auto":0,opacity:open?1:0}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}} className={styles.disclosureContent} inert={!open} aria-hidden={!open}>
      <div className={styles.disclosureInner}>{children}</div>
    </motion.div>
  </section>;
}
