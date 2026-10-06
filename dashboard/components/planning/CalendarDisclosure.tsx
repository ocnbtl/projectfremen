"use client";
import { useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useCalendarMotion } from "./CalendarMotion";
import styles from "./CalendarWorkspace.module.css";

export default function CalendarDisclosure({ title, icon, children, leading, actions }: { title: string; icon: string; children: ReactNode; leading?: ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(false), id = useId();
  const { reduced } = useCalendarMotion();
  return <section className={styles.settingsDisclosure} data-open={open}>
    <div className={styles.disclosureHeader}>{leading}<button type="button" className={styles.disclosureTrigger} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <UnigentamosIcon role={icon} size={18} /><span>{title}</span><UnigentamosIcon role="chevron-down" size={16} />
    </button>{actions}</div>
    <motion.div id={id} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: reduced ? 0 : .26, ease: [.22, 1, .36, 1] }} inert={!open} aria-hidden={!open} className={styles.disclosureBody}>
      <div className={styles.disclosureInner}>{children}</div>
    </motion.div>
  </section>;
}
