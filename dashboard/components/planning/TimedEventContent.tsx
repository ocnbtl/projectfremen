"use client";
import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { motion } from "motion/react";
import { useCalendarMotion } from "./CalendarMotion";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import EventGlyph from "./EventGlyph";
import EventLinksPreview from "./EventLinksPreview";
import EventDetail from "./EventDetail";
import { eventObjectRefs } from "./EventObjects";
import { TaskCheck } from "./TaskEventCard";
import { eventPreviewTitle } from "./calendar-presentation";
import styles from "./TimedEventContent.module.css";

export default function TimedEventContent({ event, timing, icon, height, available, singleDay, onOpen, onComplete, onDragStart, onDragEnd }: {
  event: EventOccurrence; timing: string; icon?: string; height: number; available: NativeObjectRef[]; singleDay: boolean;
  onOpen: () => void; onComplete: (event: EventOccurrence) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null), heading = useRef<HTMLDivElement>(null);
  const {reduced,layoutTransition}=useCalendarMotion();
  const [width,setWidth] = useState(300), [headingHeight,setHeadingHeight] = useState(0);
  useLayoutEffect(() => {
    const element = root.current, header = heading.current; if (!element || !header) return;
    // Outside layout dimensions do not change with padding or entrance transforms.
    const measure = () => { setWidth(element.clientWidth); setHeadingHeight(header.offsetHeight); };
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(header); measure();
    return () => observer.disconnect();
  }, []);
  const place = eventObjectRefs(event,available).find(ref => ref.module === "map")?.label;
  const title = eventPreviewTitle(event), vertical = height >= 58, narrow = width < 90;
  const hasObjects = eventObjectRefs(event,available).some(ref => ref.module !== "map");
  const inlineFits = width >= title.length * 6.5 + timing.length * 5.4 + (place ? place.length * 5.4 + 24 : 0) + 82 + (hasObjects ? 30 : 0);
  const compactTime = vertical ? width < timing.length * 5.4 + 26 : !inlineFits;
  const compactPlace = vertical ? width < (place?.length || 0) * 5.4 + 26 : !inlineFits;
  const compact = compactTime && (!place || compactPlace);
  // Reserve the title first, then independent time/place controls, then people/objects.
  const detailRoom = vertical ? height - headingHeight - 14 >= 22 : width >= 72;
  const objectRoom = vertical ? height - headingHeight - (detailRoom ? (compact ? 25 : place ? 47 : 25) : 0) - 12 : 0;
  const objectLimit = Math.max(0,Math.floor((objectRoom + 5) / 27));
  const inlineObjects = vertical && narrow && compact && detailRoom && hasObjects && width >= (place ? 64 : 47);
  const showObjects = !inlineObjects && hasObjects && (vertical ? objectRoom >= 22 : width >= 210);
  return <div ref={root} className={styles.content} data-vertical={vertical} data-tiny={height < 26} data-narrow={narrow} data-completed={event.completed || undefined}>
    <motion.div layout="position" transition={{layout:layoutTransition}} ref={heading} className={styles.heading}>
      <TaskCheck event={event} onComplete={onComplete}/>
      <button className={styles.open} type="button" draggable={!event.system} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen} aria-label={`${event.title} · ${timing}${place ? ` · ${place}` : ""}`} title={title}>
        <EventGlyph event={event} icon={icon} size={14}/><strong>{vertical && narrow ? title.split(/\s+/).map((word,index) => <span key={index}>{word}</span>) : title}</strong>
      </button>
    </motion.div>
    {detailRoom && <motion.div layout="position" initial={reduced?false:{opacity:0,y:-3}} animate={{opacity:1,y:0}} transition={{layout:layoutTransition,duration:.18}} className={styles.details} data-compact={compact}>
      <EventDetail kind="time" text={timing} eventTitle={event.title} compact={compactTime}/>
      {place && <EventDetail kind="place" text={place} eventTitle={event.title} compact={compactPlace}/>}
      {inlineObjects && <EventLinksPreview event={event} available={available} limit={0}/>}
    </motion.div>}
    {showObjects && <motion.div layout="position" className={styles.objects} initial={reduced?false:{opacity:0,y:-3}} animate={{opacity:1,y:0}} transition={{layout:layoutTransition,duration:.18}}><EventLinksPreview event={event} available={available} list={vertical && !narrow} align={singleDay ? "start" : "end"} limit={vertical ? narrow ? 0 : objectLimit : 1}/></motion.div>}
  </div>;
}
