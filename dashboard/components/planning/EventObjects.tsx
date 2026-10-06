import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./CalendarWorkspace.module.css";

/** Non-person objects complement the linked people's portraits in every event preview. */
export default function EventObjects({ event, available = [] }: { event: EventOccurrence; available?: NativeObjectRef[] }) {
  const refs = [...new Map(event.linkedRefs.filter(ref => !(ref.module === "people" && ref.objectType === "person")).map(ref => [`${ref.module}:${ref.objectType}:${ref.objectId}`, available.find(item => item.module === ref.module && item.objectType === ref.objectType && item.objectId === ref.objectId) || ref])).values()];
  const place = refs.some(ref => ref.module === "map" && ref.objectType === "place");
  const savedPlace = !place && event.placeId ? available.find(ref => ref.module === "map" && ref.objectType === "place" && ref.objectId === event.placeId) : undefined;
  if (savedPlace) refs.unshift(savedPlace);
  if (!refs.length && !event.location) return null;
  return <span className={styles.eventObjects} data-event-objects>
    {!place && !savedPlace && event.location && <span title={event.location}><UnigentamosIcon role="location" size={14} /><span>{event.location}</span></span>}
    {refs.map(ref => <span key={`${ref.module}:${ref.objectType}:${ref.objectId}`} title={ref.label}><UnigentamosIcon role={ref.module === "map" ? "location" : ref.module === "people" ? "organization" : ref.module === "projects" ? "module-projects" : ref.module === "notes" ? "notes" : "object"} size={14} /><span>{ref.label}</span></span>)}
  </span>;
}
