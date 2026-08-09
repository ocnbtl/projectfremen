import type { HybridLogicalClock, VaultFieldValue, VaultObjectKind, VaultObjectSnapshot } from "./types";

export const VAULT_CANONICAL_RECORD_FIELD = "__unigentamosCanonicalRecordV1";
export const VAULT_PENDING_COMMAND_PREFIX = "__unigentamosPendingCommandV1:";

export type CanonicalModule = "personal-records" | "projects" | "personal-ops" | "reviews" | "finance";
export type VaultEditorControl = "text" | "textarea" | "email" | "tel" | "url";

export type VaultEditableField = {
  key: string;
  label: string;
  control: VaultEditorControl;
};

export type VaultCanonicalRecordMetadata = {
  format: "unigentamos-canonical-record-v1";
  canonicalId: string;
  module: CanonicalModule;
  collection: string;
  recordId: string;
  sourceUpdatedAt: string | null;
  route: string;
  editableFields: VaultEditableField[];
};

export type VaultPendingCanonicalCommand = {
  format: "unigentamos-canonical-command-v1";
  commandId: string;
  operation: "create" | "update";
  canonicalId: string;
  baseUpdatedAt: string | null;
  baseFields: Record<string, VaultFieldValue>;
  patch: Record<string, VaultFieldValue>;
  queuedAt: string;
};

const FIELD = (key: string, label: string, control: VaultEditorControl = "text"): VaultEditableField => ({ key, label, control });

export function editableFieldsFor(module: CanonicalModule, collection: string): VaultEditableField[] {
  if (module === "personal-records") {
    if (collection === "person" || collection === "org") return [
      FIELD("title", collection === "org" ? "Organization" : "Name"),
      FIELD("profile.primaryEmail", "Email", "email"),
      FIELD("profile.phoneNumber", "Phone", "tel"),
      FIELD("profile.livesIn", "Location"),
      FIELD("body", "Context", "textarea")
    ];
    if (collection === "resource") return [FIELD("title", "Title"), FIELD("url", "URL", "url"), FIELD("body", "Context", "textarea")];
    if (collection === "file") return [FIELD("title", "Title"), FIELD("body", "Description", "textarea")];
    return [FIELD("title", "Title"), FIELD("body", collection === "note" ? "Note" : "Details", "textarea")];
  }
  if (module === "projects") {
    if (collection === "projects") return [FIELD("name", "Project name"), FIELD("description", "Description", "textarea"), FIELD("objective", "Objective", "textarea")];
    if (collection === "milestones") return [FIELD("title", "Milestone"), FIELD("description", "Description", "textarea")];
    if (collection === "blockers") return [FIELD("title", "Blocker"), FIELD("condition", "What is blocked", "textarea")];
    if (collection === "links") return [FIELD("projectSpecificNote", "Project note", "textarea")];
  }
  if (module === "personal-ops") {
    if (["goals", "decisions", "obligations", "followUps"].includes(collection)) {
      const detail = collection === "goals" ? "outcome" : collection === "decisions" ? "question" : collection === "obligations" ? "consequence" : "context";
      return [FIELD("title", "Title"), FIELD("description", "Description", "textarea"), FIELD(detail, detail[0].toUpperCase() + detail.slice(1), "textarea")];
    }
    if (collection === "routines" || collection === "templates") return [FIELD("title", "Title"), FIELD("summary", "Summary", "textarea")];
    if (collection === "captures") return [FIELD("title", "Title")];
  }
  if (module === "reviews" && collection === "runs") return [
    FIELD("summary.summary", "Summary", "textarea"),
    FIELD("summary.wins", "Wins", "textarea"),
    FIELD("summary.blockers", "Blockers", "textarea"),
    FIELD("summary.decisions", "Decisions", "textarea"),
    FIELD("summary.carryForward", "Carry forward", "textarea"),
    FIELD("summary.nextFocus", "Next focus", "textarea")
  ];
  if (module === "finance") {
    if (collection === "accounts") return [FIELD("name", "Account name"), FIELD("institution", "Institution")];
    if (collection === "transactions") return [FIELD("merchant", "Merchant"), FIELD("category", "Category"), FIELD("memo", "Memo", "textarea")];
    if (collection === "bills") return [FIELD("name", "Bill"), FIELD("category", "Category")];
    if (collection === "budgets") return [FIELD("category", "Category")];
    if (collection === "rules") return [FIELD("name", "Rule name"), FIELD("description", "Description", "textarea")];
  }
  return [];
}

