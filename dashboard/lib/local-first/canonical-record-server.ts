import { threeWayMergeText } from "./merge";
import {
  canonicalVaultFields,
  editableFieldsFor,
  objectKindForPersonalCollection,
  type CanonicalModule,
  type VaultPendingCanonicalCommand
} from "./canonical-record";
import type { VaultFieldValue, VaultObjectKind } from "./types";
import { createPersonalRecord, readPersonalRecords, updatePersonalRecord } from "../personal-records-store";
import { readProjectsObject, updateProjectsObject } from "../modules/projects/store";
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
  rules: "rule"
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
    profile
  }, { requestedId: recordId });
  const created = items.find((item) => item.id === recordId);
  if (!created) throw new Error("The new record could not be confirmed");
  return created as unknown as Record<string, unknown>;
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
  const [module, collection, ...recordParts] = command.canonicalId.split(":");
  const recordId = recordParts.join(":");
  if (!recordId || !["personal-records", "projects", "personal-ops", "reviews", "finance"].includes(module)) {
    throw new Error("Canonical record identity is invalid");
  }
  const canonicalModule = module as CanonicalModule;
  const allowed = editableFieldsFor(canonicalModule, collection).map((field) => field.key);
  if (!allowed.length || Object.keys(command.patch).some((field) => !allowed.includes(field))) {
    throw new Error("The offline change contains a field that is not editable here");
  }
  let current = await readCanonicalRecord(canonicalModule, collection, recordId);
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
