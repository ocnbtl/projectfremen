"use client";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { EventFields, Place } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { savePlanning } from "../../lib/modules/planning/repository";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import PlaceLocationFields, { type PlaceLocation } from "./PlaceLocationFields";
import styles from "./EventLocationField.module.css";

export default function EventLocationField({ fields, update, snapshot }: {
  fields: EventFields; update: <K extends keyof EventFields>(key: K, value: EventFields[K]) => void; snapshot?: PlanningSnapshot;
}) {
  const [placeSide,setPlaceSide]=useState<"left" | "bottom">("bottom");
  const [panel, setPanel] = useState<"saved" | "create" | null>(null), [query,setQuery]=useState("");
  const [draft, setDraft] = useState<PlaceLocation>({ name: "", address: fields.location });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [created, setCreated] = useState<Place>();
  const root=useRef<HTMLElement>(null);
  const places = [...(snapshot?.state.places || []).filter(p => !p.archivedAt), ...(created && !snapshot?.state.places.some(p => p.id === created.id) ? [created] : [])];
  function link(place: Place) {
    update("placeId", place.id); update("location", place.address || place.name);
    update("linkedRefs", [...fields.linkedRefs.filter(r => !(r.module === "map" && r.objectType === "place" && r.objectId === fields.placeId)), createNativeObjectRef({ module: "map", objectType: "place", objectId: place.id, label: place.name })].filter((r, i, rows) => rows.findIndex(x => x.module === r.module && x.objectId === r.objectId) === i));
    setPanel(null);
  }
  async function create() {
    if (!draft.name?.trim()) { setError("Enter a place name."); return; }
    setBusy(true); setError("");
    try { const place = await savePlanning("places", { ...draft, tags: [], notes: "", linkedRefs: [] }); setCreated(place); link(place); }
    catch (e) { setError(e instanceof Error ? e.message : "The place could not be saved."); }
    finally { setBusy(false); }
  }
  return <section ref={root} className={styles.location} aria-label="Event location">
    <span className={styles.label}>Location</span>
    <div className={styles.address} data-field-shell>
      <UnigentamosIcon role="location" size={18} />
      <input aria-label="Address or meeting link" placeholder="Address or meeting link" value={fields.location} onChange={e => {
        update("location",e.target.value);
        if(fields.placeId) {update("linkedRefs",fields.linkedRefs.filter(r => !(r.module === "map" && r.objectId === fields.placeId))); update("placeId","");}
      }} />
      {(["saved","create"] as const).map(mode => <Popover.Root key={mode} open={panel === mode} onOpenChange={open => { if(busy) return; if(open) setPlaceSide(window.matchMedia("(min-width:761px)").matches ? "left" : "bottom"); setPanel(open ? mode : null); setError(""); if(open && mode === "create") setDraft(current => ({...current,address:fields.location})); }}>
        <Popover.Trigger asChild><button type="button" aria-label={mode === "saved" ? "Choose saved place" : "Create place"} title={mode === "saved" ? "Choose saved place" : "Create place"} disabled={busy}><UnigentamosIcon role={mode === "saved" ? "resource" : "plus"} candidate={mode === "saved" ? "bookmark" : undefined} size={18} /></button></Popover.Trigger>
        <Popover.Portal container={root.current?.closest<HTMLElement>('[role="dialog"]') || undefined}>
          <Popover.Content className={`${styles.popover} work-form`} side={mode === "create" ? placeSide : "bottom"} align={mode === "create" && placeSide === "left" ? "start" : "end"} sideOffset={8} collisionPadding={14} collisionBoundary={root.current?.closest<HTMLElement>('[role="dialog"]')} aria-label={mode === "saved" ? "Saved places" : "Create place"} onEscapeKeyDown={e => e.stopImmediatePropagation()} onOpenAutoFocus={e => e.preventDefault()}>
            <header><strong><UnigentamosIcon role={mode === "saved" ? "resource" : "location"} candidate={mode === "saved" ? "bookmark" : undefined} size={18} />{mode === "saved" ? "Saved places" : "Create place"}</strong><Popover.Close asChild><button type="button" aria-label="Close places" disabled={busy}><UnigentamosIcon role="close" size={16} /></button></Popover.Close></header>
            {mode === "saved" ? <><input type="search" aria-label="Search saved places" placeholder="Search places" onKeyDown={e => { if(e.key === "Enter") e.preventDefault(); }} value={query} onChange={e => setQuery(e.target.value)} /><div className={styles.places}>{places.filter(p => `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase())).map(place => <button type="button" key={place.id} onClick={() => link(place)} aria-pressed={fields.placeId === place.id}><UnigentamosIcon role="location" size={18} /><span><strong>{place.name}</strong>{place.address && place.address !== place.name && <small>{place.address}</small>}</span>{fields.placeId === place.id && <UnigentamosIcon role="check" size={16} />}</button>)}{!places.some(p => `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase())) && <p>No matching places.</p>}</div></>
            : <fieldset disabled={busy} className={styles.create} onKeyDown={e => { if(e.key === "Enter" && e.target instanceof HTMLInputElement) {e.preventDefault(); if(!busy) void create();} }}><PlaceLocationFields compact leading={<label>Place name<input aria-label="Place name" value={draft.name || ""} onChange={e => setDraft({...draft,name:e.target.value})} /></label>} value={draft} onChange={patch => setDraft(current => ({...current,...patch}))} />{error && <p role="alert">{error}</p>}<footer><small>Saved to Map and linked to this event.</small><Button type="button" intent="primary" busy={busy} onClick={() => void create()}>Create and link</Button></footer></fieldset>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>)}
    </div>
  </section>;
}
