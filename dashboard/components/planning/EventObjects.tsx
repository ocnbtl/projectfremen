"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./EventObjects.module.css";

type PreviewRef = NativeObjectRef & { preview?: { imageUrl?: string; imageUpdatedAt?: string } };
export function eventObjectRefs(event: EventOccurrence, available: NativeObjectRef[] = []) {
  const refs = [...new Map(event.linkedRefs.map(ref => [ref.module + ":" + ref.objectType + ":" + ref.objectId, available.find(item => item.module === ref.module && item.objectType === ref.objectType && item.objectId === ref.objectId) || ref])).values()];
  if (event.placeId && !refs.some(ref => ref.module === "map" && ref.objectId === event.placeId)) {
    const place = available.find(ref => ref.module === "map" && ref.objectId === event.placeId);
    if (place) refs.push(place);
  }
  if (event.location && !refs.some(ref => ref.module === "map")) refs.push({module:"map",objectType:"place",objectId:"event-location",label:event.location,route:""});
  const rank = (ref: NativeObjectRef) => ref.objectType === "person" ? 0 : ref.module === "map" ? 1 : 2;
  return refs.sort((a,b) => rank(a) - rank(b));
}
export function EventObjectIdentity({ record }: { record: PreviewRef }) {
  const raw = record.preview?.imageUrl || "";
  const safe = /^\/api\/people\/photos\/personal-[0-9a-f-]+$/i.test(raw) || /^https:\/\//.test(raw);
  const source = safe ? raw + (record.preview?.imageUpdatedAt ? (raw.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(record.preview.imageUpdatedAt) : "") : "";
  const [failed, setFailed] = useState("");
  const icon = record.module === "map" ? "location" : record.objectType === "organization" ? "organization" : record.module === "personal_ops" ? "module-personal" : "module-" + record.module;
  return <span className={styles.visual} data-location={!source && record.module === "map" || undefined} data-organization={record.objectType === "organization" || undefined}>
    {source && failed !== source ? <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(source)} /> : <UnigentamosIcon role={icon} size={14} />}
  </span>;
}

/** Compact previews retain an explicit count; opening the event exposes every link. */
export default function EventObjects({ event, available = [], list = false, align = "end", maxItems = 6, excludePlaces = false }: { event: EventOccurrence; available?: NativeObjectRef[]; list?: boolean; align?: "start" | "end"; maxItems?: number; excludePlaces?: boolean }) {
  const element = useRef<HTMLSpanElement>(null), [width, setWidth] = useState(300);
  const refs = [...new Map(event.linkedRefs.filter(ref => list || !(ref.module === "people" && ref.objectType === "person")).map(ref => [ref.module + ":" + ref.objectType + ":" + ref.objectId, available.find(item => item.module === ref.module && item.objectType === ref.objectType && item.objectId === ref.objectId) || ref])).values()];
  if (event.placeId && !refs.some(ref => ref.module === "map" && ref.objectId === event.placeId)) {
    const place = available.find(ref => ref.module === "map" && ref.objectType === "place" && ref.objectId === event.placeId);
    if (place) refs.unshift(place);
  }
  const location = !refs.some(ref => ref.module === "map" && ref.objectType === "place") && event.location;
  const rank = (ref: NativeObjectRef) => ref.objectType === "person" ? 0 : ref.module === "map" ? 1 : 2;
  const items = (location ? [{ module: "map", objectType: "place", objectId: "event-location", label: location, route: "" } as NativeObjectRef, ...refs] : refs).filter(ref => !excludePlaces || ref.module !== "map").sort((a,b) => rank(a) - rank(b));
  const count = items.length;
  useLayoutEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [count]);
  if (!count) return null;
  const limit = list ? maxItems : Math.max(1, Math.floor(width / 120));
  const shown = items.slice(0, limit), remaining = items.slice(limit);
  return <span ref={element} className={styles.objects} style={list ? undefined : {width:Math.min(count * 150,900)}} data-event-objects data-object-list={list || undefined} data-object-align={align} data-icon-only={!list && width < 65 || undefined} title={items.map(ref => ref.label).join(" · ")} aria-label={"Linked objects: " + items.map(ref => ref.label).join(", ")}>
    {shown.map((ref, index) => <span className={styles.chip} key={ref.module + ":" + ref.objectType + ":" + ref.objectId} title={ref.label}>
      <EventObjectIdentity record={ref} /><span className={styles.label}>{ref.label}</span>
      {list && index === shown.length - 1 && !!remaining.length && <span className={styles.more} title={remaining.map(ref => ref.label).join(" · ")} aria-label={remaining.length + " more linked objects: " + remaining.map(ref => ref.label).join(", ")}><UnigentamosIcon role="object" size={12}/>+{remaining.length}</span>}
    </span>)}
    {!list && !!remaining.length && <span className={styles.more} title={remaining.map(ref => ref.label).join(" · ")} aria-label={remaining.length + " more linked objects: " + remaining.map(ref => ref.label).join(", ")}>+{remaining.length}</span>}
  </span>;
}