export function canonicalRoute(module: CanonicalModule, collection: string, recordId: string): string {
  if (module === "personal-records") {
    if (collection === "person" || collection === "org") return `/admin/people/${encodeURIComponent(recordId)}`;
    if (collection === "note") return `/admin/notes/${encodeURIComponent(recordId)}`;
    if (collection === "resource") return `/admin/resources/${encodeURIComponent(recordId)}`;
    if (collection === "file") return `/admin/media/${encodeURIComponent(recordId)}`;
    return `/admin/personal/records/${encodeURIComponent(recordId)}`;
  }
  if (module === "projects") return `/admin/projects${collection === "projects" ? `/${encodeURIComponent(recordId)}` : ""}`;
  if (module === "personal-ops") return collection === "followUps" ? "/admin/personal/follow-ups" : `/admin/personal/${collection.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  if (module === "reviews") return `/admin/reviews/${encodeURIComponent(recordId)}`;
  return "/admin/finance";
}

export function canonicalMetadata(input: {
  module: CanonicalModule;
  collection: string;
  recordId: string;
  sourceUpdatedAt?: string | null;
}): VaultCanonicalRecordMetadata {
  return {
    format: "unigentamos-canonical-record-v1",
    canonicalId: `${input.module}:${input.collection}:${input.recordId}`,
    module: input.module,
    collection: input.collection,
    recordId: input.recordId,
    sourceUpdatedAt: input.sourceUpdatedAt || null,
    route: canonicalRoute(input.module, input.collection, input.recordId),
    editableFields: editableFieldsFor(input.module, input.collection)
  };
}

export function flattenVaultFields(value: unknown): Record<string, VaultFieldValue> {
  const source = JSON.parse(JSON.stringify(value)) as Record<string, VaultFieldValue>;
  const flattened: Record<string, VaultFieldValue> = {};
  const visit = (prefix: string, current: VaultFieldValue) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      for (const [key, nested] of Object.entries(current)) visit(prefix ? `${prefix}.${key}` : key, nested);
    } else if (prefix) flattened[prefix] = current;
  };
  for (const [key, current] of Object.entries(source)) visit(key, current);
  return flattened;
}

export function canonicalVaultFields(input: {
  module: CanonicalModule;
  collection: string;
  record: Record<string, unknown>;
}): Record<string, VaultFieldValue> {
  const recordId = typeof input.record.id === "string" ? input.record.id : "";
  if (!recordId) throw new Error("Canonical record id is required");
  const sourceUpdatedAt = typeof input.record.updatedAt === "string" ? input.record.updatedAt : null;
  return {
    sourceModule: input.module,
    sourceCollection: input.collection,
    ...flattenVaultFields(input.record),
    [VAULT_CANONICAL_RECORD_FIELD]: canonicalMetadata({
      module: input.module,
      collection: input.collection,
      recordId,
      sourceUpdatedAt
    }) as unknown as VaultFieldValue
  };
}

export function readCanonicalMetadata(fields: Record<string, VaultFieldValue>): VaultCanonicalRecordMetadata | null {
  const value = fields[VAULT_CANONICAL_RECORD_FIELD];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<VaultCanonicalRecordMetadata>;
  if (
    candidate.format !== "unigentamos-canonical-record-v1"
    || typeof candidate.canonicalId !== "string"
    || typeof candidate.module !== "string"
    || typeof candidate.collection !== "string"
    || typeof candidate.recordId !== "string"
    || typeof candidate.route !== "string"
    || !Array.isArray(candidate.editableFields)
  ) return null;
  return candidate as VaultCanonicalRecordMetadata;
}

export function pendingCommandField(commandId: string): string {
  return `${VAULT_PENDING_COMMAND_PREFIX}${commandId}`;
}

export function pendingCanonicalCommands(snapshot: VaultObjectSnapshot): Array<{
  field: string;
  command: VaultPendingCanonicalCommand;
  clock: HybridLogicalClock;
}> {
  const commands: Array<{ field: string; command: VaultPendingCanonicalCommand; clock: HybridLogicalClock }> = [];
  for (const [field, value] of Object.entries(snapshot.fields)) {
    if (!field.startsWith(VAULT_PENDING_COMMAND_PREFIX) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Partial<VaultPendingCanonicalCommand>;
    if (
      candidate.format !== "unigentamos-canonical-command-v1"
      || typeof candidate.commandId !== "string"
      || typeof candidate.canonicalId !== "string"
      || (candidate.operation !== "create" && candidate.operation !== "update")
      || !candidate.patch || typeof candidate.patch !== "object" || Array.isArray(candidate.patch)
      || !candidate.baseFields || typeof candidate.baseFields !== "object" || Array.isArray(candidate.baseFields)
    ) continue;
    commands.push({ field, command: candidate as VaultPendingCanonicalCommand, clock: snapshot.fieldClocks[field] || snapshot.hlc });
  }
  return commands;
}

export function objectKindForPersonalCollection(collection: string): VaultObjectKind {
  if (collection === "person" || collection === "org") return "contact";
  if (collection === "resource") return "resource";
  if (collection === "file") return "media";
  if (collection === "note") return "note";
  return "other";
}
