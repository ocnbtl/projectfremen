"use client";
import { motion } from "motion/react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Calendar, EventOccurrence } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { addDays } from "../../lib/modules/planning/calendar-model";
import { monthWeekLayout } from "../../lib/modules/planning/month-layout";
import { eventGroup } from "../../lib/modules/planning/calendar-groups";
import { eventColors, eventPreviewTitle } from "./calendar-presentation";
import { useCalendarMotion } from "./CalendarMotion";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import EventPeople from "./EventPeople";
import EventGlyph from "./EventGlyph";
import EventObjects from "./EventObjects";
import styles from "./CalendarWorkspace.module.css";

export default function CalendarAllDayBand({ days, events, calendars, refs, dated, zone, columns, today, onOpen }: {
  days: string[]; events: EventOccurrence[]; calendars: Calendar[]; refs: PlanningSnapshot["refs"]; dated: PlanningSnapshot["dated"];
  zone: string; columns: string; today: string; onOpen: (event: EventOccurrence) => void;
}) {
  const { layoutTransition } = useCalendarMotion();
  const { segments } = monthWeekLayout(days, events.filter(e => e.allDay), zone, Infinity);
  const lanes = Math.max(0, ...segments.map(s => s.lane + 1));
  const links = dated.flatMap(item => { const covered = days.flatMap((day, i) => item.start <= day && day < item.end ? [i] : []); return covered.length ? [{ item, first: covered[0], last: covered.at(-1)! }] : []; });
  if (!segments.length && !links.length) return <div className={styles.allDayBand} aria-hidden="true" />;
  return <motion.div layout transition={{ layout: layoutTransition }} className={styles.allDayBand} style={{ gridTemplateColumns: columns }} role="group" aria-label="All-day and linked events">
    {days.map((day, index) => <motion.span key={day} layout transition={{ layout: layoutTransition }} aria-hidden="true"
      className={styles.allDayColumn} data-today={day === today} data-all-day-column={day}
      style={{ gridColumn: index + 2, gridRow: `1 / ${lanes + links.length + 2}` }} />)}
    <span aria-hidden="true" className={styles.allDaySpacer} style={{gridColumn:"1 / -1",gridRow:lanes + links.length + 1}} />
    {segments.map(({ event, first, last, lane, continuesBefore, continuesAfter }) => {
      const calendar = calendars.find(c => c.id === event.calendarId), group = eventGroup(calendar, event.groupId);
      const title = `${event.title}${continuesBefore ? " · Continues from earlier dates" : ""}${continuesAfter ? " · Continues on later dates" : ""}`;
      return <motion.button layout transition={{ layout: layoutTransition }} key={event.id} type="button" className={styles.allDayItem}
        style={{ ...eventColors(event, calendar), gridColumn: `${first + 2} / ${last + 3}`, gridRow: lane + 1 } as CSSProperties}
        data-morph-event={event.id} data-span-event={event.id} data-continues-before={continuesBefore || undefined} data-continues-after={continuesAfter || undefined}
        aria-label={title} title={title} onClick={() => onOpen(event)}>
        {continuesBefore && <UnigentamosIcon role="chevron-right" size={12} style={{ transform: "rotate(180deg)" }} />}
        <EventGlyph event={event} icon={group?.icon} />
        <span className={styles.eventTitle}>{eventPreviewTitle(event)}</span><EventPeople refs={event.linkedRefs} available={refs} /><EventObjects event={event} available={refs} />
        {continuesAfter && <UnigentamosIcon role="chevron-right" size={12} />}
      </motion.button>;
    })}
    {links.map(({ item, first, last }, i) => <Link key={item.id} className={styles.allDayItem} style={{ gridColumn: `${first + 2} / ${last + 3}`, gridRow: lanes + i + 1, "--event-color": "var(--module-secondary-500)" } as CSSProperties} href={item.ownerRef?.route || "/admin/personal"}>
      {item.start < days[first] && <UnigentamosIcon role="chevron-right" size={12} style={{ transform: "rotate(180deg)" }} />}
      <UnigentamosIcon role={item.completed ? "check" : "link"} size={13} /><span className={styles.eventTitle}>{item.title}</span>
      {item.end > addDays(days[last], 1) && <UnigentamosIcon role="chevron-right" size={12} />}
    </Link>)}
  </motion.div>;
}
