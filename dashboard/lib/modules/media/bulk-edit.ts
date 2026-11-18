import { cleanMediaLabels, mergeMediaLinks } from "./organization";
import { normalizeMediaProfile, type MediaProfile } from "./profile";
import type { NativeObjectRef } from "../../native-objects/types";

export type BulkMode = "add" | "remove";
export type MediaBulkEdit = {
  tags: { mode: BulkMode; values: string[] };
  purposes: { mode: BulkMode; values: string[] };
  links: { mode: BulkMode; values: NativeObjectRef[] };
};
const folded = (value: string) => value.trim().toLocaleLowerCase();
const linkKey = (ref: NativeObjectRef) => `${ref.module}:${ref.objectType}:${ref.objectId}`;
function labels(current: string[], change: MediaBulkEdit["tags"]) {
  const chosen = cleanMediaLabels(change.values);
  if (!chosen.length) return current;
  if (change.mode === "remove") return current.filter(value => !chosen.some(item => folded(item) === folded(value)));
  return cleanMediaLabels([...current, ...chosen].filter((value, index, all) => all.findIndex(item => folded(item) === folded(value)) === index));
}

/** Only organization fields change. Originals, locations and individual descriptions stay intact. */
export function applyMediaBulkEdit(profile: MediaProfile, change: MediaBulkEdit, selfIds: string[] = []): MediaProfile {
  const tags = labels(profile.tags || [], change.tags);
  const purposes = labels(profile.purposes || [], change.purposes);
  const links = change.links.values.filter(ref => !(ref.module === "media" && selfIds.includes(ref.objectId)));
  const linkedRefs = change.links.mode === "remove"
    ? profile.linkedRefs.filter(ref => !links.some(item => linkKey(item) === linkKey(ref)))
    : mergeMediaLinks([...profile.linkedRefs, ...links]);
  if (JSON.stringify(tags) === JSON.stringify(profile.tags || []) &&
      JSON.stringify(purposes) === JSON.stringify(profile.purposes || []) &&
      JSON.stringify(linkedRefs) === JSON.stringify(profile.linkedRefs)) return profile;
  return normalizeMediaProfile({ ...profile, tags, purposes, linkedRefs })!;
}
