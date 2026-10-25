"use client";
import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./TaskEventCard.module.css";

export function TaskCheck({ event, onComplete }: { event: EventOccurrence; onComplete: (event: EventOccurrence) => void }) {
  if (!event.isTask) return null;
  return <button type="button" className={styles.check} data-task-check aria-label={`${event.completed ? "Reopen" : "Complete"} ${event.title}`} aria-pressed={Boolean(event.completed)} onClick={e => { e.stopPropagation(); onComplete(event); }} onPointerDown={e => e.stopPropagation()} data-icon-button="event">
    <UnigentamosIcon role="task-state" candidate={event.completed ? "circle-check" : "circle"} />
  </button>;
}

/** The opening target and completion control are siblings, including for keyboard users. */
export default function TaskEventCard({ event, onComplete, onClick, children, className, inlineTaskCheck = false, ...props }: Omit<HTMLMotionProps<"div">, "onClick" | "children"> & {
  children?: ReactNode; event: EventOccurrence; onComplete: (event: EventOccurrence) => void; onClick: () => void; inlineTaskCheck?: boolean;
}) {
  return <motion.div {...props} className={`${className || ""} ${styles.card}`} data-completed={event.isTask && event.completed || undefined} onClick={e => { if (!(e.target as HTMLElement).closest("button,a")) onClick(); }}>
    <button className={styles.open} type="button" onClick={onClick} aria-label={String(props["aria-label"] || event.title)} />
    {!inlineTaskCheck && <TaskCheck event={event} onComplete={onComplete} />}{children}
  </motion.div>;
}
