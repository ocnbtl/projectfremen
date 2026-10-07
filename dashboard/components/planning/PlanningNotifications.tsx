"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { ReminderReceipt } from "../../lib/modules/planning/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import * as Popover from "@radix-ui/react-popover";
import styles from "./PlanningNotifications.module.css";
type Reminder = {
  id: string;
  eventId: string;
  occurrenceKey: string;
  date: string;
  title: string;
  startMs: number;
  allDay: boolean;
  receipt?: ReminderReceipt;
};
/** In-app delivery surface. Native notification delivery can consume the same bounded endpoint. */
export default function PlanningNotifications() {
  const [items, setItems] = useState<Reminder[]>([]),
    [total, setTotal] = useState(0),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [loaded, setLoaded] = useState(false);
  const running = useRef(false),
    mounted = useRef(false);
  const poll = useCallback(async () => {
    if (running.current || document.visibilityState !== "visible") return;
    if (!navigator.onLine) {
      setError(
        "Reminders are unavailable offline. Reconnect to check for due reminders.",
      );
      return;
    }
    running.current = true;
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(
        `/api/planning/notifications?zone=${encodeURIComponent(zone)}`,
        { cache: "no-store" },
      );
      if (response.status === 401)
        throw new Error("Sign in again to check your reminders.");
      if (!response.ok)
        throw new Error(
          "Reminders could not refresh. Your saved reminders are unchanged.",
        );
      const data = await response.json();
      if (mounted.current) {
        setItems(data.reminders);
        setTotal(data.total);
        setLoaded(true);
        setError("");
      }
      // Only read inbound subscriptions. Failures stay on the connection for review in Calendar.
      for (const connectionId of data.refresh) {
        if (!mounted.current || !navigator.onLine) break;
        const result = await fetch("/api/planning", {
          method: "POST",
          headers: buildJsonHeadersWithCsrf(),
          body: JSON.stringify({
            operation: "refresh",
            connectionId,
            timeZone: zone,
          }),
        });
        if (result.ok)
          window.dispatchEvent(new Event("unigentamos-planning-changed"));
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      running.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void poll();
    const timer = setInterval(() => void poll(), 60000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("online", poll);
    window.addEventListener("offline", poll);
    window.addEventListener("unigentamos-planning-changed", poll);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("online", poll);
      window.removeEventListener("offline", poll);
      window.removeEventListener("unigentamos-planning-changed", poll);
    };
  }, [poll]);
  async function acknowledge(item: Reminder, state: "snoozed" | "dismissed") {
    setBusy(item.id);
    setError("");
    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({
          operation: "save",
          collection: "reminders",
          input: {
            id: item.receipt?.id,
            occurrenceId: item.id,
            state,
            until:
              state === "snoozed"
                ? new Date(Date.now() + 15 * 60000).toISOString()
                : undefined,
          },
          expectedUpdatedAt: item.receipt?.updatedAt,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Reminder could not be saved");
      setItems((current) => current.filter((x) => x.id !== item.id));
      setTotal((n) => Math.max(0, n - 1));
      window.dispatchEvent(new Event("unigentamos-planning-changed"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return <Popover.Root open={open} onOpenChange={next => {setOpen(next); if(next) void poll();}}>
    <Popover.Trigger asChild><button type="button" className="work-button work-button--quiet work-reminder-trigger" aria-label={`Reminders${total ? `, ${total} due` : ""}`}>
      <UnigentamosIcon role="reminder" size={20} />{total > 0 && <span aria-hidden="true">{total > 99 ? "99+" : total}</span>}
    </button></Popover.Trigger>
    <span className="sr-only" role="status">{total ? `${total} calendar reminders need attention` : ""}</span>
    <Popover.Portal><Popover.Content className={styles.panel} align="end" sideOffset={10} collisionPadding={12} aria-label="Reminders" onOpenAutoFocus={e => e.preventDefault()}>
      <header className={styles.header}><span><UnigentamosIcon role="reminder" size={20} /><strong>Reminders</strong>{total > 0 && <b>{total}</b>}</span><Popover.Close asChild><button type="button" aria-label="Close reminders"><UnigentamosIcon role="close" size={18} /></button></Popover.Close></header>
      {error && <div className={styles.error} role="alert"><p>{error}</p><WorkspaceButton onClick={() => void poll()}>Try again</WorkspaceButton></div>}
      {!loaded && !error && <div className={styles.empty} role="status"><UnigentamosIcon role="clock" size={28} /><strong>Checking reminders…</strong></div>}
      {loaded && !error && !items.length && <div className={styles.empty}><span><UnigentamosIcon role="check" size={24} /></span><strong>You’re all caught up</strong><p>Your event reminders will appear here.</p></div>}
      {items.length > 0 && <div className={styles.items}>{error && <p className={styles.note}>Showing the last successful check.</p>}{items.map(item => {
        const date=new Date(item.startMs), past=item.startMs < Date.now();
        return <article key={item.id} className={styles.item} data-busy={busy === item.id || undefined}>
          <Link className={styles.event} onClick={() => setOpen(false)} href={`/admin/calendar?selected=${encodeURIComponent(item.eventId)}&occurrence=${encodeURIComponent(item.occurrenceKey)}&date=${encodeURIComponent(item.date)}`}>
            <span className={styles.date}><small>{date.toLocaleDateString("en-US",{month:"short"})}</small><b>{date.getDate()}</b></span>
            <span className={styles.copy}><strong>{item.title}</strong><time dateTime={date.toISOString()}><UnigentamosIcon role="clock" size={13} />{item.allDay ? "All day" : date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true}).toLowerCase().replace(/\s/g,"")}{past && <span className={styles.missed}>Earlier</span>}</time></span>
            <UnigentamosIcon role="chevron-right" size={15} />
          </Link>
          <div className={styles.actions}><button type="button" disabled={Boolean(busy)} onClick={() => void acknowledge(item,"snoozed")} aria-label={`Snooze ${item.title} for 15 minutes`}><UnigentamosIcon role="clock" size={15} />15 min</button><button type="button" disabled={Boolean(busy)} onClick={() => void acknowledge(item,"dismissed")} aria-label={`Dismiss ${item.title}`}><UnigentamosIcon role="check" size={15} />Dismiss</button></div>
        </article>;
      })}{total > items.length && <p className={styles.note}>{items.length} of {total} reminders. More appear as you clear these.</p>}</div>}
      <footer className={styles.footer}><Link href="/admin/calendar" onClick={() => setOpen(false)}><UnigentamosIcon role="calendar" size={16} />Open calendar<UnigentamosIcon role="chevron-right" size={14} /></Link></footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
