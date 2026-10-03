"use client";
import * as Popover from "@radix-ui/react-popover";
import { useState, useRef, useLayoutEffect, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import { dateScales, weeksOfYear, navigationYear, viewIcons, type CalendarView, type DateScale } from "../../lib/modules/planning/calendar-navigation";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import CalendarMiniMonth, { calendarDateLabel as label } from "./CalendarMiniMonth";
import { CalendarScene, useCalendarMotion } from "./CalendarMotion";
import styles from "./CalendarWorkspace.module.css";

export default function CalendarDatePicker({ value, today, view, onChange }: { value: string; today: string; view: CalendarView; onChange: (day: string, view: CalendarView) => void }) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState<DateScale>(view === "3-day" || view === "agenda" ? "day" : view);
  const previousView = useRef(view);
  const [year, setYear] = useState(Number(value.slice(0, 4))), [focused, setFocused] = useState(value), [direction, setDirection] = useState(1);
  const body = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const button = body.current?.querySelector<HTMLButtonElement>(`[data-mini-date="${pendingFocus.current}"]`);
    if (button) { button.focus(); pendingFocus.current = null; }
  }, [focused, year]);
  const { reduced } = useCalendarMotion();
  const nativeMorph = typeof document !== "undefined" && Boolean(document.documentElement.dataset.calendarMorph);
  const heading = view === "year" ? value.slice(0, 4) : <><span className={styles.headingMonthFull}>{label(value, { month: "long" })}</span><span className={styles.headingMonthShort}>{label(value, { month: "short" })}</span><span className={styles.headingYear}>{value.slice(0, 4)}</span></>;
  const firstYear = Math.max(1900, Math.min(2189, year - 4));
  const choose = (day: string) => { onChange(day, mode); setOpen(false); };
  const changeMode = (next: DateScale) => { setMode(next); setFocused(value); };
  const move = (amount: number) => { setDirection(amount); setYear(current => Math.max(1900, Math.min(2200, current + amount * (mode === "year" ? 12 : 1)))); };
  return <Popover.Root open={open} onOpenChange={next => {
    if (next) {
      setYear(navigationYear(value, view)); setFocused(value);
      if (view !== previousView.current) setMode(view === "3-day" || view === "agenda" ? "day" : view);
      previousView.current = view;
    }
    setOpen(next);
  }}>
    <Popover.Trigger asChild><button type="button" className={styles.monthTrigger} aria-label="Choose date and view">
      <span className={styles.headingLabel}>{nativeMorph ? <span>{heading}</span> : <AnimatePresence initial={false} mode="popLayout"><motion.span key={view === "year" ? value.slice(0, 4) : value.slice(0, 7)} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -5 }} transition={{ duration: reduced ? 0 : .24, ease: [.22, 1, .36, 1] }}>{heading}</motion.span></AnimatePresence>}</span><UnigentamosIcon role="chevron-down" size={15} />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content className={`${styles.calendarPopover} ${styles.dateNavigator}`} style={moduleThemeVariables("calendar") as CSSProperties}
      data-reduced-motion={reduced} sideOffset={8} collisionPadding={12} align="start" aria-label="Navigate calendar">
      <div className={styles.navigatorScales} role="tablist" aria-label="Date navigation scale">
        {dateScales.map((scale, index) => <button type="button" role="tab" key={scale} aria-selected={mode === scale} aria-controls="calendar-date-choices" tabIndex={mode === scale ? 0 : -1}
          onClick={() => changeMode(scale)} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 3 : (index + (event.key === "ArrowRight" ? 1 : 3)) % 4;
            changeMode(dateScales[next]); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
          }}><UnigentamosIcon role={viewIcons[scale]} size={15} />{scale[0].toUpperCase() + scale.slice(1)}</button>)}
      </div>
      <header className={styles.pickerHeading}>
        <button type="button" className={styles.pickerArrow} disabled={year <= 1900} aria-label={mode === "year" ? "Previous years" : "Previous year"} onClick={() => move(-1)}><UnigentamosIcon role="chevron-right" size={18} style={{ transform: "rotate(180deg)" }} /></button>
        <strong aria-live="polite">{mode === "year" ? `${firstYear}–${firstYear + 11}` : year}</strong>
        <button type="button" className={styles.pickerArrow} disabled={year >= 2200} aria-label={mode === "year" ? "Next years" : "Next year"} onClick={() => move(1)}><UnigentamosIcon role="chevron-right" size={18} /></button>
      </header>
      <div ref={body} className={styles.navigatorBody} data-mode={mode} data-month-collection id="calendar-date-choices" role="tabpanel" aria-label={`${mode} choices`}>
        <CalendarScene id={`${mode}:${year}`} direction={direction}>
          {mode === "month" ? <div className={styles.monthChoices}>{Array.from({ length: 12 }, (_, i) => {
            const day = `${year}-${String(i + 1).padStart(2, "0")}-01`;
            return <button type="button" key={day} aria-pressed={value.slice(0, 7) === day.slice(0, 7)} onClick={() => choose(day)}>{label(day, { month: "long" })}</button>;
          })}</div> : mode === "year" ? <div className={styles.monthChoices}>{Array.from({ length: 12 }, (_, i) => firstYear + i).map(item => <button type="button" key={item} aria-pressed={String(item) === value.slice(0, 4)} onClick={() => choose(`${item}-01-01`)}>{item}</button>)}</div>
          : mode === "week" ? <div className={styles.weekChoices}>{weeksOfYear(year).map(week => <button type="button" key={week.start} aria-pressed={value >= week.start && value <= week.end} aria-label={`Week ${week.number}, ${label(week.start, { month: "long", day: "numeric" })} to ${label(week.end, { month: "long", day: "numeric" })}`} onClick={() => choose(week.start)}>
            <strong>W{week.number}</strong><small>{label(week.start, { month: "short", day: "numeric" })}</small>
          </button>)}</div> : <div className={styles.navigatorDayChoices}>
            <div className={styles.navigatorMonthStrip} aria-label="Choose a month">{Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`).map(month => <button type="button" key={month} aria-pressed={focused.slice(0, 7) === month.slice(0, 7)} onClick={() => setFocused(month)}>{label(month, { month: "short" })}</button>)}</div>
            <CalendarMiniMonth month={`${year}-${focused.slice(5, 7)}-01`} value={focused} today={today} onSelect={choose} onFocusDate={day => { pendingFocus.current = day; setFocused(day); setYear(Number(day.slice(0, 4))); }} />
          </div>}

        </CalendarScene>
      </div>
      <footer className={styles.pickerFooter}><button type="button" onClick={() => choose(today)}><UnigentamosIcon role="today" size={15} />Jump to today</button></footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
