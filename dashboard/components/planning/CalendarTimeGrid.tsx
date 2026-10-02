"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useCalendarMotion } from "./CalendarMotion";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type {
  Calendar,
  EventOccurrence,
} from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import {
  addDays,
  calendarLayout,
  instantFor,
  localDate,
  localFor,
} from "../../lib/modules/planning/calendar-model";
import { eventGroup } from "../../lib/modules/planning/calendar-groups";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import EventPeople from "./EventPeople";
import styles from "./CalendarWorkspace.module.css";

const minuteOf = (ms: number, zone: string) => {
  const s = localFor(ms, zone);
  return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
};
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
export default function CalendarTimeGrid({
  days,
  zone,
  now,
  events,
  calendars,
  refs,
  dated,
  widenToday,
  early,
  late,
  setEarly,
  setLate,
  onCreate,
  onOpen,
  onDay,
  onMove,
  onResize,
}: {
  days: string[];
  zone: string;
  now: number;
  events: EventOccurrence[];
  calendars: Calendar[];
  refs: PlanningSnapshot["refs"];
  dated: PlanningSnapshot["dated"];
  widenToday: boolean;
  early: boolean;
  late: boolean;
  setEarly: (value: boolean) => void;
  setLate: (value: boolean) => void;
  onCreate: (day: string, hour?: number, duration?: number) => void;
  onOpen: (event: EventOccurrence) => void;
  onDay: (day: string) => void;
  onMove: (event: EventOccurrence, day: string, hour: number) => void;
  onResize: (event: EventOccurrence, endMs: number) => void;
}) {
  const { reduced, layoutTransition } = useCalendarMotion();
  const [height, setHeight] = useState(400),
    hours = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ day: "", minute: 540 });
  const [selection, setSelection] = useState<{
    day: string;
    start: number;
    end: number;
  }>();
  const origin = useRef<{ day: string; minute: number } | undefined>(undefined);
  const resize = useRef<
    { item: EventOccurrence; y: number; end: number } | undefined
  >(undefined);
  const [resizing, setResizing] = useState<{ id: string; end: number }>();
  const startHour = early ? 0 : 8,
    endHour = late ? 24 : 22,
    minutes = (endHour - startHour) * 60;
  const today = localDate(new Date(now), zone);
  useLayoutEffect(() => {
    const element = hours.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);
  // The header grows with visible all-day cards; measure the remaining time area.
  const px = Math.max(1, height) / minutes;
  const position = (m: number) => (m - startHour * 60) * px;
  const atPointer = (
    e: PointerEvent<HTMLElement> | React.DragEvent<HTMLElement>,
  ) =>
    Math.max(
      startHour * 60,
      Math.min(
        endHour * 60 - 5,
        startHour * 60 +
          Math.floor(
            (e.clientY - e.currentTarget.getBoundingClientRect().top) / px / 5,
          ) *
            5,
      ),
    );
  const inDays = (event: EventOccurrence) =>
    days.some(
      (day) =>
        event.startMs < instantFor(addDays(day, 1), zone) &&
        event.endMs > instantFor(day, zone),
    );
  const earlyEvents = events.filter(
    (e) =>
      !e.allDay &&
      inDays(e) &&
      (minuteOf(e.startMs, zone) < 480 ||
        localFor(e.startMs, zone).slice(0, 10) !==
          localFor(e.endMs - 1, zone).slice(0, 10)),
  );
  const lateEvents = events.filter(
    (e) =>
      !e.allDay &&
      inDays(e) &&
      (minuteOf(e.endMs - 1, zone) >= 1320 ||
        localFor(e.startMs, zone).slice(0, 10) !==
          localFor(e.endMs - 1, zone).slice(0, 10)),
  );
  const columns = `58px ${days.map((day) => `minmax(0, ${widenToday && day === today ? 1.75 : 1}fr)`).join(" ")}`;
  return (
    <div className={styles.fittedCalendar}>
      <div className={styles.hoursEdge}>
        <button
          type="button"
          aria-expanded={early}
          onClick={() => setEarly(!early)}
        >
          <UnigentamosIcon role="chevron-down" size={14} style={{ transform: early ? undefined : "rotate(180deg)" }} />
          {early ? "Hide" : "Show"} before 8 am
          {earlyEvents.length > 0 && (
            <b>
              {earlyEvents.length}{" "}
              {earlyEvents.length === 1 ? "event" : "events"}
            </b>
          )}
        </button>
        <button
          type="button"
          aria-label="Add an early event"
          onClick={() => onCreate(days.includes(today) ? today : days[0], 7)}
        >
          <UnigentamosIcon role="plus" size={13} />Early event
        </button>
      </div>
      <div
        className={styles.fittedGrid}
        style={
          {
            gridTemplateColumns: columns,
            "--hour-height": `${px * 60}px`,
          } as CSSProperties
        }
      >
        <div className={styles.fittedZone}>
          {zone.split("/").pop()?.replaceAll("_", " ")}
        </div>
        {days.map((day) => {
          const allDay = events.filter(
              (e) => e.allDay && e.start <= day && e.end > day,
            ),
            links = dated.filter((d) => d.start <= day && d.end > day);
          return (
            <motion.div
              className={styles.fittedDayHeader}
              layout
              transition={{ layout: layoutTransition }}
              data-today={day === today}
              key={day}
            >
              <motion.button
                layout="position"
                transition={{ layout: layoutTransition }}
                type="button"
                onClick={() => onDay(day)}
                aria-label={`Events on ${day}`}
                aria-current={day === today ? "date" : undefined}
              >
                <span className={styles.weekdayName}>
                  {new Date(`${day}T12:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                  })}
                </span>
                <span className={styles.weekdayCompact} aria-hidden="true">
                  {new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: "long" }).slice(0, 2)}
                </span>
                <span className={styles.dateLine}>
                  <strong>{Number(day.slice(-2))}</strong>
                  {day === today && <small>Today</small>}
                </span>
              </motion.button>
              {!!(allDay.length + links.length) && (
                <div className={styles.allDayItems} role="group" aria-label={`All-day and linked events on ${day}`} data-all-day-date={day}>
                  {allDay.map(item => {
                    const calendar = calendars.find(c => c.id === item.calendarId),
                      group = eventGroup(calendar, item.groupId),
                      color = item.system ? (item.system.kind === "birthday" ? "#5A6040" : "#716B80") : group?.color || (calendar?.color?.toLowerCase() === "#565b86" ? "#59518B" : calendar?.color) || "#59518B";
                    return <motion.button type="button" key={item.id} layout="position" transition={{ layout: layoutTransition }}
                      className={styles.allDayItem} style={{ "--event-color": color } as CSSProperties}
                      aria-label={`${item.title} · All day${group ? ` · ${group.name}` : ""}`} title={`${item.title} · All day`}
                      onClick={() => onOpen(item)}>
                      <UnigentamosIcon role={item.system ? item.system.kind === "birthday" ? "birthday" : "star" : group?.icon || "interaction-date"} size={13} />
                      <span className={styles.eventTitle}>{item.title}</span>
                      <EventPeople refs={item.linkedRefs} available={refs} />
                    </motion.button>;
                  })}
                  {links.map(link => <Link key={link.id} className={styles.allDayItem}
                    style={{ "--event-color": MODULE_COLOR_SYSTEM[link.ownerRef?.module || "personal_ops"].tokens.icon } as CSSProperties}
                    href={link.ownerRef?.route || "/admin/personal"} data-completed={link.completed || undefined}
                    aria-label={`${link.title} · Linked${link.completed ? " · Completed" : ""}`} title={link.title}>
                    <UnigentamosIcon role={link.completed ? "check" : "link"} size={13} />
                    <span>{link.title}</span>
                  </Link>)}
                </div>
              )}
            </motion.div>
          );
        })}
        <div className={styles.fittedHours} ref={hours}>
          {Array.from({ length: endHour - startHour }, (_, i) => (
            <motion.span layout key={startHour + i} transition={{ layout: layoutTransition }}>
              <motion.span layout="position" transition={{ layout: layoutTransition }}>{hourName(startHour + i)}</motion.span>
            </motion.span>
          ))}
        </div>
        {days.map((day) => {
          const low = instantFor(day, zone),
            high = instantFor(addDays(day, 1), zone);
          const laid = calendarLayout(
            events.filter(
              (e) => !e.allDay && e.startMs < high && e.endMs > low,
            ),
          );
          return (
            <motion.div
              className={styles.fittedColumn}
              layout
              transition={{ layout: layoutTransition }}
              key={day}
              data-today={day === today}
              data-calendar-day={day}
              onPointerMove={(e) => {
                if (origin.current?.day === day) {
                  const m = atPointer(e);
                  setSelection({
                    day,
                    start: Math.min(origin.current.minute, m),
                    end: Math.max(origin.current.minute, m) + 5,
                  });
                }
              }}
              onPointerUp={(e) => {
                if (origin.current?.day === day) {
                  const m = atPointer(e),
                    first = origin.current.minute;
                  onCreate(
                    day,
                    Math.min(first, m) / 60,
                    first === m ? 60 : Math.abs(first - m) + 5,
                  );
                }
                origin.current = undefined;
                setSelection(undefined);
              }}
              onPointerCancel={() => {
                origin.current = undefined;
                setSelection(undefined);
              }}
              onDragOver={(e) => {
                if (
                  e.dataTransfer.types.includes(
                    "application/x-unigentamos-event",
                  )
                ) {
                  e.preventDefault();
                  setCursor({ day, minute: atPointer(e) });
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const item = events.find(
                  (x) =>
                    x.id ===
                    e.dataTransfer.getData("application/x-unigentamos-event"),
                );
                if (item) onMove(item, day, atPointer(e) / 60);
              }}
            >
              {Array.from({ length: endHour - startHour }, (_, i) => {
                const h = startHour + i,
                  focused =
                    cursor.day === day && Math.floor(cursor.minute / 60) === h,
                  minute = focused ? cursor.minute : h * 60;
                return (
                  <motion.button
                    layout
                    transition={{ layout: layoutTransition }}
                    initial={false}
                    type="button"
                    className={styles.hourSlot}
                    key={h}
                    aria-label={`Add event ${day} at ${clock(minute)}`}
                    data-hour={h}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      const parent = e.currentTarget.parentElement!;
                      const m = Math.max(
                        startHour * 60,
                        Math.min(
                          endHour * 60 - 5,
                          startHour * 60 +
                            Math.floor(
                              (e.clientY - parent.getBoundingClientRect().top) /
                                px /
                                5,
                            ) *
                              5,
                        ),
                      );
                      origin.current = { day, minute: m };
                      setSelection({ day, start: m, end: m + 5 });
                      parent.setPointerCapture(e.pointerId);
                    }}
                    onClick={(e) => {
                      if (e.detail === 0) onCreate(day, minute / 60);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        const next = Math.max(
                          startHour * 60,
                          Math.min(
                            endHour * 60 - 5,
                            minute + (e.key === "ArrowUp" ? -5 : 5),
                          ),
                        );
                        setCursor({ day, minute: next });
                        if (Math.floor(next / 60) !== h)
                          (
                            e.currentTarget.parentElement?.querySelector(
                              `[data-hour="${Math.floor(next / 60)}"]`,
                            ) as HTMLElement
                          )?.focus();
                      }
                    }}
                  />
                );
              })}
              {laid.map((item) => {
                const from =
                    item.startMs < low ? 0 : minuteOf(item.startMs, zone),
                  until =
                    item.endMs >= high ? 1440 : minuteOf(item.endMs, zone);
                if (until <= startHour * 60 || from >= endHour * 60)
                  return null;
                const top = position(Math.max(startHour * 60, from)),
                  bottom = position(Math.min(endHour * 60, until));
                const c = calendars.find((c) => c.id === item.calendarId),
                  group = eventGroup(c, item.groupId),
                  color =
                    group?.color ||
                    (c?.color?.toLowerCase() === "#565b86"
                      ? "#59518B"
                      : c?.color) ||
                    "#59518B";
                const title = `${item.title} · ${clock(from)}–${clock(until)}${group ? ` · ${group.name}` : ""}`;
                return (
                  <motion.div
                    key={item.id}
                    layout={resizing ? false : true}
                    transition={{ layout: layoutTransition }}
                    className={styles.fittedEvent}
                    title={title}
                    style={
                      {
                        top,
                        left: `calc(${(item.column / item.columns) * 100}% + 2px)`,
                        width: `calc(${100 / item.columns}% - 4px)`,
                        height: Math.max(
                          14,
                          resizing?.id === item.id
                            ? bottom -
                                top +
                                ((resizing.end - item.endMs) / 60000) * px
                            : bottom - top - 1,
                        ),
                        "--event-color": color,
                        "--event-avatar-size": `${Math.max(8, Math.min(18, bottom - top - 7))}px`,
                      } as CSSProperties
                    }
                  >
                    <motion.button
                      layout="position"
                      transition={{ layout: layoutTransition }}
                      type="button"
                      draggable
                      onDragStartCapture={(e) =>
                        e.dataTransfer.setData(
                          "application/x-unigentamos-event",
                          item.id,
                        )
                      }
                      onClick={() => onOpen(item)}
                      aria-label={title}
                    >
                      <span className={styles.timedEventTitle}>{group && <UnigentamosIcon role={group.icon} size={12} />}<strong>{item.title}</strong><EventPeople refs={item.linkedRefs} available={refs} limit={2} /></span>
                      {bottom - top > 30 && (
                        <span>
                          {clock(from)}–{clock(until)}
                        </span>
                      )}
                    </motion.button>
                    <button
                      type="button"
                      className={styles.fittedResize}
                      aria-label={`Resize ${item.title}; arrow keys adjust by 5 minutes`}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          onResize(
                            item,
                            Math.max(
                              item.startMs + 300000,
                              item.endMs +
                                (e.key === "ArrowUp" ? -1 : 1) * 300000,
                            ),
                          );
                        }
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        resize.current = {
                          item,
                          y: e.clientY,
                          end: item.endMs,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        if (resize.current?.item.id === item.id) {
                          e.stopPropagation();
                          const end = Math.max(
                            item.startMs + 300000,
                            resize.current.end +
                              Math.round(
                                (e.clientY - resize.current.y) / px / 5,
                              ) *
                                300000,
                          );
                          resize.current.end = resize.current.item.endMs;
                          setResizing({ id: item.id, end });
                        }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        if (resizing?.id === item.id)
                          onResize(item, resizing.end);
                        resize.current = undefined;
                        setResizing(undefined);
                      }}
                      onPointerCancel={() => {
                        resize.current = undefined;
                        setResizing(undefined);
                      }}
                    />
                  </motion.div>
                );
              })}
              {selection?.day === day && (
                <div
                  className={styles.dragPreview}
                  style={{
                    top: position(selection.start),
                    height: Math.max(
                      18,
                      (selection.end - selection.start) * px,
                    ),
                  }}
                >
                  {clock(selection.start)}–{clock(selection.end)}
                </div>
              )}
              {day === today &&
                minuteOf(now, zone) >= startHour * 60 &&
                minuteOf(now, zone) < endHour * 60 && (
                  <motion.div
                    className={styles.now}
                    layout="position"
                    transition={{ layout: reduced ? { duration: 0 } : layoutTransition }}
                    style={{ top: position(minuteOf(now, zone)) }}
                  >
                    <span>{clock(minuteOf(now, zone))}</span>
                  </motion.div>
                )}
            </motion.div>
          );
        })}
      </div>
      <div className={styles.hoursEdge}>
        <button
          type="button"
          aria-expanded={late}
          onClick={() => setLate(!late)}
        >
          <UnigentamosIcon role="chevron-down" size={14} style={{ transform: late ? "rotate(180deg)" : undefined }} />
          {late ? "Hide" : "Show"} after 10 pm
          {lateEvents.length > 0 && (
            <b>
              {lateEvents.length} {lateEvents.length === 1 ? "event" : "events"}
            </b>
          )}
        </button>
        <button
          type="button"
          aria-label="Add a late event"
          onClick={() => onCreate(days.includes(today) ? today : days[0], 23)}
        >
          <UnigentamosIcon role="plus" size={13} />Late event
        </button>
      </div>
    </div>
  );
}
