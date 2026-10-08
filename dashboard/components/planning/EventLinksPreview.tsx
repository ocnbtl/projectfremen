"use client";
import { useLayoutEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { EventObjectIdentity, eventObjectRefs } from "./EventObjects";
import { PersonAvatar } from "./EventPeople";
import styles from "./EventLinksPreview.module.css";

/** Places have their own disclosure; this control is for people and other linked objects. */
export default function EventLinksPreview({ event, available, excludePlaces = true, limit, list = false, align = "start" }: { event: EventOccurrence; available: NativeObjectRef[]; excludePlaces?: boolean; limit?: number; list?: boolean; align?: "start" | "end" }) {
  const root = useRef<HTMLSpanElement>(null), [width,setWidth] = useState(0);
  const refs = eventObjectRefs(event,available).filter(ref => !excludePlaces || ref.module !== "map");
  useLayoutEffect(() => {
    const card = root.current?.closest<HTMLElement>("[data-morph-event]");
    if (!card) return;
    const observer = new ResizeObserver(() => setWidth(card.clientWidth));
    observer.observe(card); return () => observer.disconnect();
  }, [refs.length]);
  if (!refs.length) return null;
  const capacity = limit ?? (width >= 420 ? 3 : width >= 300 ? 2 : width >= 180 ? 1 : 0);
  const shown = refs.slice(0,capacity), remaining = Math.max(0,refs.length-capacity);
  const identity = (ref: NativeObjectRef) => ref.objectType === "person" ? <PersonAvatar person={ref}/> : <EventObjectIdentity record={ref}/>;
  const disclosure = <Popover.Trigger asChild><button type="button" className={styles.trigger} data-counted={remaining > 0 || undefined} aria-label={`Linked objects for ${event.title}: ${refs.map(ref => ref.label).join(", ")}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    {!list && shown.map(ref => <span key={`${ref.module}:${ref.objectId}`} title={ref.label}>{identity(ref)}</span>)}
    {remaining > 0 && <span className={styles.count}><UnigentamosIcon role="object" size={12}/><span>+{remaining}</span></span>}
  </button></Popover.Trigger>;
  return <Popover.Root><span ref={root} className={styles.preview} data-event-links data-object-list={list || undefined} data-align={align}>
    {list ? <>{shown.map((ref,index) => <span className={styles.inlineRow} key={`${ref.module}:${ref.objectId}`}>{identity(ref)}<span className={styles.name}>{ref.label}</span>{index===shown.length-1 && remaining>0 && disclosure}</span>)}{!shown.length && disclosure}</> : disclosure}
  </span><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={`Objects linked to ${event.title}`} onOpenAutoFocus={e => e.preventDefault()}>
    <header><UnigentamosIcon role="object" size={16}/><strong>Linked objects</strong><Popover.Close aria-label="Close linked objects"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
    <div className={styles.list}>{refs.map(ref => <div key={`${ref.module}:${ref.objectId}`} className={styles.row}>{identity(ref)}{ref.route ? <Link href={ref.route}>{ref.label}</Link> : <span>{ref.label}</span>}</div>)}</div>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
