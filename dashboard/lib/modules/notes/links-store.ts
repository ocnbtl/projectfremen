import { readJsonFile, writeJsonFile } from "../../file-store";
import { createAuditEvent, type AuditEvent, type AuditSnapshot } from "../../native-objects/audit";
import type { MutationErrorCode } from "../../native-objects/mutation-result";
import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import {
  NOTE_LINK_RELATIONSHIPS,
  NOTE_LINKS_SCHEMA_VERSION,
  noteLinkTargetKey,
  sameNoteLinkTarget,
  type NoteLink,
  type NoteLinkCreateInput,
  type NoteLinkPatch,
  type NoteLinkProvenance,
  type NoteLinkRelationship,
  type NoteLinksState
} from "./links-types";

const FILE_NAME = "note-links.json";
const MAX_AUDIT_EVENTS = 2000;
let mutationQueue: Promise<void> = Promise.resolve();

export class NoteLinksStoreError extends Error {
  readonly code: MutationErrorCode;
  readonly status: number;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;

  constructor(
    code: MutationErrorCode,
    message: string,
    options: { status?: number; fieldErrors?: Readonly<Record<string, readonly string[]>> } = {}
  ) {
    super(message);
    this.name = "NoteLinksStoreError";
    this.code = code;
    this.status = options.status ?? (
      code === "not_found" ? 404 : code === "stale" || code === "conflict" ? 409 : 400
    );
    this.fieldErrors = options.fieldErrors;
  }
}

export type NoteLinkCreateResult = {
  item: NoteLink;
  state: NoteLinksState;
  created: boolean;
  auditEvent?: AuditEvent;
};

export type NoteLinkUpdateResult = {
  item: NoteLink;
  state: NoteLinksState;
  auditEvent: AuditEvent;
};

export function createEmptyNoteLinksState(): NoteLinksState {
  return { schemaVersion: NOTE_LINKS_SCHEMA_VERSION, links: [], auditEvents: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validation(message: string, field?: string): never {
  throw new NoteLinksStoreError("validation", message, {
    status: 400,
    ...(field ? { fieldErrors: { [field]: [message] } } : {})
  });
}

function requiredText(value: unknown, field: string, maxLength = 4000): string {
  if (typeof value !== "string") validation(`${field} is required`, field);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) validation(`${field} is required`, field);
  if (normalized.length > maxLength) {
    validation(`${field} must be ${maxLength} characters or fewer`, field);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength = 4000): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") validation(`${field} must be text`, field);
  const normalized = value.replace(/\u0000/g, "").trim();
  if (normalized.length > maxLength) {
    validation(`${field} must be ${maxLength} characters or fewer`, field);
  }
  return normalized;
}

function relationship(value: unknown, field = "relationship"): NoteLinkRelationship {
  const normalized = requiredText(value, field, 80);
  if (!NOTE_LINK_RELATIONSHIPS.includes(normalized as NoteLinkRelationship)) {
    validation(`${field} has an unsupported value`, field);
  }
  return normalized as NoteLinkRelationship;
}

function provenance(value: unknown): NoteLinkProvenance {
  if (value === undefined || value === null || value === "") return "manual";
  const normalized = requiredText(value, "provenance", 80);
  if (!["manual", "legacy_candidate_promotion", "resource_note_attach"].includes(normalized)) {
    validation("provenance has an unsupported value", "provenance");
  }
  return normalized as NoteLinkProvenance;
}

function normalizeNativeRef(value: unknown, field: string): NativeObjectRef {
  if (!isRecord(value)) validation(`${field} must be a native object reference`, field);
  const module = requiredText(value.module, `${field}.module`, 40);
  const objectType = requiredText(value.objectType, `${field}.objectType`, 80);
  const objectId = requiredText(value.objectId, `${field}.objectId`, 240);
  const label = requiredText(value.label, `${field}.label`, 500);
  const containerObjectId = optionalText(value.containerObjectId, `${field}.containerObjectId`, 240);
  const versionId = optionalText(value.versionId, `${field}.versionId`, 240);

  if (field === "noteRef" && (module !== "notes" || objectType !== "note")) {
    validation("noteRef must reference a Notes-owned Note", field);
  }
  if (field === "targetRef") {
    const supported =
      (module === "resources" && objectType === "resource") ||
      (module === "media" && objectType === "media_asset");
    if (!supported) {
      validation("targetRef must reference a Resource or Media asset", field);
    }
  }

  return createNativeObjectRef({
    module: module as "notes" | "resources" | "media",
    objectType,
    objectId,
    label,
    ...(containerObjectId ? { containerObjectId } : {}),
    ...(versionId ? { versionId } : {})
  });
}

function normalizeCreateInput(value: unknown): NoteLinkCreateInput {
  if (!isRecord(value)) validation("input must be an object", "input");
  return {
    noteRef: normalizeNativeRef(value.noteRef, "noteRef"),
    targetRef: normalizeNativeRef(value.targetRef, "targetRef"),
    relationship: relationship(value.relationship),
    contextNote: optionalText(value.contextNote, "contextNote"),
    provenance: provenance(value.provenance)
  };
}

function assertState(value: unknown): NoteLinksState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== NOTE_LINKS_SCHEMA_VERSION ||
    !Array.isArray(value.links) ||
    !Array.isArray(value.auditEvents)
  ) {
    throw new NoteLinksStoreError(
      "validation",
      "The persisted NoteLink state is incompatible with this application version.",
      { status: 500 }
    );
  }
  return value as unknown as NoteLinksState;
}

