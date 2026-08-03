import type { AuditEvent } from "../../native-objects/audit";
import type { MutationResult } from "../../native-objects/mutation-result";
import type { NativeObjectRef } from "../../native-objects/types";

export const NOTE_LINKS_SCHEMA_VERSION = 1 as const;

export const NOTE_LINK_RELATIONSHIPS = [
  "source",
  "reference",
  "supporting_media",
  "attachment",
  "context"
] as const;

export type NoteLinkRelationship = (typeof NOTE_LINK_RELATIONSHIPS)[number];
export type NoteLinkState = "active" | "stale" | "broken" | "removed";
export type NoteLinkProvenance =
  | "manual"
  | "legacy_candidate_promotion"
  | "resource_note_attach";

export type NoteLinkRepair = {
  previousTargetRef: NativeObjectRef;
  reason: string;
  repairedAt: string;
  repairedBy: string;
};

/**
 * Notes owns this relationship record. The linked Resource or Media object
 * keeps ownership of its URL, binary, metadata, rights, and lifecycle.
 */
export type NoteLink = {
  id: string;
  noteRef: NativeObjectRef;
  targetRef: NativeObjectRef;
  relationship: NoteLinkRelationship;
  state: NoteLinkState;
  contextNote: string;
  provenance: NoteLinkProvenance;
  linkedAt: string;
  linkedBy: string;
  updatedAt: string;
  lastKnownTargetLabel: string;
  healthNote?: string;
  healthChangedAt?: string;
  healthChangedBy?: string;
  removedAt?: string;
  removedBy?: string;
  removalReason?: string;
  stateBeforeRemoval?: Exclude<NoteLinkState, "removed">;
  lastRepair?: NoteLinkRepair;
};

export type NoteLinksState = {
  schemaVersion: typeof NOTE_LINKS_SCHEMA_VERSION;
  links: NoteLink[];
  auditEvents: AuditEvent[];
};

export type NoteLinkCreateInput = {
  noteRef: NativeObjectRef;
  targetRef: NativeObjectRef;
  relationship: NoteLinkRelationship;
  contextNote?: string;
  provenance?: NoteLinkProvenance;
};

export type NoteLinkPatch =
  | { action: "update_health"; state: "stale" | "broken"; reason: string }
  | { action: "repair"; targetRef: NativeObjectRef; reason: string }
  | { action: "change_relationship"; relationship: NoteLinkRelationship; contextNote?: string }
  | { action: "remove"; reason: string }
  | { action: "restore" };

export type NoteLinkMutationPayload = {
  item: NoteLink;
  state: NoteLinksState;
  created?: boolean;
};

export type NoteLinksMutationResult<Data> = MutationResult<Data>;

export function noteLinkTargetKey(reference: NativeObjectRef): string {
  return [
    reference.module,
    reference.objectType,
    reference.containerObjectId || "root",
    reference.objectId
  ].join(":");
}

export function sameNoteLinkTarget(left: NativeObjectRef, right: NativeObjectRef): boolean {
  return noteLinkTargetKey(left) === noteLinkTargetKey(right);
}

export function noteLinkOwnerRoute(link: Pick<NoteLink, "id" | "noteRef">): string {
  const params = new URLSearchParams({ tab: "links", link: link.id });
  return `${link.noteRef.route}?${params.toString()}`;
}
