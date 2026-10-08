"use client";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./EventDetail.module.css";
export default function EventDetail({ kind, text, eventTitle, compact = true }: { kind: "time" | "place"; text: string; eventTitle: string; compact?: boolean }) {
  const label = kind === "time" ? "Time" : "Place", role = kind === "time" ? "clock" : "location";
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-event-detail={kind} data-compact={compact || undefined} aria-label={`${label} for ${eventTitle}`} title={text} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}><UnigentamosIcon role={role} size={14}/>{!compact && <span>{text}</span>}</button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={`${label} for ${eventTitle}`}>
    <UnigentamosIcon role={role} size={16}/><span>{text}</span><Popover.Close aria-label={`Close ${label.toLowerCase()}`}><UnigentamosIcon role="close" size={15}/></Popover.Close>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