function withMutationLock<Result>(task: () => Promise<Result>): Promise<Result> {
  const previous = mutationQueue;
  let resolveCurrent: () => void = () => undefined;
  mutationQueue = new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });
  return previous
    .catch(() => undefined)
    .then(task)
    .finally(resolveCurrent);
}

function monotonicTimestamp(previous?: string, preferred = new Date().toISOString()): string {
  if (!previous || preferred > previous) return preferred;
  return new Date(Date.parse(previous) + 1).toISOString();
}

function snapshot(value: NoteLink | null): AuditSnapshot {
  return value ? JSON.parse(JSON.stringify(value)) as AuditSnapshot : null;
}

function linkAuditRef(link: NoteLink): NativeObjectRef {
  return createNativeObjectRef({
    module: "notes",
    objectType: "note_link",
    objectId: link.id,
    containerObjectId: link.noteRef.objectId,
    label: `${link.noteRef.label} -> ${link.lastKnownTargetLabel}`
  });
}

function auditEvent(
  link: NoteLink,
  action: string,
  actorId: string,
  occurredAt: string,
  before: NoteLink | null
): AuditEvent {
  return createAuditEvent({
    id: `audit-${crypto.randomUUID()}`,
    object: linkAuditRef(link),
    action,
    actorId,
    occurredAt,
    before: snapshot(before),
    after: snapshot(link),
    source: "user"
  });
}

function appendAudit(state: NoteLinksState, event: AuditEvent): AuditEvent[] {
  return [...state.auditEvents, event].slice(-MAX_AUDIT_EVENTS);
}

function sameNote(left: NativeObjectRef, right: NativeObjectRef): boolean {
  return sameNoteLinkTarget(left, right);
}

export async function readNoteLinksState(): Promise<NoteLinksState> {
  return assertState(await readJsonFile<unknown>(FILE_NAME, createEmptyNoteLinksState()));
}

export async function readNoteLink(id: string): Promise<NoteLink | null> {
  const state = await readNoteLinksState();
  return state.links.find((link) => link.id === id) || null;
}

export async function createNoteLink(
  rawInput: unknown,
  options: { actorId?: string } = {}
): Promise<NoteLinkCreateResult> {
  return withMutationLock(async () => {
    const input = normalizeCreateInput(rawInput);
    const state = await readNoteLinksState();
    const exact = state.links.find(
      (link) => sameNote(link.noteRef, input.noteRef) && sameNoteLinkTarget(link.targetRef, input.targetRef)
    );
    if (exact && exact.state !== "removed") {
      return { item: exact, state, created: false };
    }
    if (exact?.state === "removed") {
      throw new NoteLinksStoreError(
        "conflict",
        "This exact NoteLink was removed. Restore its history instead of creating a duplicate.",
        { status: 409 }
      );
    }

    const actorId = options.actorId || "admin";
    const now = new Date().toISOString();
    const item: NoteLink = {
      id: `note-link-${crypto.randomUUID()}`,
      noteRef: input.noteRef,
      targetRef: input.targetRef,
      relationship: input.relationship,
      state: "active",
      contextNote: input.contextNote || "",
      provenance: input.provenance || "manual",
      linkedAt: now,
      linkedBy: actorId,
      updatedAt: now,
      lastKnownTargetLabel: input.targetRef.label
    };
    const event = auditEvent(item, "note_link.created", actorId, now, null);
    const nextState: NoteLinksState = {
      ...state,
      links: [...state.links, item],
      auditEvents: appendAudit(state, event)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, state: nextState, created: true, auditEvent: event };
  });
}

