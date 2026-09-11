"use client";
import * as Popover from "@radix-ui/react-popover";
import { useRef, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export default function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false), wheel = useRef<HTMLDivElement>(null);
  const [storedHour, minute] = (value || "12:00").split(":"), hour = String(Number(storedHour) % 12 || 12), period = Number(storedHour) >= 12 ? "PM" : "AM";
  const columns = [
    { label: "Hour", values: Array.from({ length: 12 }, (_, i) => String(i + 1)), current: hour },
    { label: "Minute", values: Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")), current: minute },
    { label: "AM/PM", values: ["AM", "PM"], current: period }
  ];
  function choose(column: string, next: string) {
    const h = Number(column === "Hour" ? next : hour) % 12 + ((column === "AM/PM" ? next : period) === "PM" ? 12 : 0);
    onChange(`${String(h).padStart(2, "0")}:${column === "Minute" ? next : minute}`);
  }
  return <div className="people-time-field"><span>{label}</span>
    <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className="people-time-trigger" aria-label={label} data-value={value}><span>{value ? `${hour}:${minute} ${period}` : "Choose time"}</span><span className="people-time-icon"><UnigentamosIcon role="clock" size={18} /></span></button></Popover.Trigger>
      <Popover.Portal><Popover.Content className="app-select-menu people-time-wheel" sideOffset={6} collisionPadding={12} aria-label={`${label} time`} onEscapeKeyDown={event => event.stopImmediatePropagation()} onOpenAutoFocus={event => {
        event.preventDefault(); wheel.current?.querySelectorAll<HTMLElement>('[aria-pressed="true"]').forEach(el => { el.parentElement!.scrollTop = el.offsetTop - (el.parentElement!.clientHeight - el.offsetHeight) / 2; });
        wheel.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      }}>
        <strong>{label} time</strong><div ref={wheel} className="people-time-wheel-columns">{columns.map(column => <div key={column.label}><span>{column.label}</span><div role="group" aria-label={`${label} ${column.label.toLowerCase()}`} onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll('button')), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
        }}>{column.values.map(number => <button key={number} type="button" tabIndex={number === column.current ? 0 : -1} aria-pressed={number === column.current} onClick={() => choose(column.label, number)}>{number}</button>)}</div></div>)}</div>
        <footer><button type="button" onClick={() => { onChange(""); setOpen(false); }}>Clear</button><button type="button" onClick={() => setOpen(false)}>Done</button></footer>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
