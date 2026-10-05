"use client";
import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { viewIcons, type CalendarView } from "../../lib/modules/planning/calendar-navigation";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useCalendarMotion } from "./CalendarMotion";
import styles from "./CalendarWorkspace.module.css";
const views: CalendarView[] = ["day", "3-day", "week", "month", "year", "agenda"];
export default function CalendarViewToggle({ view, onChange }: {view: CalendarView; onChange: (view: CalendarView) => void}) {
  const id = useId(), { reduced } = useCalendarMotion();
  return <LayoutGroup id={id}><div className={styles.viewToggle} role="radiogroup" aria-label="Calendar view">
    {views.map((value, index) => { const label = value === "3-day" ? "3 days" : value[0].toUpperCase() + value.slice(1); return <motion.button layout={!reduced} transition={{type: "spring", stiffness: 280, damping: 30, mass: 1.2}} type="button" role="radio" aria-checked={view === value} aria-label={label} title={label} tabIndex={view === value ? 0 : -1} key={value} onClick={() => onChange(value)} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 5 : (index + (event.key === "ArrowRight" ? 1 : 5)) % 6;
      onChange(views[next]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
    }}>
      {view === value && <motion.span className={styles.viewToggleIndicator} layoutId="selected-view" transition={reduced ? {duration: 0} : {type: "spring", stiffness: 280, damping: 30, mass: 1.2}} />}
      <UnigentamosIcon role={viewIcons[value]} size={18} />{view === value && <span className={styles.viewToggleLabel}>{label}</span>}
    </motion.button>; })}
  </div></LayoutGroup>;
}
