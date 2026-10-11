"use client";
import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { viewIcons, type CalendarView } from "../../lib/modules/planning/calendar-navigation";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useCalendarMotion } from "./CalendarMotion";
import styles from "./CalendarWorkspace.module.css";
const views: CalendarView[] = ["day", "3-day", "week", "month", "year", "agenda"];
export default function CalendarViewToggle({ view, onChange }: {view: CalendarView; onChange: (view: CalendarView) => void}) {
  const { reduced } = useCalendarMotion(), root = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ base: 36, gap: 2, padding: 3, labelGap: 7, labels: [24,36,32,38,28,44] });
  useLayoutEffect(() => {
    const measure = () => {
      const node = root.current, button = node?.querySelector('button'), icon = button?.querySelector('svg');
      if (!node || !button || !icon || !node.getBoundingClientRect().width) return;
      const style = getComputedStyle(button), parent = getComputedStyle(node);
      const next = { base: Math.max(parseFloat(style.minWidth), icon.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)), gap: parseFloat(parent.gap), padding: parseFloat(parent.paddingLeft), labelGap: innerWidth < 1600 ? 4 : 7, labels: [...node.querySelectorAll<HTMLElement>('[data-view-label]')].map(label => label.getBoundingClientRect().width) };
      setGeometry(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure(); window.addEventListener('resize', measure); void document.fonts.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const widths = views.map((value, index) => geometry.base + (value === view ? geometry.labelGap + geometry.labels[index] : 0));
  const selected = views.indexOf(view);
  const transition = { duration: reduced ? 0 : .3, ease: [.22,.78,.18,1] as [number,number,number,number] };
  return <div ref={root} className={styles.viewToggle} role="radiogroup" aria-label="Calendar view">
    <motion.span aria-hidden="true" className={styles.viewToggleIndicator} initial={false} animate={{ x: geometry.padding + widths.slice(0, selected).reduce((sum, width) => sum + width + geometry.gap, 0), width: widths[selected] }} transition={transition} />
    {views.map((value, index) => { const label = value === "3-day" ? "3 days" : value[0].toUpperCase() + value.slice(1); return <motion.button initial={false} animate={{ width: widths[index] }} transition={transition} type="button" role="radio" aria-checked={view === value} aria-label={label} title={label} tabIndex={view === value ? 0 : -1} key={value} onClick={() => onChange(value)} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 5 : (index + (event.key === "ArrowRight" ? 1 : 5)) % 6;
      onChange(views[next]); root.current?.querySelectorAll('button')[next]?.focus();
    }}>
      <UnigentamosIcon role={viewIcons[value]} size={18} /><motion.span className={styles.viewToggleLabel} aria-hidden="true" initial={false} animate={{ width: view === value ? geometry.labels[index] : 0, marginLeft: view === value ? geometry.labelGap : 0, opacity: view === value ? 1 : 0 }} transition={transition}><span data-view-label>{label}</span></motion.span>
    </motion.button>; })}
  </div>;
}
