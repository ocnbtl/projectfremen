"use client";

import * as Popover from "@radix-ui/react-popover";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { addDays, monthStart, shiftMonth, weekStart } from "../../lib/modules/planning/calendar-model";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { CalendarScene, useCalendarMotion } from "./CalendarMotion";
import styles from "./CalendarWorkspace.module.css";

const label = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00`).toLocaleDateString(undefined, options);
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function CalendarDatePicker({ value, today, onChange }: { value: string; today: string; onChange: (day: string) => void }) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState<"months" | "days">("months");
  const [page, setPage] = useState(value), [focused, setFocused] = useState(value), [direction, setDirection] = useState(1);
  const grid = useRef<HTMLDivElement>(null), pendingFocus = useRef(false);
  const { reduced } = useCalendarMotion();
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-picker-date="${focused}"]`)?.focus();
      pendingFocus.current = false;
    }
  }, [focused, page, mode]);
  const choose = (day: string) => { onChange(day); setOpen(false); };
  const move = (amount: number) => {
    const next = shiftMonth(page, amount * (mode === "months" ? 12 : 1));
    setDirection(amount); setPage(next); setFocused(next);
  };
  const year = page.slice(0, 4), start = weekStart(monthStart(page));
  return <Popover.Root open={open} onOpenChange={next => {
    if (next) { setPage(value); setFocused(value); setMode("months"); }
    setOpen(next);
  }}>
    <Popover.Trigger asChild><button type="button" className={styles.monthTrigger} aria-label="Choose month">
      <span>{label(value, { month: "long" })}<span className={styles.headingYear}>{value.slice(0, 4)}</span></span>
      <UnigentamosIcon role="chevron-down" size={16} />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content
      className={`${styles.calendarPopover} ${styles.datePopover}`}
      style={moduleThemeVariables("calendar") as CSSProperties}
      data-reduced-motion={reduced}
      sideOffset={8} collisionPadding={12} align="start" aria-label="Navigate calendar"
    >
      <header className={styles.pickerHeading}>
        <button type="button" className={styles.pickerArrow} aria-label={`Previous ${mode === "months" ? "year" : "month"}`} onClick={() => move(-1)}><UnigentamosIcon role="chevron-right" size={18} style={{ transform: "rotate(180deg)" }} /></button>
        <strong aria-live="polite">{mode === "months" ? year : label(page, { month: "long", year: "numeric" })}</strong>
        <button type="button" className={styles.pickerArrow} aria-label={`Next ${mode === "months" ? "year" : "month"}`} onClick={() => move(1)}><UnigentamosIcon role="chevron-right" size={18} /></button>
      </header>
      <CalendarScene id={mode === "months" ? `months-${year}` : `days-${page.slice(0, 7)}`} direction={direction}>
        {mode === "months" ? <div className={styles.monthChoices}>
          {Array.from({ length: 12 }, (_, i) => {
            const day = `${year}-${String(i + 1).padStart(2, "0")}-01`;
            return <button type="button" key={day} aria-pressed={value.slice(0, 7) === day.slice(0, 7)} onClick={() => choose(day)}>{label(day, { month: "long" })}</button>;
          })}
        </div> : <div className={styles.pickerDays}>
          <div className={styles.pickerWeekdays} aria-hidden="true">{weekdays.map(day => <span key={day}>{day.slice(0, 2)}</span>)}</div>
          <div role="grid" aria-label="Choose day" ref={grid}>
            {Array.from({ length: 6 }, (_, row) => <div role="row" key={row}>
              {Array.from({ length: 7 }, (_, column) => {
                const day = addDays(start, row * 7 + column);
                return <div role="gridcell" key={day} aria-selected={day === value}><button type="button"
                  data-picker-date={day} data-outside={day.slice(0, 7) !== page.slice(0, 7)}
                  aria-label={label(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  aria-current={day === today ? "date" : undefined} tabIndex={day === focused ? 0 : -1}
                  onClick={() => choose(day)} onKeyDown={event => {
                    const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -column, End: 6 - column } as Record<string, number>)[event.key];
                    if (offset === undefined && event.key !== "PageUp" && event.key !== "PageDown") return;
                    event.preventDefault();
                    const next = offset === undefined ? shiftMonth(day, event.key === "PageDown" ? 1 : -1) : addDays(day, offset);
                    setDirection(next > day ? 1 : -1); pendingFocus.current = true; setFocused(next); setPage(next);
                  }}
                >{Number(day.slice(-2))}</button></div>;
              })}
            </div>)}
          </div>
        </div>}
      </CalendarScene>
      <footer className={styles.pickerFooter}>
        <button type="button" onClick={() => {
          if (mode === "months") { pendingFocus.current = true; setFocused(page); }
          setMode(mode === "months" ? "days" : "months");
        }}><UnigentamosIcon role="interaction-date" size={16} />{mode === "months" ? "Jump to day" : "Choose month"}</button>
        <button type="button" onClick={() => choose(today)}>Today</button>
      </footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
