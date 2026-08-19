import { threeWayMergeText } from "./merge";
import {
  canonicalVaultFields,
  editableFieldsFor,
  objectKindForPersonalCollection,
  type CanonicalModule,
  type VaultCanonicalOwnerAction,
  type VaultPendingCanonicalCommand
} from "./canonical-record";
import type { VaultFieldValue, VaultObjectKind } from "./types";
import { createPersonalRecord, readPersonalRecords, updatePersonalRecord } from "../personal-records-store";
import { createProjectsObject, readProjectsObject, readProjectsState, updateProjectsObject } from "../modules/projects/store";
import type { ProjectObjectFamily } from "../modules/projects/types";
import {
  readPersonalOpsObject,
  readPersonalOpsSecondaryObject,
  updatePersonalOpsObject,
  updatePersonalOpsSecondaryObject
} from "../modules/personal-ops/store";
import type { PersonalOpsFamily, PersonalOpsSecondaryFamily } from "../modules/personal-ops/types";
import { readReviewRun, updateReviewRun } from "../modules/reviews/store";
import { readFinanceState, updateFinanceRecord } from "../modules/finance/store";
import { createNoteLink, readNoteLink, updateNoteLink } from "../modules/notes/links-store";
import { createNativeObjectRef } from "../native-objects/routes";
import type { ModuleId, NativeObjectRef } from "../native-objects/types";

type CanonicalMutationResult = {
  canonicalId: string;
  objectKind: VaultObjectKind;
  fields: Record<string, VaultFieldValue>;
  mergedFields: string[];
  keptNewerFields: string[];
};

