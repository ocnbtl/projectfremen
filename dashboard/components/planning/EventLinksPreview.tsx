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

const identity = (ref: NativeObjectRef) => ref.objectType === "person" ? <PersonAvatar person={ref}/> : <EventObjectIdentity record={ref}/>;

/** Preview here; navigate only when the user explicitly opens the profile. */
export function EventObjectPreview({record, showName = false}: {record: NativeObjectRef; showName?: boolean}) {
  const detail = (record as NativeObjectRef & {preview?: {detail?: string}}).preview?.detail;
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-profile-preview aria-label={"Preview "+record.label} title={record.label} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    {identity(record)}{showName && <span className={styles.name}>{record.label}</span>}
  </button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={record.label} onOpenAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <header className={styles.profileHeading}>{identity(record)}<strong>{record.label}</strong><Popover.Close aria-label="Close profile preview"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
    {detail && <p className={styles.detail}>{detail}</p>}
    {record.route && <Link className={styles.profileLink} href={record.route}><UnigentamosIcon role="link" size={14}/>Open {record.objectType === "person" || record.objectType === "organization" ? "profile" : "record"}</Link>}
  </Popover.Content></Popover.Portal></Popover.Root>;
}

/** Profile buttons and overflow share one compact group, with independent click targets. */
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
  const capacity = Math.min(6,limit ?? (width >= 420 ? 3 : width >= 300 ? 2 : width >= 180 ? 1 : 0));
  const shown = refs.slice(0,capacity), remaining = Math.max(0,refs.length-capacity);
  return <span ref={root} className={styles.preview} data-event-links data-object-list={list || undefined} data-align={align}>
    {shown.map(ref=><EventObjectPreview key={ref.module+":"+ref.objectId} record={ref} showName={list}/>)}
    {remaining > 0 && <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-counted aria-label={"All "+refs.length+" linked objects for "+event.title} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}><span className={styles.count}><UnigentamosIcon role="object" size={13}/>+{remaining}</span></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={"Objects linked to "+event.title} onOpenAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
      <header><UnigentamosIcon role="object" size={16}/><strong>Linked objects · {refs.length}</strong><Popover.Close aria-label="Close linked objects"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
      <div className={styles.list}>{refs.map(ref=><EventObjectPreview key={ref.module+":"+ref.objectId} record={ref} showName/>)}</div>
    </Popover.Content></Popover.Portal></Popover.Root>}
  </span>;
}
