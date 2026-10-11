"use client";
import { useId, useState, type KeyboardEvent } from "react";
import type { Calendar } from "../../lib/modules/planning/types";
import { WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import CalendarSharing from "./CalendarSharing";
import CalendarBookings from "./CalendarBookings";
import styles from "./CalendarSharePanel.module.css";

const sections = [
  { id: "subscriptions", label: "Subscriptions", detail: "Sync a calendar", icon: "link" },
  { id: "bookings", label: "Bookings", detail: "Let people book", icon: "calendar" },
] as const;

export default function CalendarSharePanel({ open, onClose, calendars }: { open: boolean; onClose: () => void; calendars: Calendar[] }) {
  const [section, setSection] = useState<(typeof sections)[number]["id"]>("subscriptions");
  const id = useId();
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % sections.length : event.key === "ArrowLeft" ? (index + sections.length - 1) % sections.length : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault(); setSection(sections[next].id);
    document.getElementById(`${id}-${sections[next].id}-tab`)?.focus();
  }
  return <WorkspaceSheet open={open} onClose={onClose} title="Share" titleIcon="share" presentation="center" focusInput={false} returnFocusSelector="[data-calendar-options-trigger]" className={styles.sheet}>
    <div className={styles.content}>
      <p className={styles.intro}>Keep another calendar in sync, or let people book a time with you.</p>
      <div className={styles.tabs} role="tablist" aria-label="Calendar sharing">
        {sections.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}-panel`} aria-selected={section === item.id} tabIndex={section === item.id ? 0 : -1} onClick={() => setSection(item.id)} onKeyDown={event => navigate(event, index)}>
          <UnigentamosIcon role={item.icon} size={20} /><span><strong>{item.label}</strong><small>{item.detail}</small></span>
        </button>)}
      </div>
      <div role="tabpanel" id={`${id}-subscriptions-panel`} aria-labelledby={`${id}-subscriptions-tab`} hidden={section !== "subscriptions"} className={styles.pane}><CalendarSharing calendars={calendars} /></div>
      <div role="tabpanel" id={`${id}-bookings-panel`} aria-labelledby={`${id}-bookings-tab`} hidden={section !== "bookings"} className={styles.pane}><CalendarBookings calendars={calendars} /></div>
    </div>
  </WorkspaceSheet>;
}