const CORE_PERSONAL_OPS = new Set(["goals", "decisions", "obligations", "followUps"]);
const SECONDARY_PERSONAL_OPS = new Set(["routines", "captures", "templates"]);
const PROJECT_FAMILIES = new Set(["projects", "milestones", "blockers", "links"]);
const FINANCE_KIND: Readonly<Record<string, string>> = {
  accounts: "account",
  transactions: "transaction",
  bills: "bill",
  budgets: "budget",
  rules: "rule",
  transfers: "transfer",
  savingsMovements: "savings_movement",
  closePeriods: "close_period"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function valueEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getNested(record: Record<string, unknown>, path: string): VaultFieldValue | undefined {
  let current: unknown = record;
  for (const part of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current as VaultFieldValue | undefined;
}

function setNested(target: Record<string, unknown>, path: string, value: VaultFieldValue): void {
  const parts = path.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(current[part])) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

function mutationPatch(
  command: VaultPendingCanonicalCommand,
  current: Record<string, unknown>,
  allowed: readonly string[]
): { patch: Record<string, VaultFieldValue>; mergedFields: string[]; keptNewerFields: string[] } {
  const patch: Record<string, VaultFieldValue> = {};
  const mergedFields: string[] = [];
  const keptNewerFields: string[] = [];
  const localIsNewest = Date.parse(command.queuedAt) >= Date.parse(String(current.updatedAt || ""));
  for (const field of allowed) {
    if (!(field in command.patch)) continue;
    const base = command.baseFields[field];
    const local = command.patch[field];
    const remote = getNested(current, field);
    if (valueEqual(local, remote)) continue;
    if (valueEqual(remote, base) || valueEqual(local, base)) {
      if (!valueEqual(local, base)) patch[field] = local;
      continue;
    }
    if (typeof base === "string" && typeof local === "string" && typeof remote === "string") {
      const merged = threeWayMergeText(base, local, remote);
      if (!merged.conflict) {
        patch[field] = merged.value;
        mergedFields.push(field);
        continue;
      }
    }
    if (localIsNewest) patch[field] = local;
    else keptNewerFields.push(field);
  }
  return { patch, mergedFields, keptNewerFields };
}

async function readCanonicalRecord(module: CanonicalModule, collection: string, recordId: string): Promise<Record<string, unknown> | null> {
  if (module === "personal-records") {
    return (await readPersonalRecords()).find((item) => item.id === recordId) as unknown as Record<string, unknown> || null;
  }
  if (module === "projects" && PROJECT_FAMILIES.has(collection)) {
    return await readProjectsObject(collection as ProjectObjectFamily, recordId) as unknown as Record<string, unknown> | null;
  }
  if (module === "personal-ops" && CORE_PERSONAL_OPS.has(collection)) {
    return await readPersonalOpsObject(collection as PersonalOpsFamily, recordId) as unknown as Record<string, unknown> | null;
  }
  if (module === "personal-ops" && SECONDARY_PERSONAL_OPS.has(collection)) {
    return await readPersonalOpsSecondaryObject(collection as PersonalOpsSecondaryFamily, recordId) as unknown as Record<string, unknown> | null;
  }
  if (module === "reviews" && collection === "runs") {
    return await readReviewRun(recordId) as unknown as Record<string, unknown> | null;
  }
  if (module === "finance") {
    const state = await readFinanceState() as unknown as Record<string, unknown>;
    const rows = state[collection];
    return Array.isArray(rows)
      ? rows.find((item) => isRecord(item) && item.id === recordId) as Record<string, unknown> | undefined || null
      : null;
  }
  return null;
}

async function createPersonal(command: VaultPendingCanonicalCommand, collection: string, recordId: string): Promise<Record<string, unknown>> {
  if (!["note", "person", "org", "resource"].includes(collection)) throw new Error("This record type must be created in its full module view");
  const title = typeof command.patch.title === "string" ? command.patch.title.trim() : "";
  if (!title) throw new Error("Title or name is required");
  const profile: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(command.patch)) {
    if (field.startsWith("profile.")) setNested(profile, field.slice("profile.".length), value);
  }
  const items = await createPersonalRecord({
    domain: "notes-docs",
    title,
    className: collection,
    body: typeof command.patch.body === "string" ? command.patch.body : "",
    url: typeof command.patch.url === "string" ? command.patch.url : "",
    starred: command.patch.starred === true,
    profile
  }, { requestedId: recordId });
  const created = items.find((item) => item.id === recordId);
  if (!created) throw new Error("The new record could not be confirmed");
  return created as unknown as Record<string, unknown>;
}

function parseCanonicalIdentity(canonicalId: string): { module: CanonicalModule; collection: string; recordId: string } {
  const [module, collection, ...recordParts] = canonicalId.split(":");
  const recordId = recordParts.join(":");
  if (!recordId || !["personal-records", "projects", "personal-ops", "reviews", "finance"].includes(module)) {
    throw new Error("Canonical record identity is invalid");
  }
  return { module: module as CanonicalModule, collection, recordId };
}

function requiredActionText(value: unknown, field: string, max = 2000): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > max) throw new Error(`${field} is required and must be ${max} characters or fewer`);
  return normalized;
}

function recordLabel(record: Record<string, unknown>): string {
  const label = [record.title, record.name, record.fullName, record.label].find((value) => typeof value === "string" && value.trim());
  return typeof label === "string" ? label.trim() : String(record.id || "Record");
}

function recordArchived(module: CanonicalModule, collection: string, record: Record<string, unknown>): boolean {
  if (module === "projects" && collection === "links") return record.linkState === "removed";
  return Boolean(record.archivedAt || record.lifecycle === "archived" || record.state === "archived");
}

function personalRefModule(collection: string): ModuleId {
  if (collection === "note") return "notes";
  if (collection === "resource") return "resources";
  if (collection === "file") return "media";
  return "people";
}

function personalRefObjectType(collection: string): string {
  if (collection === "note") return "note";
  if (collection === "resource") return "resource";
  if (collection === "file") return "media_asset";
  return collection === "org" ? "organization" : "person";
}

