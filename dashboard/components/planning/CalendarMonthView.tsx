"use client";
import TaskEventCard from "./TaskEventCard";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Calendar, EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { monthLaneCapacity, monthWeekLayout } from "../../lib/modules/planning/month-layout";
import { eventGroup } from "../../lib/modules/planning/calendar-groups";
import { eventColors, eventPreviewTitle, eventTimeRange } from "./calendar-presentation";
import { calendarDateLabel as label } from "./CalendarMiniMonth";
import { useCalendarMotion } from "./CalendarMotion";
import EventLinksPreview from "./EventLinksPreview";
import EventDetail from "./EventDetail";
import { eventObjectRefs } from "./EventObjects";
import EventGlyph from "./EventGlyph";
import EventContinuation from "./EventContinuation";
import styles from "./CalendarMonthView.module.css";

export default function CalendarMonthView({ days, date, today, events, calendars, refs, zone, showWeekends, onDay, onMore, onOpen, onComplete }: {
  days: string[]; date: string; today: string; events: EventOccurrence[]; calendars: Calendar[]; refs: NativeObjectRef[];
  zone: string; showWeekends: boolean; onDay: (day: string) => void; onMore: (day: string) => void; onOpen: (event: EventOccurrence) => void; onComplete: (event: EventOccurrence) => void;
}) {
  const { layoutTransition } = useCalendarMotion(), columns = showWeekends ? 7 : 5;
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const rowHeight = size.height / (days.length / columns), eventHeight = rowHeight < 150 ? 34 : 36;
  // Only simplify a continuation when an earlier, visible segment carries its details.
  const detailedEvents = new Set<string>();
  return <div ref={container} className={styles.month} aria-label="Month calendar">
    {Array.from({ length: days.length / columns }, (_, row) => {
      const week = days.slice(row * columns, (row + 1) * columns);
      const needed = Math.max(0, ...monthWeekLayout(week, events, zone, Infinity).segments.map(item => item.lane + 1));
      const capacity = monthLaneCapacity(rowHeight, needed, eventHeight);
      const { segments, hidden } = monthWeekLayout(week, events, zone, capacity);
      return <div key={week[0]} className={styles.week} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `28px ${capacity ? `repeat(${capacity}, ${eventHeight}px)` : ""} minmax(0, 1fr)` }} data-month-week={week[0]}>
        {week.map((day, column) => <div key={day} className={styles.day} data-today={day === today} data-outside={day.slice(0, 7) !== date.slice(0, 7)} style={{ gridColumn: column + 1, gridRow: "1 / -1" }}>
          <button type="button" className={styles.date} aria-label={label(day, { weekday: "long", month: "long", day: "numeric" })} onClick={() => onDay(day)}>
            <small>{label(day, { weekday: "long" })}</small><span data-morph-date={day}>{Number(day.slice(-2))}</span>
          </button>
        </div>)}
        {segments.map(segment => {
          const { event, first, last, lane, continuesBefore, continuesAfter } = segment;
          const calendar = calendars.find(item => item.id === event.calendarId), group = eventGroup(calendar, event.groupId);
          const continuation = `${continuesBefore ? ", continues from earlier dates" : ""}${continuesAfter ? ", continues on later dates" : ""}`;
          const timing = event.allDay ? "" : eventTimeRange(event.startMs, event.endMs, zone);
          const place = eventObjectRefs(event,refs).find(ref => ref.module === "map")?.label;
          const span = last - first + 1;
          const compactContinuation = continuesBefore && detailedEvents.has(event.id) && (span === 1 || size.width / columns * span < 300);
          if (!compactContinuation) detailedEvents.add(event.id);
          return <TaskEventCard event={event} onComplete={onComplete} key={`${event.id}:${first}`} layout transition={{ layout: layoutTransition }} className={styles.event}
            style={{ ...eventColors(event, calendar), gridColumn: `${first + 1} / ${last + 2}`, gridRow: lane + 2 } as CSSProperties}
            data-morph-event={event.id} data-month-event={event.id} data-compact-continuation={compactContinuation || undefined} data-continues-before={continuesBefore || undefined} data-continues-after={continuesAfter || undefined}
            aria-label={`${event.title}${timing ? `, ${timing}` : ""}${continuation}`} title={`${event.title}${timing ? ` · ${timing}` : ""}${continuation}`} onClick={() => onOpen(event)}>
            {(continuesBefore || continuesAfter) && <EventContinuation before={continuesBefore} after={continuesAfter} />}
            <EventGlyph event={event} icon={group?.icon} size={16} />
            <span className={styles.copy}><strong>{eventPreviewTitle(event)}</strong>{timing && !compactContinuation && <small>{timing}</small>}</span>
            {!compactContinuation && <EventLinksPreview event={event} available={refs} />}
            {!compactContinuation && place && <EventDetail kind="place" text={place} eventTitle={event.title}/>}

          </TaskEventCard>;
        })}
        {hidden.map((count, column) => count > 0 && <button type="button" key={week[column]} className={styles.more} style={{ gridColumn: column + 1, gridRow: capacity + 2 }} onClick={() => onMore(week[column])} aria-label={`${count} more events on ${label(week[column], { month: "long", day: "numeric" })}`}>+{count} more</button>)}
      </div>;
    })}
  </div>;
}
