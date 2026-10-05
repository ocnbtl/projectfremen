"use client";
import { animate, motion } from "motion/react";
import { eventColors, eventPreviewTitle } from "./calendar-presentation";
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
import UnigentamosIcon from "../icons/UnigentamosIcon";
import EventPeople from "./EventPeople";
import CalendarAllDayBand from "./CalendarAllDayBand";
import styles from "./CalendarWorkspace.module.css";

const minuteOf = (ms: number, zone: string) => {
  const s = localFor(ms, zone);
  return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
};
const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
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
  onOpen: (event: EventOccurrence) => void;
  onDay: (day: string) => void;
  onMove: (event: EventOccurrence, day: string, hour: number) => void;
  onResize: (event: EventOccurrence, endMs: number) => void;
}) {
  const { reduced, layoutTransition } = useCalendarMotion();
  const [height, setHeight] = useState(400),
    hours = useRef<HTMLDivElement>(null);
  const resize = useRef<
    { item: EventOccurrence; y: number; end: number } | undefined
  >(undefined);
  const [resizing, setResizing] = useState<{ id: string; end: number }>();
  const boundsRef = useRef({ start: early ? 0 : 8, end: late ? 24 : 22 });
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const from = boundsRef.current, target = { start: early ? 0 : 8, end: late ? 24 : 22 };
    const update = (progress: number) => { const next = { start: from.start + (target.start - from.start) * progress, end: from.end + (target.end - from.end) * progress }; boundsRef.current = next; grid.current?.style.setProperty("--calendar-start", String(next.start * 60)); grid.current?.style.setProperty("--calendar-span", String((next.end - next.start) * 60)); };
    if (reduced || (from.start === target.start && from.end === target.end)) { update(1); return; }
    const animation = animate(0, 1, { type: "spring", stiffness: 180, damping: 28, mass: 1, restDelta: 0.0005, restSpeed: 0.005, onUpdate: update });
    return () => animation.stop();
  }, [early, late, reduced]);
  const startHour = early ? 0 : 8, endHour = late ? 24 : 22, minutes = (endHour - startHour) * 60;
  const topAt = (minute: number) => `calc((${minute} - var(--calendar-start)) * 100% / var(--calendar-span))`;
  const heightFor = (duration: number) => `calc(${duration} * 100% / var(--calendar-span))`;
  const today = localDate(new Date(now), zone);
  const currentTime = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }).format(now);
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
  const columns = `var(--calendar-time-gutter, 58px) ${days.map((day) => `minmax(0, ${widenToday && day === today ? 1.75 : 1}fr)`).join(" ")}`;
  return (
    <div className={styles.fittedCalendar}>
      <div
        ref={grid} id="calendar-hour-grid"
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
                  <strong data-morph-date={day}>{Number(day.slice(-2))}</strong>
                  {day === today && <small>Today</small>}
                </span>
              </motion.button>
            </motion.div>
          );
        })}
        <CalendarAllDayBand days={days} events={events} calendars={calendars} refs={refs} dated={dated} zone={zone} columns={columns} onOpen={onOpen} />
        <div className={styles.fittedHours} ref={hours}>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} aria-hidden={i < startHour || i >= endHour} style={{ position: "absolute", top: topAt(i * 60), height: heightFor(60), width: "100%" }}><span>{hourName(i)}</span></span>
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
              onDragOver={(e) => {
                if (
                  e.dataTransfer.types.includes(
                    "application/x-unigentamos-event",
                  )
                ) {
                  e.preventDefault();
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
              {Array.from({ length: 24 }, (_, h) => {
                return <div className={styles.hourSlot} key={h} data-hour={h} aria-hidden="true" style={{ position: "absolute", top: topAt(h * 60), height: heightFor(60) }} />;
              })}
              {laid.map((item) => {
                const from =
                    item.startMs < low ? 0 : minuteOf(item.startMs, zone),
                  until =
                    item.endMs >= high ? 1440 : minuteOf(item.endMs, zone);

                const top = position(Math.max(startHour * 60, from)),
                  bottom = position(Math.min(endHour * 60, until));
                const c = calendars.find((c) => c.id === item.calendarId),
                  group = eventGroup(c, item.groupId);
                const title = `${item.title} · ${clock(from)}–${clock(until)}${group ? ` · ${group.name}` : ""}`;
                return (
                  <motion.div
                    key={item.id}
                    layout={false}
                    transition={{ layout: layoutTransition }}
                    className={styles.fittedEvent}
                    data-morph-event={item.id}
                    inert={until <= startHour * 60 || from >= endHour * 60}
                    aria-hidden={until <= startHour * 60 || from >= endHour * 60}
                    title={title}
                    style={
                      {
                        top: topAt(from),
                        left: `calc(${(item.column / item.columns) * 100}% + 2px)`,
                        width: `calc(${100 / item.columns}% - 4px)`,
                        height: `max(14px, calc(${resizing?.id === item.id ? (resizing.end - item.startMs) / 60000 : until - from} * 100% / var(--calendar-span) - 1px))`,
                        ...eventColors(item, c),
                        "--event-avatar-size": `${Math.max(8, Math.min(18, bottom - top - 7))}px`,
                      } as CSSProperties
                    }
                  >
                    <motion.button
                      layout="position"
                      transition={{ layout: layoutTransition }}
                      type="button"
                      draggable={!item.system}
                      onDragStartCapture={(e) =>
                        e.dataTransfer.setData(
                          "application/x-unigentamos-event",
                          item.id,
                        )
                      }
                      onClick={() => onOpen(item)}
                      aria-label={title}
                    >
                      <span className={styles.timedEventTitle}>{(group || item.system) && <UnigentamosIcon role={item.system ? "star" : group!.icon} size={12} />}<strong>{eventPreviewTitle(item)}</strong><EventPeople refs={item.linkedRefs} available={refs} limit={2} /></span>
                      {bottom - top > 30 && (
                        <span>
                          {clock(from)}–{clock(until)}
                        </span>
                      )}
                    </motion.button>
                    {!item.system && <button
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
                        if (e.pointerType !== "mouse") return;
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
                    />}
                  </motion.div>
                );
              })}
              {day === today && (
                  <motion.div
                    className={styles.now}
                    role="img"
                    aria-hidden={minuteOf(now, zone) < startHour * 60 || minuteOf(now, zone) >= endHour * 60}
                    aria-label={`Current time: ${currentTime} (${zone})`}
                    layout={false}
                    style={{ top: topAt(minuteOf(now, zone)) }}
                  >
                    <time dateTime={new Date(now).toISOString()}>{currentTime}</time>
                  </motion.div>
                )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
