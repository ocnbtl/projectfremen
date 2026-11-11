"use client";
import type { Place } from "../../lib/modules/planning/types";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./ProfilePlaceField.module.css";
import { useState } from "react";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import PlaceLocationFields, { type PlaceLocation } from "./PlaceLocationFields";
import { savePlanning } from "../../lib/modules/planning/repository";
import { reusablePlaces } from "../../lib/modules/planning/place-identity";
import { placePicture } from "../../lib/modules/planning/place-presentation";
import { isAreaPlace } from "../../lib/modules/planning/area-flags";

export default function ProfilePlaceField({ placeId, places, index, onSelect, onEdit, initialQuery = "" }: { placeId?: string; places: Place[]; index: number; onSelect: (place: Place) => void; onEdit: () => void; initialQuery?: string }) {
  const selected = places.find(place => place.id === placeId);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState<PlaceLocation>({});
  const [failedPicture, setFailedPicture] = useState("");
  const picture = selected && placePicture(selected);
  const savedMatches = reusablePlaces(places, draft);
  async function save() {
    setBusy(true); setError("");
    try {
      const place = await savePlanning("places", { ...draft, notes: "", tags: [], linkedRefs: [] });
      onSelect(place); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Place could not be saved."); }
    finally { setBusy(false); }
  }
  return <div className={styles.picker} data-profile-place-picker data-linked={Boolean(placeId)}>
    <SelectField searchable autoFocusSearch={false} aria-label={`Saved place ${index + 1}`} value={placeId || ""} triggerContent={<span className={styles.identity}>{picture && failedPicture !== picture ? <img src={picture} alt="" data-area={isAreaPlace(selected!)} onError={() => setFailedPicture(picture)} /> : <UnigentamosIcon role="location" size={17} />}<span>{selected?.name || (placeId ? "Linked place" : "Saved places")}</span></span>} onChange={event => { const place = places.find(row => row.id === event.target.value); if (place) onSelect(place); }}>
      <option value="">Choose a saved place</option>
      {places.map(place => <option key={place.id} value={place.id}>{place.name}{place.address && place.address !== place.name ? ` · ${place.address}` : ""}</option>)}
    </SelectField>
    {placeId && <><a className={styles.open} href={`/admin/map?selected=${encodeURIComponent(placeId)}`} aria-label={`Open ${selected?.name || "place"} in Map`} data-icon-button="compact"><UnigentamosIcon role="chevron-right" size={16} /></a><button type="button" className={styles.edit} aria-label="Change address" title="Change address" onClick={onEdit} data-icon-button="compact"><UnigentamosIcon role="edit" size={16} /></button></>}
    {selected?.address && <small>{selected.address}</small>}
    {!placeId && <WorkspaceButton icon="search" className={styles.find} aria-label="Find a place worldwide" onClick={() => { setDraft({ name: initialQuery }); setError(""); setOpen(true); }}>Find worldwide</WorkspaceButton>}
    <WorkspaceSheet open={open} onClose={() => { if (!busy) setOpen(false); }} title="Find a place" titleIcon="location" presentation="center" className={styles.sheet}>
      <fieldset disabled={busy} className={styles.form}>
        <label>Place name<input aria-label="Place name" placeholder="Exumas, Bahamas, a city or an address" value={draft.name || ""} maxLength={240} onChange={e => setDraft(current => ({ ...current, name: e.target.value }))} /></label>
        <PlaceLocationFields value={draft} onChange={patch => setDraft(current => ({ ...current, ...patch }))} />
        {!!savedMatches.length && <div className={styles.reuse}><strong>Already saved</strong>{savedMatches.map(place => <WorkspaceButton key={place.id} icon="location" onClick={() => { onSelect(place); setOpen(false); }}>Use {place.name}</WorkspaceButton>)}</div>}
        {error && <p role="alert">{error}</p>}
        <footer><span>Save in Map and select for this profile.</span><WorkspaceButton intent="primary" icon="check" busy={busy} disabled={!draft.name?.trim() || savedMatches.length > 1} onClick={() => void save()}>{savedMatches.length === 1 ? "Use saved place" : "Save and select"}</WorkspaceButton></footer>
      </fieldset>
    </WorkspaceSheet>
  </div>;
}
