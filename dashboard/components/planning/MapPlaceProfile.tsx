"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import PlaceTagLabel from "./PlaceTagLabel";
import RelatedRecords from "./RelatedRecords";
import { hasPlaceCoordinates } from "../../lib/modules/planning/place-identity";
import type { Place } from "../../lib/modules/planning/types";
import styles from "./MapPlaceProfile.module.css";

export default function MapPlaceProfile({ place, onEdit, onClose }: { place: Place; onEdit: () => void; onClose: () => void }) {
  const pinned = hasPlaceCoordinates(place), verification = place.locationVerification;
  const reduceMotion = useReducedMotion();
  const status = !pinned ? "Needs a map pin" : verification?.precision === "area" ? "Area reference" : verification?.precision === "approximate" ? "Approximate address pin" : "Saved map pin";
  return <motion.section className={styles.card} aria-label={`${place.name} place details`} initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
    <header className={styles.heading}>
      <span className={styles.placeIcon}><UnigentamosIcon role="module-map" size={22} /></span>
      <div><span className={styles.eyebrow}>Saved place</span><h2>{place.name}</h2></div>
      <Button intent="quiet" icon="close" aria-label="Close place preview" onClick={onClose} />
    </header>
    <div className={styles.body}>
      <p className={styles.address}>{place.address || "No address added"}</p>
      <div className={styles.tags}><span className={styles.status} data-pinned={pinned}>{status}</span>{place.tags.map(tag => <PlaceTagLabel key={tag} tag={tag}/>)}</div>
      {!pinned && <p className={styles.hint}>The address is saved. Add a confirmed pin to show this place on the map.</p>}
      {verification?.precision === "area" && <p className={styles.hint}>This pin represents the area, not a specific home or business.</p>}
      {place.notes && <p className={styles.notes}>{place.notes}</p>}
      <RelatedRecords module="map" type="place" id={place.id} />
      {(verification || pinned) && <details className={styles.verification}><summary>Location details</summary>
        {verification && <><p>{verification.summary}</p><small>Reviewed {new Date(verification.checkedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small></>}
        {pinned && <p className={styles.coordinates}>{place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}</p>}
        {verification?.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Source {index + 1} · {new URL(url).hostname.replace(/^www\./, "")}</a>)}
      </details>}
    </div>
    <footer className={styles.actions}>
      <Button intent="primary" icon="edit" onClick={onEdit}>Edit place</Button>
      <Link className="work-button" href={`/admin/calendar?place=${encodeURIComponent(place.id)}`}><UnigentamosIcon role="module-calendar" size={18} />Calendar</Link>
    </footer>
  </motion.section>;
}
