"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { EventOccurrence } from "../../lib/modules/planning/types";

export default function CommandAgenda() {
  const [events, setEvents] = useState<EventOccurrence[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false),
    [zone, setZone] = useState("UTC");
  useEffect(() => {
    let active = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setZone(timeZone);
    void fetch(`/api/planning/agenda?zone=${encodeURIComponent(timeZone)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Calendar unavailable");
        return response.json() as Promise<{ events: EventOccurrence[] }>;
      })
      .then(({ events }) => {
        if (active) {
          setEvents(events);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section
      className="command-panel command-agenda"
      aria-label="Today's agenda"
    >
      <div className="command-section-title">
        <h2>Today</h2>
      </div>
      {error ? (
        <p>Calendar could not load. Open Calendar to retry.</p>
      ) : !loaded ? (
        <p role="status">Loading today’s events…</p>
      ) : events.length ? (
        <div className="command-agenda-list">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/admin/calendar?selected=${encodeURIComponent(event.eventId)}&occurrence=${encodeURIComponent(event.occurrenceKey)}&date=${new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(event.startMs)}`}
            >
              <time>
                {event.allDay
                  ? "All day"
                  : new Intl.DateTimeFormat(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: zone,
                    }).format(event.startMs)}
              </time>
              <div>
                <strong>{event.title}</strong>
                {event.location && <span>{event.location}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p>No events today.</p>
      )}
    </section>
  );
}
