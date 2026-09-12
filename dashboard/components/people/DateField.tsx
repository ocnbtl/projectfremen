"use client";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";

function dateAt(year: number, month: number, day: number) {
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(year, month, day);
  return date;
}
const iso = (date: Date) => `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const display = (date: Date) => date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const parse = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number), date = dateAt(y, m - 1, d);
  return iso(date) === value ? date : null;
};

export default function DateField({ label, value, onChange, required = true, compact = false, theme }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; compact?: boolean; theme?: "finance";
}) {
  const [open, setOpen] = useState(false), [focusDate, setFocusDate] = useState(() => parse(value) || new Date());
  const [month, setMonth] = useState(() => parse(value) || new Date());
  const grid = useRef<HTMLTableElement>(null), pendingFocus = useRef(false), titleId = useId();
  const selected = parse(value), today = new Date(), year = month.getFullYear(), monthIndex = month.getMonth();
  const first = dateAt(year, monthIndex, 1), days = dateAt(year, monthIndex + 1, 0).getDate();
  useEffect(() => {
    if (pendingFocus.current) { grid.current?.querySelector<HTMLButtonElement>(`[data-date="${iso(focusDate)}"]`)?.focus(); pendingFocus.current = false; }
  }, [focusDate, month]);
  function choose(date: Date) { onChange(iso(date)); setOpen(false); }
  function moveMonth(offset: number) { const next = dateAt(year, monthIndex + offset, 1); if (next.getFullYear() > 0 && next.getFullYear() <= 9999) { setMonth(next); setFocusDate(next); } }
  return <div className="people-date-field"><span>{label}</span><Popover.Root open={open} onOpenChange={next => {
    if (next) { const initial = parse(value) || new Date(); setMonth(initial); setFocusDate(initial); } setOpen(next);
  }}>
    <Popover.Trigger asChild><button type="button" className="people-date-trigger" aria-label={label} aria-description={selected ? display(selected) : "No date selected"} title={selected ? display(selected) : label} data-value={value} aria-required={required}>
      {compact ? <><span className="people-date-display-wide">{selected ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "Set date"}</span><span className="people-date-display-narrow" aria-hidden="true">{selected ? selected.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }) : "Set date"}</span></> : <span>{selected ? display(selected) : "Choose a date"}</span>}
      <UnigentamosIcon role="interaction-date" size={18} />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="app-select-menu people-date-calendar" style={theme ? moduleThemeVariables(theme) as CSSProperties : undefined} sideOffset={6} collisionPadding={12} aria-labelledby={titleId}
      onEscapeKeyDown={event => event.stopImmediatePropagation()} onOpenAutoFocus={event => { event.preventDefault(); grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus(); }}>
      <h3 id={titleId} className="people-visually-hidden">Choose {label.toLowerCase()}</h3>
      <header><button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}><UnigentamosIcon role="chevron-right" size={18} /></button>
        <SelectField aria-label="Calendar month" value={String(monthIndex)} columns={3} onChange={event => { const next = dateAt(year, Number(event.target.value), 1); setMonth(next); setFocusDate(next); }}>{Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{dateAt(2000, m, 1).toLocaleDateString("en-US", { month: "long" })}</option>)}</SelectField>
        <input aria-label="Calendar year" type="number" min="1" max="9999" value={year} onChange={event => { const y = Number(event.target.value); if (y >= 1 && y <= 9999) { const next = dateAt(y, monthIndex, 1); setMonth(next); setFocusDate(next); } }} />
        <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}><UnigentamosIcon role="chevron-right" size={18} /></button></header>
      <p className="people-visually-hidden" aria-live="polite">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
      <table ref={grid} role="grid" aria-label={label === "Date" ? "Choose interaction date" : `Choose ${label.toLowerCase()}`}><thead><tr>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => <th key={day} scope="col" abbr={day}>{day.slice(0, 2)}</th>)}</tr></thead>
        <tbody>{Array.from({ length: Math.ceil((first.getDay() + days) / 7) }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, weekday) => {
          const day = week * 7 + weekday - first.getDay() + 1;
          if (day < 1 || day > days) return <td key={weekday} />;
          const date = dateAt(year, monthIndex, day), dateValue = iso(date);
          return <td key={weekday} aria-selected={value === dateValue}><button type="button" data-date={dateValue} aria-label={display(date)} aria-current={iso(today) === dateValue ? "date" : undefined} tabIndex={iso(focusDate) === dateValue ? 0 : -1}
            onClick={() => choose(date)} onKeyDown={event => {
              const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
              if (!delta && !["Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
              event.preventDefault(); const next = new Date(date);
              if (event.key === "PageUp" || event.key === "PageDown") { next.setDate(1); next.setMonth(next.getMonth() + (event.key === "PageDown" ? 1 : -1)); next.setDate(Math.min(day, dateAt(next.getFullYear(), next.getMonth() + 1, 0).getDate())); }
              else next.setDate(day + (event.key === "Home" ? -weekday : event.key === "End" ? 6 - weekday : delta));
              if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
              pendingFocus.current = true; setFocusDate(next); setMonth(next);
            }}>{day}</button></td>;
        })}</tr>)}</tbody></table>
      <footer><button type="button" onClick={() => choose(today)}>Today</button>{!required && <button type="button" onClick={() => { onChange(""); setOpen(false); }}>Clear date</button>}<button type="button" onClick={() => setOpen(false)}>Done</button></footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root></div>;
}
