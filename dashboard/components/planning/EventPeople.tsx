"use client";
import { useState } from "react";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./CalendarWorkspace.module.css";

type PreviewRef = NativeObjectRef & { preview?: { imageUrl?: string; imageUpdatedAt?: string } };
export function PersonAvatar({ person }: { person: PreviewRef }) {
  const raw = person.preview?.imageUrl || "";
  const safe = /^\/api\/people\/photos\/personal-[0-9a-f-]+$/i.test(raw) || /^https:\/\//.test(raw);
  const source = safe ? `${raw}${person.preview?.imageUpdatedAt ? `${raw.includes("?") ? "&" : "?"}v=${encodeURIComponent(person.preview.imageUpdatedAt)}` : ""}` : "";
  const [failed, setFailed] = useState("");
  return <span className={styles.personAvatar} title={person.label} aria-label={person.label} role="img">
    {source && failed !== source ? <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(source)} /> : <span aria-hidden="true">{person.label.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("")}</span>}
  </span>;
}
export default function EventPeople({ refs, available = [], limit = 3 }: { refs: NativeObjectRef[]; available?: NativeObjectRef[]; limit?: number }) {
  const people = [...new Map(refs.filter(ref => ref.module === "people" && ref.objectType === "person").map(ref => [ref.objectId, available.find(x => x.module === "people" && x.objectType === "person" && x.objectId === ref.objectId) || ref])).values()];
  if (!people.length) return null;
  return <span className={styles.eventPeople} data-event-people title={people.map(x => x.label).join(", ")}>
    {people.slice(0, limit).map(person => <PersonAvatar key={person.objectId} person={person} />)}
    {people.length > limit && <span className={styles.morePeople} aria-label={`${people.length - limit} more linked people`}>+{people.length - limit}</span>}
  </span>;
}
