"use client";
import { motion } from "motion/react";
import { useCalendarMotion } from "./CalendarMotion";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./EventDetail.module.css";
export default function EventDetail({ kind, text, eventTitle, compact = true }: { kind: "time" | "place"; text: string; eventTitle: string; compact?: boolean }) {
  const {reduced,directGesture}=useCalendarMotion();
  const label = kind === "time" ? "Time" : "Place", role = kind === "time" ? "clock" : "location";
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-event-detail={kind} data-compact={compact || undefined} aria-label={`${label} for ${eventTitle}`} title={text} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}><UnigentamosIcon role={role} size={14}/><motion.span aria-hidden={compact || undefined} initial={false} animate={{width:compact?0:"auto",opacity:compact?0:1,marginLeft:compact?0:4}} transition={{duration:reduced||directGesture?0:.22,ease:[.22,1,.36,1]}}>{text}</motion.span></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={`${label} for ${eventTitle}`}>
    <UnigentamosIcon role={role} size={16}/><span>{text}</span><Popover.Close aria-label={`Close ${label.toLowerCase()}`}><UnigentamosIcon role="close" size={15}/></Popover.Close>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
