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

/** Names belong in the disclosure, leaving compact event cards room for their title. */
export default function EventLinksPreview({ event, available, excludePlaces = false }: { event: EventOccurrence; available: NativeObjectRef[]; excludePlaces?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null), [width,setWidth] = useState(0);
  const refs = eventObjectRefs(event,available).filter(ref => !excludePlaces || ref.module !== "map");
  useLayoutEffect(() => {
    const card = trigger.current?.closest("[data-morph-event]");
    if (!card) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(card); return () => observer.disconnect();
  }, [refs.length]);
  if (!refs.length) return null;
  const counted = refs.length > (width >= 420 ? 3 : width >= 300 ? 2 : 1);
  const identity = (ref: NativeObjectRef) => ref.objectType === "person" ? <PersonAvatar person={ref}/> : <EventObjectIdentity record={ref}/>;
  return <Popover.Root><Popover.Trigger asChild><button ref={trigger} type="button" className={styles.trigger} data-event-links data-counted={counted || undefined} aria-label={`Linked objects for ${event.title}: ${refs.map(ref => ref.label).join(", ")}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    {counted ? <><UnigentamosIcon role="object" size={14}/><span>{refs.length}</span></> : refs.map(ref => <span key={`${ref.module}:${ref.objectId}`} title={ref.label}>{identity(ref)}</span>)}
  </button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.panel} sideOffset={6} collisionPadding={10} aria-label={`Objects linked to ${event.title}`} onOpenAutoFocus={e => e.preventDefault()}>
    <header><UnigentamosIcon role="object" size={16}/><strong>Linked objects</strong><Popover.Close aria-label="Close linked objects"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
    <div className={styles.list}>{refs.map(ref => <div key={`${ref.module}:${ref.objectId}`} className={styles.row}>{identity(ref)}{ref.route ? <Link href={ref.route}>{ref.label}</Link> : <span>{ref.label}</span>}</div>)}</div>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
