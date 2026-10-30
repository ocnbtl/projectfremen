"use client";
import { useMemo, useRef } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import EventGlyph from "./EventGlyph";
import EventTiming from "./EventTiming";
import { useEventPlace } from "./EventPlaceDetail";
import { eventObjectRefs } from "./EventObjects";
import { EventObjectPreview } from "./EventLinksPreview";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./EventQuickView.module.css";

export default function EventQuickView({open,event,anchor,available,zone,icon,onClose,onEdit,onManage,onComplete,onSkip}:{open:boolean;event:EventOccurrence;anchor:DOMRect;available:NativeObjectRef[];zone:string;icon?:string;onClose:()=>void;onEdit:()=>void;onManage:()=>void;onComplete?:()=>void;onSkip?:()=>void}) {
 const closeButton=useRef<HTMLButtonElement>(null), opener=useRef<HTMLElement|null>(null);
 const virtual=useMemo(()=>({current:{getBoundingClientRect:()=>anchor}}),[anchor]);
 const objects=eventObjectRefs(event,available), place=useEventPlace(event,available);
 return <Popover.Root open={open} onOpenChange={open=>{if(!open)onClose();}}><Popover.Anchor virtualRef={virtual}/><Popover.Portal><Popover.Content className={styles.panel} sideOffset={8} collisionPadding={10} aria-label={event.title} onOpenAutoFocus={e=>{e.preventDefault();opener.current=document.activeElement as HTMLElement;closeButton.current?.focus({preventScroll:true});}} onCloseAutoFocus={e=>{e.preventDefault();if(!document.querySelector('[role="dialog"][data-state="open"]'))opener.current?.focus({preventScroll:true});}}>
  <header><span className={styles.glyph}><EventGlyph event={event} icon={icon} size={18}/></span><h2>{event.title}</h2><Popover.Close ref={closeButton} aria-label="Close event preview"><UnigentamosIcon role="close" size={17}/></Popover.Close></header>
  <EventTiming event={event} zone={zone} showDate/>
  {place && <p className={styles.place}><UnigentamosIcon role="location" size={14}/><span>{place.name}{place.address && <small>{place.address}</small>}{place.route && <Link href={place.route}>Open place in Map</Link>}</span></p>}
  {event.system?.kind !== "birthday" && (event.system?.detail || event.description) && <p className={styles.description}>{event.system?.detail || event.description}</p>}
  {Boolean(event.participants?.length) && <div className={styles.participants} aria-label="Participants">{event.participants!.map((person,index) => <div key={index}><strong>{person.name}</strong>{person.email && <a href={`mailto:${encodeURIComponent(person.email)}`}>{person.email}</a>}</div>)}</div>}
  {objects.some(r=>r.module!=='map') && <div className={styles.objects}>{objects.filter(r=>r.module!=='map').map(ref=><EventObjectPreview key={ref.module+ref.objectId} record={ref} showName/>)}</div>}
  <footer>{event.wellnessSource ? <><button type="button" onClick={onEdit}><UnigentamosIcon role="calendar" size={14}/>Schedule</button><button type="button" onClick={onComplete}><UnigentamosIcon role={event.completed ? "discard-changes" : "check"} size={14}/>{event.completed ? "Reopen" : "Complete"}</button>{event.wellnessSource.repeating && onSkip && <button type="button" onClick={onSkip}><UnigentamosIcon role="close" size={14}/>Skip occurrence</button>}<Link prefetch={false} href={`/admin/personal/${event.wellnessSource.section}?entry=${event.wellnessSource.id}`}>Open {event.wellnessSource.section === "meals" ? "meal" : "workout"}</Link></> : event.workSource && event.ownerRef ? <Link href={event.ownerRef.route}><UnigentamosIcon role="edit" size={14}/>{event.workSource.family === "routines" ? "Open routine" : "Edit follow-up task"}</Link> : event.system ? <>{event.ownerRef && <Link href={event.ownerRef.route}>Open profile</Link>}<button type="button" onClick={onManage}><UnigentamosIcon role="sliders" size={14}/>Manage {event.system.kind==='birthday'?'birthdays':'dates'}</button></> : <button type="button" onClick={onEdit}><UnigentamosIcon role="edit" size={14}/>Edit event</button>}</footer>
 </Popover.Content></Popover.Portal></Popover.Root>;
}
