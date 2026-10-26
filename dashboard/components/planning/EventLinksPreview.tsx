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
import { useCalendarDetails } from "./CalendarDisplayPreferences";

const identity = (ref: NativeObjectRef) => ref.objectType === "person" ? <PersonAvatar person={ref}/> : <EventObjectIdentity record={ref}/>;

/** Preview here; navigate only when the user explicitly opens the profile. */
export function EventObjectPreview({record, showName = false, iconOnly = false}: {record: NativeObjectRef; showName?: boolean; iconOnly?: boolean}) {
  const detail = (record as NativeObjectRef & {preview?: {detail?: string}}).preview?.detail;
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-profile-preview aria-label={"Preview "+record.label} title={record.label} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    {iconOnly ? <UnigentamosIcon role={record.objectType === "person" ? "person" : "object"} size={14}/> : identity(record)}{showName && !iconOnly && <span className={styles.name}>{record.label}</span>}
  </button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={record.label} onOpenAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <header className={styles.profileHeading}>{identity(record)}<strong>{record.label}</strong><Popover.Close aria-label="Close profile preview"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
    {detail && <p className={styles.detail}>{detail}</p>}
    {record.route && <Link className={styles.profileLink} href={record.route}><UnigentamosIcon role="link" size={14}/>Open {record.objectType === "person" || record.objectType === "organization" ? "profile" : "record"}</Link>}
  </Popover.Content></Popover.Portal></Popover.Root>;
}

/** Profile buttons and overflow share one compact group, with independent click targets. */
export default function EventLinksPreview({ event, available, excludePlaces = true, limit, list = false, align = "start" }: { event: EventOccurrence; available: NativeObjectRef[]; excludePlaces?: boolean; limit?: number; list?: boolean; align?: "start" | "end" }) {
  const root = useRef<HTMLSpanElement>(null), [width,setWidth] = useState(0);
  const details = useCalendarDetails();
  const refs = eventObjectRefs(event,available).filter(ref => !excludePlaces || ref.module !== "map");
  useLayoutEffect(() => {
    const card = root.current?.closest<HTMLElement>("[data-morph-event]");
    if (!card) return;
    const observer = new ResizeObserver(() => setWidth(card.clientWidth));
    observer.observe(card); return () => observer.disconnect();
  }, [refs.length]);
  if (!refs.length) return null;
  const capacity = Math.min(6,limit ?? (width >= 420 ? 3 : width >= 300 ? 2 : width >= 180 ? 1 : 0));
  const detailed = refs.filter(ref => details[ref.objectType === "person" ? "people" : "objects"]);
  const hiddenPeople = refs.filter(ref => ref.objectType === "person" && !details.people);
  const hiddenObjects = refs.filter(ref => ref.objectType !== "person" && !details.objects);
  const shown = detailed.slice(0,capacity), remaining = Math.max(0,detailed.length-capacity);
  return <span ref={root} className={styles.preview} data-event-links data-object-list={list || undefined} data-align={align}>
    {shown.map(ref=><EventObjectPreview key={ref.module+":"+ref.objectId} record={ref} showName={list}/>)}
    {remaining > 0 && <LinkGroup refs={detailed} eventTitle={event.title} count={remaining}/>}
    {hiddenPeople.length > 0 && <LinkGroup refs={hiddenPeople} eventTitle={event.title} kind="people"/>}
    {hiddenObjects.length > 0 && <LinkGroup refs={hiddenObjects} eventTitle={event.title}/>}
  </span>;
}

function LinkGroup({refs,eventTitle,kind="objects",count}: {refs: NativeObjectRef[]; eventTitle: string; kind?: "people" | "objects"; count?: number}) {
  const icon = kind === "people" ? "person" : "object";
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-counted={count !== undefined || undefined} data-linked-summary={count === undefined ? kind : undefined} aria-label={`All ${refs.length} linked ${kind} for ${eventTitle}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}><span className={styles.count}><UnigentamosIcon role={icon} size={14}/>{count !== undefined && `+${count}`}</span></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={`${kind === "people" ? "People" : "Objects"} linked to ${eventTitle}`} onOpenAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <header><UnigentamosIcon role={icon} size={16}/><strong>Linked {kind} · {refs.length}</strong><Popover.Close aria-label={`Close linked ${kind}`}><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
    <div className={styles.list}>{refs.map(ref=><EventObjectPreview key={ref.module+":"+ref.objectId} record={ref} showName/>)}</div>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