async function canonicalNativeRef(canonicalId: string): Promise<NativeObjectRef> {
  const identity = parseCanonicalIdentity(canonicalId);
  if (identity.module === "finance") throw new Error("Finance records cannot attest to Finance evidence");
  const record = await readCanonicalRecord(identity.module, identity.collection, identity.recordId);
  if (!record || recordArchived(identity.module, identity.collection, record)) throw new Error("The relationship target is unavailable or archived");
  const module: ModuleId = identity.module === "personal-records" ? personalRefModule(identity.collection)
    : identity.module === "personal-ops" ? "personal_ops" : identity.module;
  const objectType = identity.module === "personal-records" ? personalRefObjectType(identity.collection)
    : identity.module === "projects" ? ({ projects: "project", milestones: "project_milestone", blockers: "project_blocker", links: "project_link" }[identity.collection] || "project")
      : identity.module === "reviews" ? "review_run"
        : typeof record.objectType === "string" ? record.objectType : identity.collection;
  return createNativeObjectRef({
    module,
    objectType,
    objectId: identity.recordId,
    ...(identity.module === "projects" && identity.collection !== "projects" && typeof record.projectId === "string" ? { containerObjectId: record.projectId } : {}),
    label: recordLabel(record)
  });
}

function sameRef(left: NativeObjectRef, right: NativeObjectRef): boolean {
  return left.module === right.module && left.objectType === right.objectType && left.objectId === right.objectId
    && (left.containerObjectId || "") === (right.containerObjectId || "");
}

