import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { eventObjectRefs } from "./EventObjects";
import EventGlyph from "./EventGlyph";
import EventTiming from "./EventTiming";
import EventDetail from "./EventDetail";
import EventLinksPreview from "./EventLinksPreview";
import { eventPreviewTitle } from "./calendar-presentation";
import styles from "./EventRowContent.module.css";

export default function EventRowContent({ event, available, icon, zone }: { event: EventOccurrence; available: NativeObjectRef[]; icon?: string; zone: string }) {
  const place = eventObjectRefs(event,available).find(ref => ref.module === "map")?.label;
  return <div className={styles.content}>
    <div className={styles.heading}><EventGlyph event={event} icon={icon} size={16}/><strong>{eventPreviewTitle(event)}</strong><EventLinksPreview event={event} available={available}/></div>
    <div className={styles.metadata}><span className={styles.timing}><EventTiming event={event} zone={zone}/></span>{place && <EventDetail kind="place" text={place} eventTitle={event.title} compact={false}/>}</div>
  </div>;
}
