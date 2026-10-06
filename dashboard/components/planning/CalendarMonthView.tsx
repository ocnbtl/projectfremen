"use client";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import type { Calendar, EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { monthWeekLayout } from "../../lib/modules/planning/month-layout";
import { eventGroup } from "../../lib/modules/planning/calendar-groups";
import { eventColors, eventPreviewTitle, eventTimeRange } from "./calendar-presentation";
import { calendarDateLabel as label } from "./CalendarMiniMonth";
import { useCalendarMotion } from "./CalendarMotion";
import EventPeople from "./EventPeople";
import EventGlyph from "./EventGlyph";
import EventObjects from "./EventObjects";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./CalendarMonthView.module.css";

export default function CalendarMonthView({ days, date, today, events, calendars, refs, zone, showWeekends, onDay, onMore, onOpen }: {
  days: string[]; date: string; today: string; events: EventOccurrence[]; calendars: Calendar[]; refs: NativeObjectRef[];
  zone: string; showWeekends: boolean; onDay: (day: string) => void; onMore: (day: string) => void; onOpen: (event: EventOccurrence) => void;
}) {
  const { layoutTransition } = useCalendarMotion(), columns = showWeekends ? 7 : 5;
  return <div className={styles.month} aria-label="Month calendar">
    {Array.from({ length: days.length / columns }, (_, row) => {
      const week = days.slice(row * columns, (row + 1) * columns), { segments, hidden } = monthWeekLayout(week, events, zone);
      return <div key={week[0]} className={styles.week} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} data-month-week={week[0]}>
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
          return <motion.button key={`${event.id}:${first}`} layout transition={{ layout: layoutTransition }} type="button" className={styles.event}
            style={{ ...eventColors(event, calendar), gridColumn: `${first + 1} / ${last + 2}`, gridRow: lane + 2 } as CSSProperties}
            data-morph-event={event.id} data-month-event={event.id} data-continues-before={continuesBefore || undefined} data-continues-after={continuesAfter || undefined}
            aria-label={`${event.title}${timing ? `, ${timing}` : ""}${continuation}`} title={`${event.title}${timing ? ` · ${timing}` : ""}${continuation}`} onClick={() => onOpen(event)}>
            {continuesBefore && <UnigentamosIcon role="chevron-right" size={12} style={{ transform: "rotate(180deg)" }} />}
            <EventGlyph event={event} icon={group?.icon} size={16} />
            <span className={styles.copy}><strong>{eventPreviewTitle(event)}</strong>{timing && <small>{timing}</small>}</span>
            <EventPeople refs={event.linkedRefs} available={refs} limit={2} /><EventObjects event={event} available={refs} />
            {continuesAfter && <UnigentamosIcon role="chevron-right" size={12} />}
          </motion.button>;
        })}
        {hidden.map((count, column) => count > 0 && <button type="button" key={week[column]} className={styles.more} style={{ gridColumn: column + 1, gridRow: 4 }} onClick={() => onMore(week[column])} aria-label={`${count} more events on ${label(week[column], { month: "long", day: "numeric" })}`}>+{count} more</button>)}
      </div>;
    })}
  </div>;
}
