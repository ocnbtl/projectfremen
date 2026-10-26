"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useCalendarMotion } from "./CalendarMotion";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./EventDetail.module.css";
import { useCalendarDetails } from "./CalendarDisplayPreferences";
export default function EventDetail({ kind, text, address, href, eventTitle, compact = true }: { kind: "time" | "place"; text: string; address?: string; href?: string; eventTitle: string; compact?: boolean }) {
  const {reduced,directGesture}=useCalendarMotion();
  const details = useCalendarDetails();
  compact = compact || !details[kind === "time" ? "time" : "address"];
  const label = kind === "time" ? "Time" : "Place", role = kind === "time" ? "clock" : "location";
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-event-detail={kind} data-compact={compact || undefined} aria-label={`${label} for ${eventTitle}`} title={text} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}><UnigentamosIcon role={role} size={14}/><motion.span aria-hidden={compact || undefined} initial={false} animate={{width:compact?0:"auto",opacity:compact?0:1,marginLeft:compact?0:4}} transition={{duration:reduced||directGesture?0:.22,ease:[.22,1,.36,1]}}>{text}</motion.span></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={`${label} for ${eventTitle}`} onOpenAutoFocus={e => e.preventDefault()} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    <UnigentamosIcon role={role} size={16}/><span className={styles.copy}><span>{text}</span>{kind === "place" && address && <small>{address}</small>}{kind === "place" && href && <Link className={styles.profileLink} href={href}><UnigentamosIcon role="edit" size={13}/>Open place in Map</Link>}</span><Popover.Close aria-label={`Close ${label.toLowerCase()}`}><UnigentamosIcon role="close" size={15}/></Popover.Close>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
