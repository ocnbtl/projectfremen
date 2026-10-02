"use client";
import * as Popover from "@radix-ui/react-popover";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import { dateScales, weeksOfYear, navigationYear, viewIcons, type CalendarView, type DateScale } from "../../lib/modules/planning/calendar-navigation";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import CalendarMiniMonth, { calendarDateLabel as label } from "./CalendarMiniMonth";
import { CalendarScene, useCalendarMotion } from "./CalendarMotion";
import styles from "./CalendarWorkspace.module.css";

export default function CalendarDatePicker({ value, today, view, onChange }: { value: string; today: string; view: CalendarView; onChange: (day: string, view: CalendarView) => void }) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState<DateScale>("month");
  const [year, setYear] = useState(Number(value.slice(0, 4))), [focused, setFocused] = useState(value), [direction, setDirection] = useState(1);
  const content = useRef<HTMLDivElement>(null), focusPending = useRef(false);
  const { reduced } = useCalendarMotion();
  const firstYear = Math.max(1900, Math.min(2189, year - 4));
  useLayoutEffect(() => {
    if (!open) return;
    const target = focusPending.current ? content.current?.querySelector<HTMLButtonElement>(`[data-mini-date="${focused}"]`) : content.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (target && content.current) {
      const viewport = content.current.getBoundingClientRect(), bounds = target.getBoundingClientRect();
      content.current.scrollTop += bounds.top - viewport.top - (content.current.clientHeight - bounds.height) / 2;
    }
    if (focusPending.current) { target?.focus({ preventScroll: true }); focusPending.current = false; }
  }, [mode, year, open, focused]);
  const choose = (day: string, next: CalendarView = mode) => { onChange(day, next); setOpen(false); };
  const changeMode = (next: DateScale) => { setMode(next); setFocused(value); };
  const move = (amount: number) => { setDirection(amount); setYear(current => Math.max(1900, Math.min(2200, current + amount * (mode === "year" ? 12 : 1)))); };
  return <Popover.Root open={open} onOpenChange={next => {
    if (next) { setYear(navigationYear(value, view)); setFocused(value); setMode(view === "agenda" ? "month" : view); }
    setOpen(next);
  }}>
    <Popover.Trigger asChild><button type="button" className={styles.monthTrigger} aria-label="Choose date and view">
      <span>{view === "year" ? value.slice(0, 4) : <>{label(value, { month: "long" })}<span className={styles.headingYear}>{value.slice(0, 4)}</span></>}</span><UnigentamosIcon role="chevron-down" size={15} />
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
      <div ref={content} className={styles.navigatorBody} data-mode={mode} data-month-collection id="calendar-date-choices" role="tabpanel" aria-label={`${mode} choices`}>
        <CalendarScene id={`${mode}:${year}`} direction={direction}>
          {mode === "month" ? <div className={styles.monthChoices}>{Array.from({ length: 12 }, (_, i) => {
            const day = `${year}-${String(i + 1).padStart(2, "0")}-01`;
            return <button type="button" key={day} aria-pressed={value.slice(0, 7) === day.slice(0, 7)} onClick={() => choose(day)}>{label(day, { month: "long" })}</button>;
          })}</div> : mode === "year" ? <div className={styles.monthChoices}>{Array.from({ length: 12 }, (_, i) => firstYear + i).map(item => <button type="button" key={item} aria-pressed={String(item) === value.slice(0, 4)} onClick={() => choose(`${item}-01-01`)}>{item}</button>)}</div>
          : mode === "week" ? <div className={styles.weekChoices}>{weeksOfYear(year).map(week => <button type="button" key={week.start} aria-pressed={value >= week.start && value <= week.end} onClick={() => choose(week.start)}>
            <span>Week <strong>{week.number}</strong></span><span>{label(week.start, { month: "short", day: "numeric" })}<small> — </small>{label(week.end, { month: "short", day: "numeric" })}</span><UnigentamosIcon role="chevron-right" size={14} />
          </button>)}</div> : <div className={styles.navigatorMonths}>{Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`).map(month => <CalendarMiniMonth key={month} month={month} value={focused} today={today} onSelect={day => choose(day)} onFocusDate={day => { focusPending.current = true; setFocused(day); setYear(Number(day.slice(0, 4))); }} />)}</div>}
        </CalendarScene>
      </div>
      <footer className={styles.pickerFooter}><span>{mode === "week" ? "Monday–Sunday · ISO weeks" : "Choose a date to open this view"}</span><button type="button" onClick={() => choose(today, view)}><UnigentamosIcon role="today" size={15} />Today</button></footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