function normalizePatch(value: unknown): NoteLinkPatch {
  if (!isRecord(value)) validation("patch must be an object", "patch");
  const action = requiredText(value.action, "patch.action", 80);
  if (action === "update_health") {
    const state = requiredText(value.state, "patch.state", 40);
    if (state !== "stale" && state !== "broken") {
      validation("patch.state must be stale or broken", "patch.state");
    }
    return { action, state, reason: requiredText(value.reason, "patch.reason", 4000) };
  }
  if (action === "repair") {
    return {
      action,
      targetRef: normalizeNativeRef(value.targetRef, "targetRef"),
      reason: requiredText(value.reason, "patch.reason", 4000)
    };
  }
  if (action === "change_relationship") {
    return {
      action,
      relationship: relationship(value.relationship, "patch.relationship"),
      contextNote: optionalText(value.contextNote, "patch.contextNote")
    };
  }
  if (action === "remove") {
    return { action, reason: requiredText(value.reason, "patch.reason", 4000) };
  }
  if (action === "restore") return { action };
  validation("patch.action is unsupported", "patch.action");
}

export async function updateNoteLink(
  id: string,
  rawPatch: unknown,
  options: { expectedUpdatedAt: string; actorId?: string }
): Promise<NoteLinkUpdateResult> {
  return withMutationLock(async () => {
    const patch = normalizePatch(rawPatch);
    const state = await readNoteLinksState();
    const index = state.links.findIndex((link) => link.id === id);
    if (index < 0) {
      throw new NoteLinksStoreError("not_found", "NoteLink not found", { status: 404 });
    }
    const before = state.links[index];
    if (!options.expectedUpdatedAt || before.updatedAt !== options.expectedUpdatedAt) {
      throw new NoteLinksStoreError(
        "stale",
        "This NoteLink changed after it was loaded. Refresh before retrying.",
        { status: 409 }
      );
    }
    if (before.state === "removed" && patch.action !== "restore") {
      throw new NoteLinksStoreError(
        "conflict",
        "Removed NoteLinks are read-only until restored.",
        { status: 409 }
      );
    }
    if (before.state !== "removed" && patch.action === "restore") {
      throw new NoteLinksStoreError("conflict", "Only removed NoteLinks can be restored.", { status: 409 });
    }

    const actorId = options.actorId || "admin";
    const now = monotonicTimestamp(before.updatedAt);
    const item: NoteLink = JSON.parse(JSON.stringify(before)) as NoteLink;
    let action = "note_link.updated";

    if (patch.action === "update_health") {
      item.state = patch.state;
      item.healthNote = patch.reason;
      item.healthChangedAt = now;
      item.healthChangedBy = actorId;
      action = `note_link.reported_${patch.state}`;
    } else if (patch.action === "repair") {
      if (before.state !== "stale" && before.state !== "broken") {
        throw new NoteLinksStoreError(
          "conflict",
          "Only stale or broken NoteLinks require repair.",
          { status: 409 }
        );
      }
      const duplicate = state.links.find(
        (candidate) =>
          candidate.id !== before.id &&
          candidate.state !== "removed" &&
          sameNote(candidate.noteRef, before.noteRef) &&
          sameNoteLinkTarget(candidate.targetRef, patch.targetRef)
      );
      if (duplicate) {
        throw new NoteLinksStoreError(
          "conflict",
          "This Note already has an active link to that exact target.",
          { status: 409 }
        );
      }
      item.lastRepair = {
        previousTargetRef: before.targetRef,
        reason: patch.reason,
        repairedAt: now,
        repairedBy: actorId
      };
      item.targetRef = patch.targetRef;
      item.lastKnownTargetLabel = patch.targetRef.label;
      item.state = "active";
      item.healthNote = undefined;
      item.healthChangedAt = now;
      item.healthChangedBy = actorId;
      action = "note_link.repaired";
    } else if (patch.action === "change_relationship") {
      item.relationship = patch.relationship;
      item.contextNote = patch.contextNote || "";
      action = "note_link.relationship_changed";
    } else if (patch.action === "remove") {
      item.stateBeforeRemoval = before.state === "removed" ? "active" : before.state;
      item.state = "removed";
      item.removedAt = now;
      item.removedBy = actorId;
      item.removalReason = patch.reason;
      action = "note_link.removed";
    } else if (patch.action === "restore") {
      item.state = before.stateBeforeRemoval || "active";
      item.stateBeforeRemoval = undefined;
      item.removedAt = undefined;
      item.removedBy = undefined;
      item.removalReason = undefined;
      action = "note_link.restored";
    }

    item.updatedAt = now;
    const event = auditEvent(item, action, actorId, now, before);
    const links = [...state.links];
    links[index] = item;
    const nextState: NoteLinksState = {
      ...state,
      links,
      auditEvents: appendAudit(state, event)
    };
    await writeJsonFile(FILE_NAME, nextState);
    return { item, state: nextState, auditEvent: event };
  });
}

export function noteLinkIdentity(link: NoteLink): string {
  return `${noteLinkTargetKey(link.noteRef)}:${noteLinkTargetKey(link.targetRef)}`;
}
