"use client";
import { useEffect, useState } from "react";
import type { EventFields, Place } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { savePlanning } from "../../lib/modules/planning/repository";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import PlaceLocationFields, { type PlaceLocation } from "./PlaceLocationFields";
import styles from "./EventLocationField.module.css";

export default function EventLocationField({ fields, update, snapshot }: {
  fields: EventFields; update: <K extends keyof EventFields>(key: K, value: EventFields[K]) => void; snapshot?: PlanningSnapshot;
}) {
  const [mode, setMode] = useState(fields.placeId ? "saved" : "text"), [draft, setDraft] = useState<PlaceLocation>({ name: "", address: fields.location });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [created, setCreated] = useState<Place>();
  useEffect(() => { setMode(fields.placeId ? "saved" : "text"); }, [fields.placeId]);
  const places = [...(snapshot?.state.places || []).filter(p => !p.archivedAt), ...(created && !snapshot?.state.places.some(p => p.id === created.id) ? [created] : [])];
  function link(place: Place) {
    update("placeId", place.id); update("location", place.address || place.name);
    update("linkedRefs", [...fields.linkedRefs.filter(r => !(r.module === "map" && r.objectType === "place" && r.objectId === fields.placeId)), createNativeObjectRef({ module: "map", objectType: "place", objectId: place.id, label: place.name })].filter((r, i, rows) => rows.findIndex(x => x.module === r.module && x.objectId === r.objectId) === i));
  }
  async function create() {
    if (!draft.name?.trim()) { setError("Enter a place name."); return; }
    setBusy(true); setError("");
    try { const place = await savePlanning("places", { ...draft, tags: [], notes: "", linkedRefs: [] }); setCreated(place); link(place); setMode("saved"); }
    catch (e) { setError(e instanceof Error ? e.message : "The place could not be saved."); }
    finally { setBusy(false); }
  }
  return <section className={styles.location} aria-label="Event location">
    <div className={styles.modes} role="group" aria-label="Location type">{[["text", "Address or link"], ["saved", "Use saved place"], ["create", "Create place"]].map(([value, label]) => <button type="button" key={value} disabled={busy} aria-pressed={mode === value} onClick={() => {
      setMode(value); setError("");
      if (value === "create") setDraft(current => ({ ...current, address: fields.location }));
      if (value === "text" && fields.placeId) { update("linkedRefs", fields.linkedRefs.filter(r => !(r.module === "map" && r.objectId === fields.placeId))); update("placeId", ""); }
    }}>{label}</button>)}</div>
    {mode === "text" ? <label className={styles.address}><UnigentamosIcon role="location" size={18} /><input aria-label="Address or meeting link" placeholder="Address or meeting link" value={fields.location} onChange={e => update("location", e.target.value)} /></label>
    : mode === "saved" ? <div className={styles.saved}><UnigentamosIcon role="module-map" size={18} /><SelectField searchable autoFocusSearch={false} aria-label="Event place" value={fields.placeId || ""} onChange={e => { const place = places.find(p => p.id === e.target.value); if (place) link(place); }}><option value="">Choose a saved place</option>{places.map(place => <option value={place.id} key={place.id}>{place.name}{place.address && place.address !== place.name ? ` · ${place.address}` : ""}</option>)}</SelectField>{fields.placeId && <small>{fields.location}</small>}</div>
    : <fieldset className={styles.create} disabled={busy}><PlaceLocationFields compact leading={<label>Place name<input aria-label="Place name" value={draft.name || ""} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>} value={draft} onChange={patch => setDraft(current => ({ ...current, ...patch }))} /><Button type="button" icon="plus" busy={busy} disabled={busy} onClick={() => void create()}>Save place and link</Button><small>The place is saved to Map. Save the event when you’re ready.</small></fieldset>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
