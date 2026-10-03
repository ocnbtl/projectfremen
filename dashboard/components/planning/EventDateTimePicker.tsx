"use client";

import * as Popover from "@radix-ui/react-popover";
import { LayoutGroup, motion } from "motion/react";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import { addDays, localDate, monthStart, shiftMonth, weekStart } from "../../lib/modules/planning/calendar-model";
import { calendarWeekdays as weekdays } from "../../lib/calendar-week";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { CalendarScene, useCalendarMotion } from "./CalendarMotion";
import styles from "./EventDateTimePicker.module.css";

const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00`).toLocaleDateString("en-US", options);
const pad = (number: number) => String(number).padStart(2, "0");

/** Values stay in the event's wall-clock time; the repository owns zone conversion. */
export default function EventDateTimePicker({ label, value, allDay, timeZone, onChange }: {
  label: string;
  value: string;
  allDay: boolean;
  timeZone: string;
  onChange: (value: string) => void;
}) {
  const day = value.slice(0, 10), time = value.slice(11, 16) || "09:00";
  const hour = Number(time.slice(0, 2)), minute = Number(time.slice(3, 5));
  const period = hour >= 12 ? "PM" : "AM", clockHour = hour % 12 || 12;
  const [open, setOpen] = useState(false), [mode, setMode] = useState<"days" | "months">("days");
  const [pane, setPane] = useState<"date" | "time">("date");
  const [page, setPage] = useState(day), [focused, setFocused] = useState(day), [direction, setDirection] = useState(1);
  const trigger = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null), timeControls = useRef<HTMLDivElement>(null), pendingFocus = useRef(false);
  const id = useId(), { reduced, layoutTransition } = useCalendarMotion();
  let today = day;
  try { today = localDate(new Date(), timeZone); } catch { /* Keep the picker usable while a zone is being edited. */ }
  const first = weekStart(monthStart(page)), year = page.slice(0, 4);
  // Imported minute precision is retained until the user explicitly changes it.
  const minutes = Array.from(new Set([...Array.from({ length: 12 }, (_, i) => i * 5), minute])).sort((a, b) => a - b);
  const columns = [
    { name: "Hour", values: Array.from({ length: 12 }, (_, i) => String(i + 1)), current: String(clockHour) },
    { name: "Minute", values: minutes.map(pad), current: pad(minute) },
    { name: "Period", values: ["AM", "PM"], current: period },
  ];

  useLayoutEffect(() => {
    if (pendingFocus.current) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus({ preventScroll: true });
      pendingFocus.current = false;
    }
  }, [focused, page, mode]);

  useLayoutEffect(() => {
    if (pane !== "time") return;
    timeControls.current?.querySelectorAll<HTMLButtonElement>('[aria-pressed="true"]').forEach(button => {
      const list = button.parentElement!;
      list.scrollTop = button.offsetTop - (list.clientHeight - button.offsetHeight) / 2;
    });
  }, [pane]);

  function chooseDay(next: string) {
    onChange(allDay ? next : `${next}T${time}`);
    setDirection(next > day ? 1 : -1); setPage(next); setFocused(next);
  }
  function move(amount: number) {
    const next = shiftMonth(page, amount * (mode === "months" ? 12 : 1));
    if (next.length !== 10 || next < "0001-01-01" || next > "9999-12-31") return;
    setDirection(amount); setPage(next); setFocused(next);
  }
  function chooseTime(column: string, next: string) {
    const nextHour = Number(column === "Hour" ? next : clockHour) % 12 + ((column === "Period" ? next : period) === "PM" ? 12 : 0);
    onChange(`${day}T${pad(nextHour)}:${column === "Minute" ? next : pad(minute)}`);
  }

  return <div className={styles.field}>
    <span className={styles.label}>{label}</span>
    <Popover.Root open={open} onOpenChange={next => {
      if (next) { setPage(day); setFocused(day); setMode("days"); setPane("date"); }
      setOpen(next);
    }}>
      <Popover.Trigger asChild><button ref={trigger} type="button" className={styles.trigger} aria-label={label}
        aria-description={`${dateLabel(day, { dateStyle: "full" })}${allDay ? ", all day" : `, ${clockHour}:${pad(minute)} ${period}, ${timeZone}`}`}
        data-value={value}>
        <UnigentamosIcon role="interaction-date" size={18} />
        <span className={styles.value}><span>{dateLabel(day, { month: "short", day: "numeric", year: "numeric" })}</span>
          <small>{allDay ? "All day" : `${clockHour}:${pad(minute)} ${period}`}</small></span>
        <UnigentamosIcon role="chevron-down" size={14} />
      </button></Popover.Trigger>
      <Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}><Popover.Content className={styles.popover} style={moduleThemeVariables("calendar") as CSSProperties}
        data-reduced-motion={reduced} sideOffset={8} collisionPadding={12} align="start" aria-label={`${label} date${allDay ? "" : " and time"}`}
        onEscapeKeyDown={event => event.stopImmediatePropagation()}
        onOpenAutoFocus={event => {
          event.preventDefault();
          grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus({ preventScroll: true });
        }}>
        <LayoutGroup id={id}>
          {!allDay && <div className={styles.tabs} role="tablist" aria-label={`${label} date or time`}>
            {(["date", "time"] as const).map(tab => <button type="button" role="tab" key={tab} id={`${id}-${tab}-tab`}
              aria-label={tab === "date" ? "Date" : "Time"} aria-selected={pane === tab} aria-controls={`${id}-${tab}-panel`} tabIndex={pane === tab ? 0 : -1}
              onClick={() => setPane(tab)} onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "date" : event.key === "End" ? "time" : pane === "date" ? "time" : "date";
                setPane(next); document.getElementById(`${id}-${next}-tab`)?.focus();
              }}>
              {pane === tab && <motion.span className={styles.tabSelection} layoutId="active-pane" transition={layoutTransition} />}
              <span><UnigentamosIcon role={tab === "date" ? "interaction-date" : "clock"} size={15} />
                {tab === "date" ? dateLabel(day, { month: "short", day: "numeric" }) : `${clockHour}:${pad(minute)} ${period}`}</span>
            </button>)}
          </div>}
          <div className={styles.pane}>
          <CalendarScene id={pane} direction={pane === "date" ? -1 : 1}>
          {pane === "date" ? <div className={styles.datePanel} role={allDay ? undefined : "tabpanel"} id={`${id}-date-panel`} aria-labelledby={allDay ? undefined : `${id}-date-tab`}>
          <header className={styles.heading}>
            <button type="button" className={styles.arrow} aria-label={`Previous ${mode === "days" ? "month" : "year"}`} onClick={() => move(-1)}><UnigentamosIcon role="chevron-right" size={18} style={{ transform: "rotate(180deg)" }} /></button>
            <button type="button" className={styles.month} aria-label={mode === "days" ? "Choose month" : "Choose day"} onClick={() => setMode(mode === "days" ? "months" : "days")}>
              <span aria-live="polite">{mode === "days" ? dateLabel(page, { month: "long", year: "numeric" }) : year}</span>
              <UnigentamosIcon role="chevron-down" size={14} style={{ transform: mode === "months" ? "rotate(180deg)" : undefined }} />
            </button>
            <button type="button" className={styles.arrow} aria-label={`Next ${mode === "days" ? "month" : "year"}`} onClick={() => move(1)}><UnigentamosIcon role="chevron-right" size={18} /></button>
          </header>
          <div className={styles.dateArea}>
            <CalendarScene id={`${mode}-${page.slice(0, mode === "days" ? 7 : 4)}`} direction={direction}>
              {mode === "months" ? <div className={styles.months}>
                {Array.from({ length: 12 }, (_, index) => {
                  const month = `${year}-${pad(index + 1)}-01`;
                  return <button type="button" key={month} aria-pressed={month.slice(0, 7) === day.slice(0, 7)} onClick={() => {
                    setDirection(month > page ? 1 : -1); setPage(month); setFocused(month); pendingFocus.current = true; setMode("days");
                  }}>{dateLabel(month, { month: "short" })}</button>;
                })}
              </div> : <div ref={grid} role="grid" aria-label={`${label} calendar`} className={styles.days}>
                <div role="row" className={styles.weekdays}>{weekdays.map(weekday => <span role="columnheader" aria-label={weekday} key={weekday}>{weekday.slice(0, 2)}</span>)}</div>
                {Array.from({ length: 6 }, (_, row) => <div role="row" key={row}>
                  {Array.from({ length: 7 }, (_, column) => {
                    const date = addDays(first, row * 7 + column), selected = date === day;
                    return <div role="gridcell" key={date} aria-selected={selected}><button type="button" data-date={date}
                      data-outside={date.slice(0, 7) !== page.slice(0, 7)} aria-label={dateLabel(date, { dateStyle: "full" })}
                      aria-current={date === today ? "date" : undefined} tabIndex={date === focused ? 0 : -1}
                      onClick={() => chooseDay(date)} onKeyDown={event => {
                        const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -column, End: 6 - column } as Record<string, number>)[event.key];
                        if (offset === undefined && event.key !== "PageUp" && event.key !== "PageDown") return;
                        event.preventDefault();
                        const next = offset === undefined ? shiftMonth(date, (event.key === "PageDown" ? 1 : -1) * (event.shiftKey ? 12 : 1)) : addDays(date, offset);
                        if (next.length !== 10 || next < "0001-01-01" || next > "9999-12-31") return;
                        setDirection(next > date ? 1 : -1); pendingFocus.current = true; setPage(next); setFocused(next);
                      }}>
                      {selected && <motion.span className={styles.selection} layoutId="selected-day" transition={layoutTransition} />}
                      <span className={styles.dayNumber}>{Number(date.slice(-2))}</span>
                    </button></div>;
                  })}
                </div>)}
              </div>}
            </CalendarScene>
          </div>
          </div> : <section className={styles.timeArea} role="tabpanel" id={`${id}-time-panel`} aria-labelledby={`${id}-time-tab`}>
            <div className={styles.timeHeading}><span><UnigentamosIcon role="clock" size={15} />Time</span><small title={timeZone}>{timeZone.split("/").at(-1)?.replaceAll("_", " ")}</small></div>
            <div ref={timeControls} className={styles.timeColumns}>{columns.map(column => <div key={column.name}>
              <span className={styles.columnLabel}>{column.name === "Period" ? "AM / PM" : column.name}</span>
              <motion.div layoutScroll className={styles.timeOptions} role="group" aria-label={`${label} ${column.name.toLowerCase()}`} onKeyDown={event => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const buttons = Array.from(event.currentTarget.querySelectorAll("button")), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus({ preventScroll: true });
                (document.activeElement as HTMLElement)?.scrollIntoView({ block: "nearest", behavior: reduced ? "instant" : "smooth" });
              }}>{column.values.map(number => <button type="button" key={number} aria-pressed={number === column.current}
                tabIndex={number === column.current ? 0 : -1} onClick={() => chooseTime(column.name, number)}>
                {number === column.current && <motion.span className={styles.timeSelection} layoutId={`selected-${column.name}`} transition={layoutTransition} />}
                <span>{number}</span>
              </button>)}</motion.div>
            </div>)}</div>
          </section>}
          </CalendarScene>
          </div>
          <footer className={styles.footer}>
            <button type="button" onClick={() => { chooseDay(today); setMode("days"); setPane("date"); }}>Today</button>
            <button type="button" className={styles.done} onClick={() => setOpen(false)}>Done<UnigentamosIcon role="check" size={16} /></button>
          </footer>
        </LayoutGroup>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
