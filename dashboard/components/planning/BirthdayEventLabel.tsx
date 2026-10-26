"use client";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import { useCalendarDetails } from "./CalendarDisplayPreferences";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { EventObjectPreview } from "./EventLinksPreview";
import EventGlyph from "./EventGlyph";
import { eventPreviewTitle } from "./calendar-presentation";
import { eventObjectRefs } from "./EventObjects";
import styles from "./BirthdayEventLabel.module.css";

export default function BirthdayEventLabel({event,available}:{event:EventOccurrence;available:NativeObjectRef[]}) {
  const details = useCalendarDetails();
  const words=eventPreviewTitle(event).split(/\s+/),first=words.shift(),rest=words.join(" ");
  const person=eventObjectRefs(event,available).find(ref=>ref.objectType==="person");
  return <span className={styles.identity} data-birthday-label>
    <span className={styles.first}><EventGlyph event={event} size={13}/><span>{first}</span></span>
    <span className={styles.last}><span>{rest}</span>{person&&<EventObjectPreview record={person} iconOnly={!details.people}/>}</span>
  </span>;
}
