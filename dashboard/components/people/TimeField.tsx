"use client";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useRef, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";

const pad = (value: number) => String(value).padStart(2, "0");
const display = (value: string) => {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${pad(minute)} ${hour >= 12 ? "pm" : "am"}`;
};
function parse(raw: string) {
  if (!raw.trim()) return "";
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap](?:m)?)?$/i);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] || 0), period = match[3]?.toLowerCase();
  if (minute > 59 || hour > (period ? 12 : 23) || (period && hour < 1)) return null;
  if (period) hour = hour % 12 + (period.startsWith("p") ? 12 : 0);
  return `${pad(hour)}:${pad(minute)}`;
}

/** Repeating choices preserve native touch momentum, then commit the centered value. */
function TimeWheel({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) {
  const list = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callback = useRef(onChange); callback.current = onChange;
  const count = values.length, selected = Math.max(0, values.indexOf(value)), row = 40;
  useEffect(() => {
    if (list.current) list.current.scrollTop = (count * 2 + selected) * row;
    return () => clearTimeout(timer.current);
  }, [count, selected]);
  return <div className="people-loop-wheel" ref={list} role="group" aria-label={label} onScroll={event => {
    const element = event.currentTarget;
    if (element.scrollTop < count * row) element.scrollTop += count * 2 * row;
    else if (element.scrollTop >= count * 4 * row) element.scrollTop -= count * 2 * row;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = values[Math.round(element.scrollTop / row) % count];
      if (next !== value) callback.current(next);
    }, 140);
  }} onKeyDown={event => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (selected + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
    callback.current(values[next]);
    list.current?.querySelectorAll<HTMLButtonElement>('button[data-cycle="2"]')[next]?.focus({preventScroll:true});
  }}>
    {Array.from({length:5},(_,cycle) => values.map((number,index) => <button key={`${cycle}-${number}`} data-cycle={cycle} type="button" aria-hidden={cycle !== 2 || undefined} tabIndex={cycle === 2 && index === selected ? 0 : -1} aria-pressed={cycle === 2 ? index === selected : undefined} data-selected={index === selected} onClick={() => callback.current(number)}>{number}</button>))}
  </div>;
}

export default function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const [storedHour, minute] = (value || "09:00").split(":"), hour = String(Number(storedHour) % 12 || 12), period = Number(storedHour) >= 12 ? "PM" : "AM";
  function change(next: string) { input.current?.setCustomValidity(""); setDraft(null); onChange(next); }
  function commit(raw: string) {
    const next = parse(raw);
    input.current?.setCustomValidity(next === null ? "Enter a time such as 4:30 pm or 16:30." : "");
    if (next !== null) change(next);
  }
  function choose(column: string, next: string) {
    const h = Number(column === "Hour" ? next : hour) % 12 + ((column === "AM/PM" ? next : period) === "PM" ? 12 : 0);
    change(`${pad(h)}:${column === "Minute" ? next : minute}`);
  }
  return <div className="people-time-field people-time-inline">
    <label><span>{label} <small>(optional)</small></span><input ref={input} type="text" aria-label={label} value={draft ?? display(value)} placeholder="—" autoComplete="off" spellCheck={false} onFocus={e=>e.currentTarget.select()} onChange={e=>{setDraft(e.target.value);input.current?.setCustomValidity("");}} onBlur={e=>commit(e.target.value)} onKeyDown={e=>{if(e.key === "Enter"){e.preventDefault();commit(e.currentTarget.value);e.currentTarget.blur();}}}/></label>
    <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button ref={trigger} type="button" className="people-time-inline-trigger" aria-label={`Choose ${label.toLowerCase()}`} data-icon-button="compact"><UnigentamosIcon role="clock" size={18}/></button></Popover.Trigger>
      <Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}><Popover.Content className="app-select-menu people-time-wheel" sideOffset={6} collisionPadding={12} aria-label={`Choose ${label.toLowerCase()}`} onEscapeKeyDown={event=>event.stopImmediatePropagation()} onOpenAutoFocus={event=>event.preventDefault()}>
        <strong>{label}</strong><div className="people-time-wheel-columns">{[
          {label:"Hour",values:Array.from({length:12},(_,i)=>String(i+1)),current:hour},
          {label:"Minute",values:Array.from({length:60},(_,i)=>pad(i)),current:minute},
          {label:"AM/PM",values:["AM","PM"],current:period}
        ].map(column=><div key={column.label}><span>{column.label}</span><TimeWheel label={`${label} ${column.label.toLowerCase()}`} values={column.values} value={column.current} onChange={next=>choose(column.label,next)}/></div>)}</div>
        <footer><button type="button" onClick={()=>{change("");setOpen(false);}}>Clear</button><button type="button" onClick={()=>setOpen(false)}>Done</button></footer>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
