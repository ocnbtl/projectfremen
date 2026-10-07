"use client";
import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import EventGlyph from "./EventGlyph";
import EventObjects from "./EventObjects";
import EventPeople from "./EventPeople";
import { TaskCheck } from "./TaskEventCard";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { eventPreviewTitle } from "./calendar-presentation";
import styles from "./TimedEventContent.module.css";

export default function TimedEventContent({ event, timing, icon, height, available, singleDay, onOpen, onComplete, onDragStart, onDragEnd }: {
  event: EventOccurrence; timing: string; icon?: string; height: number; available: NativeObjectRef[]; singleDay: boolean;
  onOpen: () => void; onComplete: (event: EventOccurrence) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null), [width,setWidth] = useState(300);
  useLayoutEffect(() => { if (!root.current) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(root.current); return () => observer.disconnect(); }, []);
  const place = available.find(r => r.module === "map" && r.objectId === event.placeId)?.label || event.linkedRefs.find(r => r.module === "map")?.label || event.location;
  const title = eventPreviewTitle(event);
  const vertical = height >= 82;
  const requiredWidth = title.length * 6.5 + timing.length * 5.5 + (place ? place.length * 6 + 24 : 0) + (event.isTask ? 82 : 58);
  const collapsed = !vertical && width < requiredWidth;
  // In tall but narrow columns, use the available height before collapsing metadata.
  const narrow = vertical && width < 82;
  const popup = (role: string, text: string, label: string) => <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.detailButton} aria-label={`${label} for ${event.title}`} onPointerDown={e => e.stopPropagation()}><UnigentamosIcon role={role} size={14}/></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.detail} side="right" sideOffset={6} collisionPadding={8} aria-label={label}><UnigentamosIcon role={role} size={15}/><span>{text}</span><Popover.Close aria-label={`Close ${label.toLowerCase()}`}><UnigentamosIcon role="close" size={14}/></Popover.Close></Popover.Content></Popover.Portal></Popover.Root>;
  return <div ref={root} className={styles.content} data-vertical={vertical} data-tiny={height < 26} data-slim={width < 120} data-completed={event.completed || undefined} data-narrow={narrow}>
    <TaskCheck event={event} onComplete={onComplete} />
    <button className={styles.open} type="button" draggable={!event.system} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen} aria-label={`${event.title} · ${timing}${place ? ` · ${place}` : ""}`}>
      <span className={styles.title}><EventGlyph event={event} icon={icon} size={16}/><strong>{title}</strong></span>
      {!collapsed && !narrow && <span className={styles.time}><UnigentamosIcon role="clock" size={14}/><span>{timing}</span></span>}
      {place && !collapsed && !narrow && <span className={styles.place}><UnigentamosIcon role="location" size={14}/><span>{place}</span></span>}
      {vertical && height >= 140 && <EventObjects event={event} available={available} excludePlaces list align={singleDay ? "start" : "end"} maxItems={Math.max(1,Math.floor((height - 100) / 36))} />}
      {!vertical && !collapsed && width > requiredWidth + 60 && <EventPeople refs={event.linkedRefs} available={available} limit={2}/>}
    </button>
    {(collapsed || narrow) && <span className={styles.details}>{popup("clock",timing,"Time")}{place && popup("location",place,"Place")}</span>}
  </div>;
}
