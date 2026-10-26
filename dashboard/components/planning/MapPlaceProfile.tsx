"use client";
import PlaceImagePicker from "./PlaceImagePicker";
import { placeDisplayName, formatPlaceCoordinates } from "../../lib/modules/planning/place-presentation";
import { motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import PlaceTagLabel from "./PlaceTagLabel";
import { RelatedRecordsView, useRelatedRecords } from "./RelatedRecords";
import { hasPlaceCoordinates } from "../../lib/modules/planning/place-identity";
import type { Place } from "../../lib/modules/planning/types";
import styles from "./MapPlaceProfile.module.css";

export default function MapPlaceProfile({ place, picture, classification, onImageChange, onEdit, onClose }: { place: Place; picture?: string; classification?: { type: string; industry: string }; onImageChange: (image: string) => Promise<void>; onEdit: () => void; onClose: () => void }) {
  const pinned = hasPlaceCoordinates(place);
  const reduceMotion = useReducedMotion();
  const related = useRelatedRecords("map", "place", place.id);
  return <motion.section className={styles.card} aria-label={`${place.name} place details`} initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
    <header className={styles.heading}>
      <PlaceImagePicker place={place} picture={picture} onChange={onImageChange}/>
      <div><h2 title={placeDisplayName(place)}>{placeDisplayName(place)}</h2></div>
      <Button intent="quiet" icon="close" aria-label="Close place preview" onClick={onClose} />
    </header>
    <div className={styles.body}>
      <p className={styles.address}><UnigentamosIcon role="location" size={16} /><span title={place.address}>{place.address || "No address added"}</span></p>
      <p className={styles.coordinates}><UnigentamosIcon role="location" candidate="current-location" size={16} /><span>{pinned ? formatPlaceCoordinates(place.latitude, place.longitude) : "No map pin yet"}</span></p>
      <div className={styles.tags}>{place.tags.filter(tag => !classification?.type || !["organization", "school"].includes(tag.toLowerCase())).map(tag => <PlaceTagLabel key={tag} tag={tag}/>)}{Object.values(classification || {}).filter(Boolean).map(value => <span key={value}>{value}</span>)}</div>
      {place.notes && <p className={styles.notes}>{place.notes}</p>}
      <RelatedRecordsView {...related} compact hideEmpty />
    </div>
    <footer className={styles.actions}>
      <Button intent="primary" icon="edit" onClick={onEdit}>Edit place</Button>
    </footer>
  </motion.section>;
}
