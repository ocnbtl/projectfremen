"use client";
import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import styles from "./TaskEventCard.module.css";

export function TaskCheck({ event, onComplete }: { event: EventOccurrence; onComplete: (event: EventOccurrence) => void }) {
  if (!event.isTask) return null;
  return <button type="button" className={styles.check} data-task-check aria-label={`${event.completed ? "Reopen" : "Complete"} ${event.title}`} aria-pressed={Boolean(event.completed)} onClick={e => { e.stopPropagation(); onComplete(event); }} onPointerDown={e => e.stopPropagation()}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" />{event.completed && <path d="m8 12 3 3 5-6" />}</svg>
  </button>;
}

/** The opening target and completion control are siblings, including for keyboard users. */
export default function TaskEventCard({ event, onComplete, onClick, children, className, ...props }: Omit<HTMLMotionProps<"div">, "onClick" | "children"> & {
  children?: ReactNode; event: EventOccurrence; onComplete: (event: EventOccurrence) => void; onClick: () => void;
}) {
  return <motion.div {...props} className={`${className || ""} ${styles.card}`} data-completed={event.isTask && event.completed || undefined}>
    <button className={styles.open} type="button" onClick={onClick} aria-label={String(props["aria-label"] || event.title)} />
    <TaskCheck event={event} onComplete={onComplete} />{children}
  </motion.div>;
}