async function applyLifecycleAction(
  command: VaultPendingCanonicalCommand,
  module: CanonicalModule,
  collection: string,
  recordId: string,
  current: Record<string, unknown>,
  action: Extract<VaultCanonicalOwnerAction, { name: "archive" | "restore" }>
): Promise<Record<string, unknown>> {
  const archived = recordArchived(module, collection, current);
  const desiredArchived = action.name === "archive";
  if (archived === desiredArchived) return current;
  const currentUpdatedAt = String(current.updatedAt || "");
  if (!currentUpdatedAt || !command.baseUpdatedAt || currentUpdatedAt !== command.baseUpdatedAt) {
    throw new Error("This record changed after the offline action was queued. Refresh before retrying.");
  }
  const reason = action.name === "archive" ? requiredActionText(action.reason, "Archive reason") : "";
  if (module === "personal-records" && (collection === "person" || collection === "org")) {
    const items = await updatePersonalRecord(recordId, {
      action: action.name,
      ...(reason ? { archiveReason: reason } : {})
    }, { expectedUpdatedAt: currentUpdatedAt });
    const updated = items.find((item) => item.id === recordId);
    if (!updated) throw new Error("The People profile could not be reloaded after its lifecycle changed");
    return updated as unknown as Record<string, unknown>;
  }
  if (module === "finance" && FINANCE_KIND[collection]) {
    const result = await updateFinanceRecord({
      kind: FINANCE_KIND[collection], id: recordId, expectedUpdatedAt: command.baseUpdatedAt, action: action.name, ...(reason ? { reason } : {})
    }, { actorId: "admin", idempotencyKey: command.commandId });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "reviews" && collection === "runs") {
    const result = await updateReviewRun(recordId, { action: action.name, ...(reason ? { reason } : {}) }, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "projects" && PROJECT_FAMILIES.has(collection)) {
    let patch: Record<string, unknown>;
    if (collection === "projects") patch = action.name === "archive"
      ? { lifecycle: "archived", archiveReason: reason, archiveConfirmed: true }
      : { lifecycle: typeof current.lifecycleBeforeArchive === "string" ? current.lifecycleBeforeArchive : "active" };
    else if (collection === "milestones") patch = action.name === "archive" ? { state: "archived", archiveReason: reason } : { state: "planned" };
    else if (collection === "blockers") patch = action.name === "archive" ? { state: "archived", archiveReason: reason } : { state: "open" };
    else patch = action.name === "archive" ? { linkState: "removed", removalReason: reason } : { linkState: "active" };
    const result = await updateProjectsObject(collection as ProjectObjectFamily, recordId, patch as never, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "personal-ops" && CORE_PERSONAL_OPS.has(collection)) {
    const result = await updatePersonalOpsObject(collection as PersonalOpsFamily, recordId, {
      lifecycle: action.name === "archive" ? "archived" : "active", ...(reason ? { archiveReason: reason } : {})
    } as never, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "personal-ops" && SECONDARY_PERSONAL_OPS.has(collection)) {
    const result = await updatePersonalOpsSecondaryObject(collection as PersonalOpsSecondaryFamily, recordId, {
      lifecycle: action.name === "archive" ? "archived" : "active",
      ...(reason ? { archiveReason: reason, archiveConfirmed: true } : { restoreConfirmed: true })
    } as never, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  throw new Error("This record type does not have a reversible archive contract");
}

async function applyLinkAction(
  module: CanonicalModule,
  collection: string,
  recordId: string,
  current: Record<string, unknown>,
  action: Extract<VaultCanonicalOwnerAction, { name: "link" }>
): Promise<Record<string, unknown>> {
  const target = await canonicalNativeRef(action.target.canonicalId);
  const currentUpdatedAt = String(current.updatedAt || "");
  if (!currentUpdatedAt) throw new Error("The record is missing its concurrency version");
  if (module === "personal-records" && collection === "note") {
    const noteRef = await canonicalNativeRef(`personal-records:note:${recordId}`);
    if (!["resources", "media"].includes(target.module)) throw new Error("Notes can link to Resources or Media from the Vault");
    await createNoteLink({ noteRef, targetRef: target, relationship: ["source", "reference", "supporting_media", "attachment", "context"].includes(action.relationship || "") ? action.relationship : "reference", provenance: "manual" }, { actorId: "admin" });
    return current;
  }
  if (module === "projects" && collection === "projects") {
    const state = await readProjectsState();
    const duplicate = state.links.find((item) => item.projectId === recordId && item.linkState !== "removed" && sameRef(item.source, target));
    if (!duplicate) await createProjectsObject("links", { projectId: recordId, source: target, relationship: "supporting_context", relationshipStrength: "normal" }, { actorId: "admin" });
    return current;
  }
  if (module === "projects" && (collection === "milestones" || collection === "blockers")) {
    const field = collection === "milestones" ? "linkedRefs" : "sourceRefs";
    const refs = Array.isArray(current[field]) ? current[field].filter((value): value is NativeObjectRef => Boolean(value && typeof value === "object")) : [];
    if (refs.some((value) => sameRef(value, target))) return current;
    const result = await updateProjectsObject(collection as ProjectObjectFamily, recordId, { [field]: [...refs, target] } as never, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "personal-ops" && (CORE_PERSONAL_OPS.has(collection) || SECONDARY_PERSONAL_OPS.has(collection))) {
    const refs = Array.isArray(current.linkedRefs) ? current.linkedRefs.filter((value): value is NativeObjectRef => Boolean(value && typeof value === "object")) : [];
    if (refs.some((value) => sameRef(value, target))) return current;
    const result = CORE_PERSONAL_OPS.has(collection)
      ? await updatePersonalOpsObject(collection as PersonalOpsFamily, recordId, { linkedRefs: [...refs, target] } as never, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" })
      : await updatePersonalOpsSecondaryObject(collection as PersonalOpsSecondaryFamily, recordId, { linkedRefs: [...refs, target] } as never, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "reviews" && collection === "runs") {
    const existing = Array.isArray(current.contextLinks) ? current.contextLinks : [];
    if (existing.some((value) => isRecord(value) && value.state !== "removed" && isRecord(value.sourceRef) && sameRef(value.sourceRef as unknown as NativeObjectRef, target))) return current;
    const result = await updateReviewRun(recordId, { action: "link_context", sourceRef: target, relationship: action.relationship || "context" }, { expectedUpdatedAt: currentUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  throw new Error("This record type does not have an owner-native relationship action in the Vault");
}

async function applyManageLinkAction(
  module: CanonicalModule,
  collection: string,
  recordId: string,
  current: Record<string, unknown>,
  action: Extract<VaultCanonicalOwnerAction, { name: "manage_link" }>
): Promise<Record<string, unknown>> {
  if (module !== "personal-records" || collection !== "note") {
    throw new Error("Link management is currently available for Notes-owned links");
  }
  const link = await readNoteLink(action.linkId);
  if (!link || link.noteRef.objectId !== recordId) throw new Error("That Note link no longer belongs to this record");
  if (action.action === "unlink") {
    await updateNoteLink(link.id, {
      action: "remove",
      reason: requiredActionText(action.reason, "Unlink reason")
    }, { expectedUpdatedAt: link.updatedAt, actorId: "admin" });
    return current;
  }
  if (action.action === "relabel") {
    await updateNoteLink(link.id, {
      action: "change_relationship",
      relationship: requiredActionText(action.relationship, "Relationship")
    }, { expectedUpdatedAt: link.updatedAt, actorId: "admin" });
    return current;
  }
  if (!action.target) throw new Error("Choose a replacement record before repairing this link");
  const targetRef = await canonicalNativeRef(action.target.canonicalId);
  await updateNoteLink(link.id, {
    action: "repair",
    targetRef,
    reason: requiredActionText(action.reason, "Repair reason")
  }, { expectedUpdatedAt: link.updatedAt, actorId: "admin" });
  return current;
}

async function applyOwnerAction(
  command: VaultPendingCanonicalCommand,
  module: CanonicalModule,
  collection: string,
  recordId: string,
  current: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const action = command.ownerAction;
  if (!action) throw new Error("The owner action is missing");
  if (action.name === "archive" || action.name === "restore") return applyLifecycleAction(command, module, collection, recordId, current, action);
  if (action.name === "link") return applyLinkAction(module, collection, recordId, current, action);
  if (action.name === "manage_link") return applyManageLinkAction(module, collection, recordId, current, action);
  if (action.name === "finance_action") {
    if (module !== "finance" || !FINANCE_KIND[collection]) throw new Error("This action is not owned by Finance");
    if (!["review_transaction", "mark_paid", "resolve_close_check", "complete_close", "reopen_close", "test_rule"].includes(action.action)) {
      throw new Error("This Finance action is not available offline");
    }
    const input: Record<string, unknown> = { ...action.input };
    let financeAction = action.action;
    if (action.action === "review_transaction") {
      if (collection !== "transactions") throw new Error("Only Finance transactions can be reviewed");
      financeAction = "update";
      input.fields = { reviewed: true };
    }
    if (action.action === "mark_paid" && typeof input.evidenceCanonicalId === "string" && input.evidenceCanonicalId) {
      input.paymentEvidenceRef = await canonicalNativeRef(input.evidenceCanonicalId);
      delete input.evidenceCanonicalId;
    }
    if (action.action === "resolve_close_check" && typeof input.evidenceCanonicalId === "string" && input.evidenceCanonicalId) {
      input.evidenceRefs = [await canonicalNativeRef(input.evidenceCanonicalId)];
      delete input.evidenceCanonicalId;
    }
    const result = await updateFinanceRecord({
      ...input,
      kind: FINANCE_KIND[collection],
      id: recordId,
      expectedUpdatedAt: command.baseUpdatedAt,
      action: financeAction
    }, { actorId: "admin", idempotencyKey: command.commandId });
    return result.item as unknown as Record<string, unknown>;
  }
  throw new Error("The owner action is unsupported");
}

async function applyUpdate(
  module: CanonicalModule,
  collection: string,
  recordId: string,
  current: Record<string, unknown>,
  patch: Record<string, VaultFieldValue>
): Promise<Record<string, unknown>> {
  if (!Object.keys(patch).length) return current;
  const expectedUpdatedAt = String(current.updatedAt || "");
  if (!expectedUpdatedAt) throw new Error("The record is missing its concurrency version");
  if (module === "personal-records") {
    const nested: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(patch)) setNested(nested, field, value);
    const items = await updatePersonalRecord(recordId, nested, { expectedUpdatedAt });
    return items.find((item) => item.id === recordId) as unknown as Record<string, unknown>;
  }
  if (module === "projects" && PROJECT_FAMILIES.has(collection)) {
    const result = await updateProjectsObject(collection as ProjectObjectFamily, recordId, patch as never, { expectedUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "personal-ops" && CORE_PERSONAL_OPS.has(collection)) {
    const result = await updatePersonalOpsObject(collection as PersonalOpsFamily, recordId, patch as never, { expectedUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "personal-ops" && SECONDARY_PERSONAL_OPS.has(collection)) {
    const result = await updatePersonalOpsSecondaryObject(collection as PersonalOpsSecondaryFamily, recordId, patch as never, { expectedUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "reviews" && collection === "runs") {
    const summary: Record<string, VaultFieldValue> = {};
    for (const [field, value] of Object.entries(patch)) {
      if (field.startsWith("summary.")) summary[field.slice("summary.".length)] = value;
    }
    const result = await updateReviewRun(recordId, { action: "update_summary", summary }, { expectedUpdatedAt, actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  if (module === "finance" && FINANCE_KIND[collection]) {
    const result = await updateFinanceRecord({
      kind: FINANCE_KIND[collection],
      id: recordId,
      expectedUpdatedAt,
      action: "update",
      fields: patch
    }, { actorId: "admin" });
    return result.item as unknown as Record<string, unknown>;
  }
  throw new Error("This record can only be changed in its full module view");
}

export async function reconcileCanonicalRecord(command: VaultPendingCanonicalCommand): Promise<CanonicalMutationResult> {
  const { module: canonicalModule, collection, recordId } = parseCanonicalIdentity(command.canonicalId);
  let current = await readCanonicalRecord(canonicalModule, collection, recordId);
  if (command.operation === "owner_action") {
    if (!current) throw new Error("Canonical record not found");
    const item = await applyOwnerAction(command, canonicalModule, collection, recordId, current);
    return {
      canonicalId: command.canonicalId,
      objectKind: canonicalModule === "personal-records" ? objectKindForPersonalCollection(collection)
        : canonicalModule === "projects" ? "project"
          : canonicalModule === "personal-ops" ? "personal_ops"
            : canonicalModule === "reviews" ? "review" : "finance",
      fields: canonicalVaultFields({ module: canonicalModule, collection, record: item }),
      mergedFields: [],
      keptNewerFields: []
    };
  }
  const allowed = editableFieldsFor(canonicalModule, collection).map((field) => field.key);
  if (!allowed.length || Object.keys(command.patch).some((field) => !allowed.includes(field))) {
    throw new Error("The offline change contains a field that is not editable here");
  }
  if (!current) {
    if (command.operation !== "create" || canonicalModule !== "personal-records") throw new Error("Canonical record not found");
    current = await createPersonal(command, collection, recordId);
  }
  const merged = mutationPatch(command, current, allowed);
  const item = command.operation === "create"
    ? current
    : await applyUpdate(canonicalModule, collection, recordId, current, merged.patch);
  return {
    canonicalId: command.canonicalId,
    objectKind: canonicalModule === "personal-records" ? objectKindForPersonalCollection(collection)
      : canonicalModule === "projects" ? "project"
        : canonicalModule === "personal-ops" ? "personal_ops"
          : canonicalModule === "reviews" ? "review" : "finance",
    fields: canonicalVaultFields({ module: canonicalModule, collection, record: item }),
    mergedFields: merged.mergedFields,
    keptNewerFields: merged.keptNewerFields
  };
}
