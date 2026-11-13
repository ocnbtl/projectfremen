"use client";
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarLinkedWorkContext } from "./CalendarLinkedWorkContext";
import { editableCalendarRef } from "../../lib/modules/planning/linked-work-types";
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
export function EventObjectPreview({record, showName = false, iconOnly = false, onEditHere, children, triggerClassName, onOpenProfile}: {onEditHere?:()=>void;record: NativeObjectRef; showName?: boolean; iconOnly?: boolean; children?: ReactNode; triggerClassName?: string; onOpenProfile?:()=>void}) {
  const detail = (record as NativeObjectRef & {preview?: {detail?: string}}).preview?.detail;
  if (onEditHere) return <button type="button" className={styles.trigger} data-profile-preview aria-label={"Edit linked "+record.label} title={record.label} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onEditHere();}}>{iconOnly ? <UnigentamosIcon role="module-notes" size={14}/> : identity(record)}{showName&&!iconOnly&&<span className={styles.name}>{record.label}</span>}</button>;
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={triggerClassName ?? styles.trigger} data-profile-preview aria-label={"Preview "+record.label} title={record.label} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    {children ?? <>{iconOnly ? <UnigentamosIcon role={record.objectType === "person" ? "person" : "object"} size={14}/> : identity(record)}{showName && !iconOnly && <span className={styles.name}>{record.label}</span>}</>}
  </button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={record.label} onOpenAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <header className={styles.profileHeading}>{identity(record)}<strong>{record.label}</strong><Popover.Close aria-label="Close profile preview"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
    {detail && <p className={styles.detail}>{detail}</p>}
    {onOpenProfile ? <Popover.Close asChild><button type="button" className={styles.profileLink} onClick={onOpenProfile}><UnigentamosIcon role="link" size={14}/>Open profile</button></Popover.Close> : record.route && <Link prefetch={false} className={styles.profileLink} href={record.route}><UnigentamosIcon role="link" size={14}/>Open {record.objectType === "person" || record.objectType === "organization" ? "profile" : "Object"}</Link>}
  </Popover.Content></Popover.Portal></Popover.Root>;
}

/** Profile buttons and overflow share one compact group, with independent click targets. */
export default function EventLinksPreview({ event, available, excludePlaces = true, limit, list = false, align = "start" }: { event: EventOccurrence; available: NativeObjectRef[]; excludePlaces?: boolean; limit?: number; list?: boolean; align?: "start" | "end" }) {
  const root = useRef<HTMLSpanElement>(null), [width,setWidth] = useState(0);
  const details = useCalendarDetails();
  const openWork = useContext(CalendarLinkedWorkContext);
  const editHere = (ref:NativeObjectRef) => openWork&&editableCalendarRef(ref)?()=>openWork(event,ref):undefined;
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
    {shown.map(ref=><EventObjectPreview key={ref.module+":"+ref.objectId} record={ref} showName={list} onEditHere={editHere(ref)}/>)}
    {remaining > 0 && <LinkGroup editHere={editHere} refs={detailed} eventTitle={event.title} count={remaining}/>}
    {hiddenPeople.length > 0 && <LinkGroup editHere={editHere} refs={hiddenPeople} eventTitle={event.title} kind="people"/>}
    {hiddenObjects.length > 0 && <LinkGroup editHere={editHere} refs={hiddenObjects} eventTitle={event.title}/>}
  </span>;
}

function LinkGroup({editHere,refs,eventTitle,kind="objects",count}: {editHere:(ref:NativeObjectRef)=>(()=>void)|undefined; refs: NativeObjectRef[]; eventTitle: string; kind?: "people" | "objects"; count?: number}) {
  const icon = kind === "people" ? "person" : "object";
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.trigger} data-counted={count !== undefined || undefined} data-linked-summary={count === undefined ? kind : undefined} aria-label={`All ${refs.length} linked ${kind} for ${eventTitle}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}><span className={styles.count}><UnigentamosIcon role={icon} size={14}/>{count !== undefined && `+${count}`}</span></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={`${kind === "people" ? "People" : "Objects"} linked to ${eventTitle}`} onOpenAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <header><UnigentamosIcon role={icon} size={16}/><strong>Linked {kind} · {refs.length}</strong><Popover.Close aria-label={`Close linked ${kind}`}><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
    <div className={styles.list}>{refs.map(ref=><EventObjectPreview key={ref.module+":"+ref.objectId} record={ref} showName onEditHere={editHere(ref)}/>)}</div>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
