"use client";
import { useEffect, useRef, useState } from "react";
import EventDateTimePicker from "./EventDateTimePicker";
import styles from "./EventEditorFields.module.css";

type Segment = "month" | "day" | "year" | "hour" | "minute" | "period";
const pad = (n: number) => String(n).padStart(2, "0");

/** Edit wall-clock segments without parsing a browser-dependent date string. */
export default function EventDateSegments({ label, value, allDay, timeZone, onChange }: {
  label: string; value: string; allDay: boolean; timeZone: string; onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState<Segment>();
  const [draft, setDraft] = useState("");
  const skipBlur = useRef<Segment | undefined>(undefined);
  const inputs = useRef<Partial<Record<Segment, HTMLInputElement | null>>>({});
  const year = Number(value.slice(0,4)), month = Number(value.slice(5,7)), day = Number(value.slice(8,10));
  const hour = Number(value.slice(11,13) || 9), minute = Number(value.slice(14,16) || 0);
  const values = { month:pad(month), day:pad(day), year:String(year).padStart(4,"0"), hour:String(hour % 12 || 12), minute:pad(minute), period:hour >= 12 ? "pm" : "am" };
  useEffect(() => { if (allDay && editing && ["hour","minute","period"].includes(editing)) setEditing(undefined); }, [allDay, editing]);
  function commit(segment: Segment, raw: string) {
    if (!raw.trim()) return;
    const number = Number(raw);
    let y=year,m=month,d=day,h=hour,min=minute;
    if (segment === "period") {
      if (!/^[ap](m)?$/i.test(raw)) return;
      h = hour % 12 + (raw.toLowerCase().startsWith("p") ? 12 : 0);
    } else {
      if (!Number.isInteger(number)) return;
      if (segment === "year") y=Math.max(1,Math.min(9999,number));
      if (segment === "month") m=Math.max(1,Math.min(12,number));
      if (segment === "day") d=Math.max(1,number);
      if (segment === "hour") h=Math.max(1,Math.min(12,number)) % 12 + (hour >= 12 ? 12 : 0);
      if (segment === "minute") min=Math.max(0,Math.min(59,number));
    }
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    d=Math.min(d,[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1]);
    const normalized = {month:pad(m),day:pad(d),year:String(y).padStart(4,"0"),hour:String(h % 12 || 12),minute:pad(min),period:h >= 12 ? "pm" : "am"};
    onChange(`${String(y).padStart(4,"0")}-${pad(m)}-${pad(d)}${allDay ? "" : `T${pad(h)}:${pad(min)}`}`);
    return normalized[segment];
  }
  const order: Segment[] = allDay ? ["month","day","year"] : ["month","day","year","hour","minute","period"];
  function field(segment: Segment) {
    return <input ref={node => { inputs.current[segment]=node; }} className={styles.segment} data-segment={segment} aria-label={`${label} ${segment}`} autoComplete="off" inputMode={segment === "period" ? "text" : "numeric"} spellCheck={false}
      value={editing === segment ? draft : values[segment]} maxLength={segment === "year" ? 4 : 2}
      onFocus={e => { setEditing(segment); setDraft(values[segment]); e.currentTarget.select(); }}
      onClick={e => e.currentTarget.select()}
      onChange={e => { const raw=e.target.value; if (segment === "period" ? /^[apm]*$/i.test(raw) : /^\d*$/.test(raw)) { setDraft(raw); if (segment !== "period" && raw.length === (segment === "year" ? 4 : 2)) { commit(segment, raw); const next=order[order.indexOf(segment)+1]; if (next) { skipBlur.current=segment; inputs.current[next]?.focus(); } } if (segment === "period" && /^[ap]$/i.test(raw)) { commit(segment,raw); setDraft(raw.toLowerCase()+"m"); } } }}
      onBlur={e => { if (skipBlur.current === segment) { skipBlur.current=undefined; return; } commit(segment,e.currentTarget.value); setEditing(undefined); }}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDraft(values[segment]); }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const raw=segment === "period" ? (values.period === "am" ? "pm" : "am") : String(Number(draft || values[segment])+(e.key === "ArrowUp" ? 1 : -1)); const normalized=commit(segment,raw); setDraft(normalized || values[segment]); }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "/" || e.key === ":") { e.preventDefault(); const index=order.indexOf(segment)+(e.key === "ArrowLeft" ? -1 : 1); inputs.current[order[index]]?.focus(); }
      }} />;
  }
  return <div className={styles.dateRow} role="group" aria-label={label}>
    <EventDateTimePicker iconOnly dateOnly label={label} value={value.slice(0,10)} allDay timeZone={timeZone} onChange={next => onChange(allDay ? next : `${next}T${pad(hour)}:${pad(minute)}`)} />
    <span className={styles.dateLabel}>{label}</span>
    <div className={styles.segments}>{field("month")}<span>/</span>{field("day")}<span>/</span>{field("year")}
      {!allDay && <><span className={styles.comma}>,</span>{field("hour")}<span>:</span>{field("minute")}{field("period")}</>}
    </div>
  </div>;
}
