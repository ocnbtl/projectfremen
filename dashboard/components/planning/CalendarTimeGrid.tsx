"use client";
import { animate, motion } from "motion/react";
import { eventColors, eventPreviewTitle, eventTimeLabel, eventTimeRange } from "./calendar-presentation";
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
import EventGlyph from "./EventGlyph";
import EventObjects from "./EventObjects";
import CalendarAllDayBand from "./CalendarAllDayBand";
import styles from "./CalendarWorkspace.module.css";

const minuteOf = (ms: number, zone: string) => {
  const s = localFor(ms, zone);
  return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
};
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
  const dragging = useRef<{ item: EventOccurrence; offset: number } | undefined>(undefined);
  const [dragPreview, setDragPreview] = useState<{ item: EventOccurrence; day: string; minute: number; x: number; y: number; width: number; height: number }>();
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
  const currentTime = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }).format(now).toLowerCase().replace(/\s/g, "");
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
        onDragLeave={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) setDragPreview(undefined);
        }}
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
                <span className={styles.dateHeadingIdentity} data-morph-date={day}>
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
                </span>
              </motion.button>
            </motion.div>
          );
        })}
        <CalendarAllDayBand days={days} events={events} calendars={calendars} refs={refs} dated={dated} zone={zone} columns={columns} today={today} onOpen={onOpen} />
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
                  e.dataTransfer.dropEffect = "move";
                  const drag = dragging.current;
                  if (drag && grid.current) {
                    const column = e.currentTarget.getBoundingClientRect(), surface = grid.current.getBoundingClientRect();
                    const duration = (drag.item.endMs - drag.item.startMs) / 60000;
                    const minute = Math.max(startHour * 60, Math.min(endHour * 60 - Math.min(duration, minutes), atPointer(e) - drag.offset));
                    setDragPreview({ item: drag.item, day, minute, x: column.left - surface.left + 2, y: column.top - surface.top + position(minute), width: column.width - 4, height: Math.min(duration, minutes) * px - 1 });
                  }
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const item = events.find(
                  (x) =>
                    x.id ===
                    e.dataTransfer.getData("application/x-unigentamos-event"),
                );
                if (item) onMove(item, day, (dragPreview?.day === day ? dragPreview.minute : atPointer(e)) / 60);
                dragging.current = undefined;
                setDragPreview(undefined);
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
                const timing = eventTimeRange(Math.max(item.startMs, low), Math.min(item.endMs, high), zone);
                const linkedLabels = [...new Set([...item.linkedRefs.map(ref => ref.label), ...(item.placeId ? [refs.find(ref => ref.module === "map" && ref.objectId === item.placeId)?.label || item.location] : [item.location])].filter(Boolean))];
                const title = `${item.title} · ${timing}${group ? ` · ${group.name}` : ""}${linkedLabels.length ? ` · Linked: ${linkedLabels.join(", ")}` : ""}`;
                return (
                  <motion.div
                    key={item.id}
                    layout={false}
                    transition={{ layout: layoutTransition }}
                    className={styles.fittedEvent}
                    data-morph-event={item.id}
                    data-compact={bottom - top < 44}
                    data-tiny={bottom - top < 26}
                    data-roomy={bottom - top >= 100}
                    data-time-room={bottom - top >= 64}
                    data-dragging={dragPreview?.item.id === item.id || undefined}
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
                        "--event-title-lines": Math.max(1, Math.floor((bottom - top - 32) / 16)),
                        "--event-title-lines-narrow": Math.max(1, Math.floor((bottom - top - (bottom - top >= 100 ? 96 : 48)) / 16)),
                        "--event-avatar-size": `${Math.max(14, Math.min(24, bottom - top - 12))}px`,
                      } as CSSProperties
                    }
                  >
                    <motion.button
                      layout="position"
                      transition={{ layout: layoutTransition }}
                      type="button"
                      draggable={!item.system}
                      onDragStartCapture={(e) => {
                        e.dataTransfer.setData(
                          "application/x-unigentamos-event",
                          item.id,
                        );
                        e.dataTransfer.effectAllowed = "move";
                        const rect = e.currentTarget.getBoundingClientRect();
                        dragging.current = { item, offset: Math.round((e.clientY - rect.top) / px / 5) * 5 };
                        // The custom spring preview replaces the browser's offset drag image.
                        const image = document.createElement("canvas"); image.width = 1; image.height = 1;
                        e.dataTransfer.setDragImage(image, 0, 0);
                      }}
                      onDragEnd={() => { dragging.current = undefined; setDragPreview(undefined); }}
                      onClick={() => onOpen(item)}
                      aria-label={title}
                    >
                      <span className={styles.timedEventContent}><span className={styles.timedEventCopy}><span className={styles.timedEventTitle}><EventGlyph event={item} icon={group?.icon} size={18} /><strong>{eventPreviewTitle(item)}</strong>{bottom - top < 60 && linkedLabels.filter(label => !item.linkedRefs.some(ref => ref.objectType === "person" && ref.label === label)).length > 0 && <span className={styles.compactLinks} aria-label={`Linked objects: ${linkedLabels.join(", ")}`}><UnigentamosIcon role="object" size={11} />{linkedLabels.length}</span>}</span>{bottom - top >= 44 && <small className={styles.timedEventRange}><UnigentamosIcon role="clock" size={14} />{timing}</small>}</span>{bottom - top < 100 && <EventPeople refs={item.linkedRefs} available={refs} limit={2} />}{bottom - top >= 60 && <EventObjects event={item} align={days.length === 1 ? "start" : "end"} available={refs} list={bottom - top >= 100} maxItems={Math.max(1,Math.floor((bottom - top - 85) / 40))} />}</span>
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
                    className={styles.nowMarker}
                    role="img"
                    aria-label={`Current time: ${currentTime} (${zone})`}
                    layout={false}
                    style={{ "--now-position": `clamp(3px, ${topAt(minuteOf(now, zone))}, calc(100% - 3px))` } as CSSProperties}
                  >
                    <span className={styles.now} />
                    <time className={styles.nowLabel} dateTime={new Date(now).toISOString()}>{currentTime}</time>
                  </motion.div>
                )}
            </motion.div>
          );
        })}
        {dragPreview && <motion.div className={styles.eventDragPreview} data-drag-preview initial={false}
          animate={{ x: dragPreview.x, y: dragPreview.y, width: dragPreview.width, height: dragPreview.height }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38, mass: .7 }}
          style={eventColors(dragPreview.item, calendars.find(calendar => calendar.id === dragPreview.item.calendarId)) as CSSProperties}>
          <strong>{eventPreviewTitle(dragPreview.item)}</strong>
          <span>{eventTimeRange(instantFor(`${dragPreview.day}T${String(Math.floor(dragPreview.minute / 60)).padStart(2, "0")}:${String(dragPreview.minute % 60).padStart(2, "0")}`, zone), instantFor(`${dragPreview.day}T${String(Math.floor(dragPreview.minute / 60)).padStart(2, "0")}:${String(dragPreview.minute % 60).padStart(2, "0")}`, zone) + dragPreview.item.endMs - dragPreview.item.startMs, zone)}</span>
        </motion.div>}
      </div>
    </div>
  );
}
