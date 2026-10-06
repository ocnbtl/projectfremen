"use client";
import type { Place } from "../../lib/modules/planning/types";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./ProfilePlaceField.module.css";

export default function ProfilePlaceField({ placeId, places, index, onSelect, onEdit }: { placeId?: string; places: Place[]; index: number; onSelect: (place: Place) => void; onEdit: () => void }) {
  const selected = places.find(place => place.id === placeId);
  return <div className={styles.picker} data-profile-place-picker>
    <UnigentamosIcon role="module-map" size={18} />
    <SelectField searchable autoFocusSearch={false} aria-label={`Saved place ${index + 1}`} value={placeId || ""} triggerContent={<span>{selected?.name || (placeId ? "Linked place" : "Choose a saved place")}</span>} onChange={event => { const place = places.find(row => row.id === event.target.value); if (place) onSelect(place); }}>
      <option value="">Choose a saved place</option>
      {places.map(place => <option key={place.id} value={place.id}>{place.name}{place.address && place.address !== place.name ? ` · ${place.address}` : ""}</option>)}
    </SelectField>
    {placeId && <><a className={styles.open} href={`/admin/map?selected=${encodeURIComponent(placeId)}`} aria-label={`Open ${selected?.name || "place"} in Map`}><UnigentamosIcon role="chevron-right" size={16} /></a><button type="button" className={styles.edit} aria-label="Change address" title="Change address" onClick={onEdit}><UnigentamosIcon role="edit" size={16} /></button></>}
    {selected?.address && <small>{selected.address}</small>}
  </div>;
}
