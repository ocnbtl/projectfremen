"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import PlaceTagLabel from "./PlaceTagLabel";
import { RelatedRecordsView, useRelatedRecords } from "./RelatedRecords";
import { EventObjectIdentity } from "./EventObjects";
import { placePinIconRole } from "../../lib/modules/planning/place-tags";
import { hasPlaceCoordinates } from "../../lib/modules/planning/place-identity";
import type { Place } from "../../lib/modules/planning/types";
import styles from "./MapPlaceProfile.module.css";

export default function MapPlaceProfile({ place, onEdit, onClose }: { place: Place; onEdit: () => void; onClose: () => void }) {
  const pinned = hasPlaceCoordinates(place);
  const reduceMotion = useReducedMotion();
  const related = useRelatedRecords("map", "place", place.id);
  // A linked person's portrait is not the identity of their home or workplace.
  const normalize = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const identity = related.items.find(({ ref }) => ref.objectType === "organization" && ref.preview?.imageUrl && normalize(ref.label) && (normalize(place.name) === normalize(ref.label) || normalize(place.name).startsWith(normalize(ref.label) + " ")))?.ref;
  return <motion.section className={styles.card} aria-label={`${place.name} place details`} initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
    <header className={styles.heading}>
      <span className={styles.placeIcon}>{identity ? <EventObjectIdentity record={identity} /> : <UnigentamosIcon role={placePinIconRole(place.tags, place.primaryTag)} size={22} />}</span>
      <div><h2 title={place.name}>{place.name}</h2></div>
      <Button intent="quiet" icon="close" aria-label="Close place preview" onClick={onClose} />
    </header>
    <div className={styles.body}>
      <p className={styles.address}><UnigentamosIcon role="location" size={16} /><span title={place.address}>{place.address || "No address added"}</span></p>
      <p className={styles.coordinates}><UnigentamosIcon role="location" candidate="current-location" size={16} /><span>{pinned ? `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}` : "No map pin yet"}</span></p>
      <div className={styles.tags}>{place.tags.map(tag => <PlaceTagLabel key={tag} tag={tag}/>)}</div>
      {place.notes && <p className={styles.notes}>{place.notes}</p>}
      <RelatedRecordsView {...related} compact hideEmpty />
    </div>
    <footer className={styles.actions}>
      <Button intent="primary" icon="edit" onClick={onEdit}>Edit place</Button>
      <Link className="work-button" href={`/admin/calendar?place=${encodeURIComponent(place.id)}`}><UnigentamosIcon role="module-calendar" size={18} />Calendar</Link>
    </footer>
  </motion.section>;
}
