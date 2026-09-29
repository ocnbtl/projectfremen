"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { ReminderReceipt } from "../../lib/modules/planning/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
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
  return (
    <>
      <button
        type="button"
        className="work-button work-button--quiet work-reminder-trigger"
        onClick={() => {
          setOpen(true);
          void poll();
        }}
        aria-label={`Reminders${total ? `, ${total} due` : ""}`}
      >
        <UnigentamosIcon role="reminder" size={20} />
        {total > 0 && (
          <span aria-hidden="true">{total > 99 ? "99+" : total}</span>
        )}
      </button>
      <span className="sr-only" role="status">
        {total ? `${total} calendar reminders need attention` : ""}
      </span>
      <WorkspaceSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Reminders"
      >
        {error && (
          <div role="alert">
            <p>{error}</p>
            <WorkspaceButton onClick={() => void poll()}>
              Try again
            </WorkspaceButton>
          </div>
        )}
        {!loaded && !error && <p role="status">Checking reminders…</p>}
        {loaded && !error && !items.length && (
          <p>No reminders due. Set a reminder when editing a Calendar event.</p>
        )}
        {items.length > 0 && (
          <>
            <p className="work-muted">
              Upcoming and missed reminders from the past 30 days.
            </p>
            {total > items.length && (
              <p className="work-muted">
                Showing the most recent {items.length} of {total} reminders.
                Older reminders appear as you dismiss or snooze these.
              </p>
            )}
            {error && (
              <p className="work-muted">
                These reminders are from the last successful check.
              </p>
            )}
            {items.map((item) => (
              <div className="work-reminder-row" key={item.id}>
                <Link
                  onClick={() => setOpen(false)}
                  href={`/admin/calendar?selected=${encodeURIComponent(item.eventId)}&occurrence=${encodeURIComponent(item.occurrenceKey)}&date=${encodeURIComponent(item.date)}`}
                >
                  <strong>{item.title}</strong>
                  <time>
                    {new Date(item.startMs).toLocaleString(
                      undefined,
                      item.allDay
                        ? { month: "short", day: "numeric" }
                        : {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          },
                    )}
                  </time>
                </Link>
                <div>
                  <WorkspaceButton
                    disabled={Boolean(busy)}
                    onClick={() => void acknowledge(item, "snoozed")}
                  >
                    Snooze 15 min
                  </WorkspaceButton>
                  <WorkspaceButton
                    disabled={Boolean(busy)}
                    onClick={() => void acknowledge(item, "dismissed")}
                  >
                    Dismiss
                  </WorkspaceButton>
                </div>
              </div>
            ))}
          </>
        )}
        <Link href="/admin/calendar" onClick={() => setOpen(false)}>
          Open Calendar
        </Link>
      </WorkspaceSheet>
    </>
  );
}
