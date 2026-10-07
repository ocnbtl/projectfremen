"use client";
import { useRef } from "react";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import { resizedEventTime } from "../../lib/modules/planning/calendar-tasks";
import styles from "./CalendarWorkspace.module.css";

export default function EventResizeHandle({ event, edge, pixelsPerMinute, onPreview, onResize }: {
  event: EventOccurrence; edge: "start" | "end"; pixelsPerMinute: number;
  onPreview: (value: { startMs: number; endMs: number } | undefined) => void;
  onResize: (event: EventOccurrence, value: number, edge: "start" | "end") => void;
}) {
  const drag = useRef<{ y: number; value: number } | undefined>(undefined);
  const original = edge === "start" ? event.startMs : event.endMs;
  const clamp = (value: number) => { const next = resizedEventTime(event, edge, value); return edge === "start" ? next.startMs : next.endMs; };
  return <button type="button" className={styles.fittedResize} data-edge={edge} aria-label={`Resize ${edge} of ${event.title}; arrow keys adjust by 5 minutes`}
    onKeyDown={e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); onResize(event,clamp(original + (e.key === "ArrowUp" ? -1 : 1) * 300000),edge); } }}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); drag.current = {y:e.clientY,value:original}; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (!drag.current) return; e.stopPropagation(); drag.current.value = clamp(original + Math.round((e.clientY - drag.current.y) / pixelsPerMinute / 5) * 300000); onPreview(resizedEventTime(event,edge,drag.current.value)); }}
    onPointerUp={e => { e.stopPropagation(); const value=drag.current?.value; drag.current=undefined; onPreview(undefined); if (value !== undefined && value !== original) onResize(event,value,edge); }}
    onPointerCancel={() => { drag.current=undefined; onPreview(undefined); }}
    onLostPointerCapture={() => { drag.current=undefined; onPreview(undefined); }}
    onClick={e => e.stopPropagation()} />;
}
