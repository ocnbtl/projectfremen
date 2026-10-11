"use client";
import { useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useCalendarMotion } from "./CalendarMotion";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./CalendarBookings.module.css";

export default function BookingDisclosure({ title, summary, icon = "sliders", children }: { title: string; summary: string; icon?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false), id = useId();
  const { reduced } = useCalendarMotion();
  return <section className={styles.disclosure} onInvalidCapture={event => {
    if (open) return;
    event.preventDefault(); setOpen(true);
    const input = event.target as HTMLInputElement;
    setTimeout(() => { if (input.isConnected) { input.focus(); input.reportValidity(); } }, reduced ? 0 : 300);
  }}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <UnigentamosIcon role={icon} size={16} /><span>{title}</span><small>{summary}</small><UnigentamosIcon role="chevron-down" size={14} className={open ? styles.rotated : undefined} />
    </button>
    <motion.div id={id} inert={!open} aria-hidden={!open} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: reduced ? 0 : .28, ease: [.22,.78,.18,1] }} style={{ overflow: "hidden" }}>
      <div className={styles.disclosureBody}>{children}</div>
    </motion.div>
  </section>;
}
