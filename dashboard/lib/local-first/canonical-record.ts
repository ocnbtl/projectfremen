import type { HybridLogicalClock, VaultFieldValue, VaultObjectKind, VaultObjectSnapshot } from "./types";

export const VAULT_CANONICAL_RECORD_FIELD = "__unigentamosCanonicalRecordV1";
export const VAULT_CANONICAL_RELATIONSHIPS_FIELD = "__unigentamosCanonicalRelationshipsV1";
export const VAULT_PENDING_COMMAND_PREFIX = "__unigentamosPendingCommandV1:";

export type CanonicalModule = "personal-records" | "projects" | "personal-ops" | "reviews" | "finance";
export type VaultEditorControl = "text" | "textarea" | "email" | "tel" | "url" | "date" | "month" | "number" | "select" | "checkbox" | "tags";

export type VaultEditorOption = {
  value: string;
  label: string;
};

export type VaultEditableField = {
  key: string;
  label: string;
  control: VaultEditorControl;
  group: "Essentials" | "Details" | "Planning" | "Classification";
  required?: boolean;
  help?: string;
  options?: VaultEditorOption[];
  step?: number;
};

export type VaultCanonicalRelationship = {
  linkId: string;
  targetCanonicalId: string;
  targetLabel: string;
  relationship: string;
  direction: "outgoing" | "incoming";
  state?: string;
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
  operation: "create" | "update" | "owner_action";
  canonicalId: string;
  baseUpdatedAt: string | null;
  baseFields: Record<string, VaultFieldValue>;
  patch: Record<string, VaultFieldValue>;
  ownerAction?: VaultCanonicalOwnerAction;
  queuedAt: string;
};

export type VaultCanonicalTarget = {
  canonicalId: string;
  label: string;
};

export type VaultCanonicalOwnerAction =
  | { name: "archive"; reason: string }
  | { name: "restore" }
  | { name: "link"; target: VaultCanonicalTarget; relationship?: string }
  | { name: "manage_link"; linkId: string; action: "unlink" | "relabel" | "repair"; relationship?: string; target?: VaultCanonicalTarget; reason?: string }
  | { name: "finance_action"; action: string; input: Record<string, VaultFieldValue> };

const FIELD = (
  key: string,
  label: string,
  control: VaultEditorControl = "text",
  options: Omit<VaultEditableField, "key" | "label" | "control"> = { group: "Details" }
): VaultEditableField => ({ key, label, control, ...options });

const OPTIONS = (...values: string[]): VaultEditorOption[] => values.map((value) => ({
  value,
  label: value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
}));

const PRIORITY_OPTIONS = OPTIONS("low", "medium", "high", "critical");
const ENTITY_SCOPE_OPTIONS = OPTIONS("personal", "business");
const PERSONAL_STATUS_OPTIONS = OPTIONS("idea", "draft", "active", "completed", "blocked", "inactive", "next");

export function editableFieldsFor(module: CanonicalModule, collection: string): VaultEditableField[] {
  if (module === "personal-records") {
    if (collection === "person" || collection === "org") return [
      FIELD("title", collection === "org" ? "Organization" : "Name", "text", { group: "Essentials", required: true }),
      FIELD("profile.primaryEmail", "Primary email", "email", { group: "Essentials" }),
      FIELD("profile.phoneNumber", "Phone", "tel", { group: "Essentials" }),
      FIELD("profile.phoneCountryCode", "Phone country code", "text", { group: "Classification", help: "Defaults to +1 unless this contact uses another country code." }),
      FIELD("profile.livesIn", "Location", "text", { group: "Essentials" }),
      FIELD("profile.primaryOccupation", "Occupation", "text", { group: "Details" }),
      FIELD("profile.primaryEmployer", "Employer", "text", { group: "Details" }),
      FIELD("profile.website", "Website", "url", { group: "Details" }),
      FIELD("profile.linkedin", "LinkedIn", "url", { group: "Details" }),
      FIELD("profile.instagram", "Instagram", "url", { group: "Details" }),
      FIELD("profile.tiktok", "TikTok", "url", { group: "Details" }),
      FIELD("profile.x", "X", "url", { group: "Details" }),
      FIELD("subjects", "Groups", "tags", { group: "Classification", help: "A contact can belong to more than one group." }),
      FIELD("profile.birthday", "Birthday", "date", { group: "Planning" }),
      FIELD("profile.lastContact", "Last contact", "date", { group: "Planning" }),
      FIELD("profile.nextContact", "Next contact", "date", { group: "Planning" }),
      FIELD("body", "Context", "textarea", { group: "Details", help: "General context shared with the People view." }),
      FIELD("profile.notes", "Private notes", "textarea", { group: "Details" })
    ];
    if (collection === "resource") return [
      FIELD("title", "Title", "text", { group: "Essentials", required: true }),
      FIELD("url", "URL", "url", { group: "Essentials" }),
      FIELD("body", "Context", "textarea", { group: "Details" }),
      FIELD("status", "Status", "select", { group: "Planning", options: PERSONAL_STATUS_OPTIONS }),
      FIELD("areas", "Areas", "tags", { group: "Classification", help: "Separate entries with commas." }),
      FIELD("subjects", "Subjects", "tags", { group: "Classification", help: "Separate entries with commas." }),
      FIELD("projects", "Projects", "tags", { group: "Classification", help: "Project names or IDs; separate with commas." })
    ];
    if (collection === "file") return [
      FIELD("title", "Title", "text", { group: "Essentials", required: true }),
      FIELD("body", "Description", "textarea", { group: "Details" }),
      FIELD("status", "Status", "select", { group: "Planning", options: PERSONAL_STATUS_OPTIONS }),
      FIELD("areas", "Areas", "tags", { group: "Classification" }),
      FIELD("subjects", "Subjects", "tags", { group: "Classification" })
    ];
    return [
      FIELD("title", "Title", "text", { group: "Essentials", required: true }),
      FIELD("body", collection === "note" ? "Note" : "Details", "textarea", { group: "Details" }),
      FIELD("status", "Status", "select", { group: "Planning", options: PERSONAL_STATUS_OPTIONS }),
      FIELD("areas", "Areas", "tags", { group: "Classification" }),
      FIELD("subjects", "Subjects", "tags", { group: "Classification" }),
      FIELD("projects", "Projects", "tags", { group: "Classification" })
    ];
  }
  if (module === "projects") {
    if (collection === "projects") return [
      FIELD("name", "Project name", "text", { group: "Essentials", required: true }),
      FIELD("description", "Description", "textarea", { group: "Essentials" }),
      FIELD("objective", "Objective", "textarea", { group: "Details" }),
      FIELD("area", "Area", "text", { group: "Classification" }),
      FIELD("owner", "Owner", "text", { group: "Planning" }),
      FIELD("priority", "Priority", "select", { group: "Planning", options: PRIORITY_OPTIONS }),
      FIELD("nextReviewAt", "Next review", "date", { group: "Planning" }),
      FIELD("completionTarget", "Completion target", "text", { group: "Planning" }),
      FIELD("starred", "Keep near the top", "checkbox", { group: "Planning", help: "Matches the starred state in Projects." })
    ];
    if (collection === "milestones") return [
      FIELD("title", "Milestone", "text", { group: "Essentials", required: true }),
      FIELD("description", "Description", "textarea", { group: "Details" }),
      FIELD("dueAt", "Due date", "date", { group: "Planning", required: true }),
      FIELD("owner", "Owner", "text", { group: "Planning" }),
      FIELD("completionCriteria", "Completion criteria", "tags", { group: "Planning", help: "Separate criteria with commas." }),
      FIELD("completionNote", "Completion note", "textarea", { group: "Details" })
    ];
    if (collection === "blockers") return [
      FIELD("title", "Blocker", "text", { group: "Essentials", required: true }),
      FIELD("condition", "What is blocked", "textarea", { group: "Essentials", required: true }),
      FIELD("severity", "Severity", "select", { group: "Planning", options: PRIORITY_OPTIONS }),
      FIELD("owner", "Owner", "text", { group: "Planning" }),
      FIELD("dueAt", "Due date", "date", { group: "Planning" }),
      FIELD("resolution", "Resolution note", "textarea", { group: "Details" })
    ];
    if (collection === "links") return [FIELD("projectSpecificNote", "Project note", "textarea")];
  }
  if (module === "personal-ops") {
    if (["goals", "decisions", "obligations", "followUps"].includes(collection)) {
      const detail = collection === "goals" ? "outcome" : collection === "decisions" ? "question" : collection === "obligations" ? "consequence" : "context";
      const fields = [
        FIELD("title", "Title", "text", { group: "Essentials", required: true }),
        FIELD(detail, detail[0].toUpperCase() + detail.slice(1), "textarea", { group: "Essentials", required: collection !== "followUps" }),
        FIELD("description", "Description", "textarea", { group: "Details" }),
        FIELD("domain", "Domain", "text", { group: "Classification" }),
        FIELD("owner", "Owner", "text", { group: "Planning" }),
        FIELD("priority", "Priority", "select", { group: "Planning", options: PRIORITY_OPTIONS }),
        FIELD("dueAt", "Due date", "date", { group: "Planning" })
      ];
      if (collection === "goals") fields.push(FIELD("targetPeriod", "Target period", "text", { group: "Planning" }));
      if (collection === "decisions") fields.push(
        FIELD("finalDecision", "Decision", "textarea", { group: "Details" }),
        FIELD("rationale", "Rationale", "textarea", { group: "Details" }),
        FIELD("revisitAt", "Revisit on", "date", { group: "Planning" }),
        FIELD("reversibility", "Reversibility", "select", { group: "Planning", options: OPTIONS("reversible", "reversible_costly", "irreversible", "unknown") }),
        FIELD("risk", "Risk", "select", { group: "Planning", options: OPTIONS("low", "medium", "high", "critical", "unknown") })
      );
      if (collection === "obligations") fields.push(FIELD("completionNote", "Completion note", "textarea", { group: "Details" }));
      if (collection === "followUps") fields.push(
        FIELD("outcome", "Outcome", "textarea", { group: "Details" }),
        FIELD("completionCriteria", "Completion criteria", "textarea", { group: "Details" }),
        FIELD("deferredUntil", "Deferred until", "date", { group: "Planning" })
      );
      return fields;
    }
    if (collection === "routines") return [
      FIELD("title", "Title", "text", { group: "Essentials", required: true }),
      FIELD("summary", "Summary", "textarea", { group: "Details" }),
      FIELD("domain", "Domain", "text", { group: "Classification" }),
      FIELD("owner", "Owner", "text", { group: "Planning" }),
      FIELD("priority", "Priority", "select", { group: "Planning", options: PRIORITY_OPTIONS }),
      FIELD("nextRunAt", "Next run", "date", { group: "Planning" }),
      FIELD("completionCriteria", "Completion criteria", "tags", { group: "Planning" })
    ];
    if (collection === "templates") return [
      FIELD("title", "Title", "text", { group: "Essentials", required: true }),
      FIELD("summary", "Summary", "textarea", { group: "Details" }),
      FIELD("domain", "Domain", "text", { group: "Classification" }),
      FIELD("owner", "Owner", "text", { group: "Planning" }),
      FIELD("availability", "Availability", "select", { group: "Planning", options: OPTIONS("draft", "active", "paused", "deprecated") })
    ];
    if (collection === "captures") return [
      FIELD("title", "Title", "text", { group: "Essentials", required: true }),
      FIELD("domain", "Domain", "text", { group: "Classification" }),
      FIELD("owner", "Owner", "text", { group: "Planning" }),
      FIELD("triageState", "Triage", "select", { group: "Planning", options: OPTIONS("untriaged", "needs_context", "ready", "processed") })
    ];
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
    if (collection === "accounts") return [
      FIELD("name", "Account name", "text", { group: "Essentials", required: true }),
      FIELD("institution", "Institution", "text", { group: "Essentials" }),
      FIELD("kind", "Account type", "select", { group: "Classification", options: OPTIONS("Checking", "Savings", "Credit", "Brokerage", "Cash", "Business") }),
      FIELD("mask", "Last four digits", "text", { group: "Details", help: "Only a short account mask, never a complete account number." }),
      FIELD("entityScope", "Scope", "select", { group: "Classification", options: ENTITY_SCOPE_OPTIONS })
    ];
    if (collection === "transactions") return [
      FIELD("merchant", "Merchant", "text", { group: "Essentials", required: true }),
      FIELD("occurredOn", "Date", "date", { group: "Essentials", required: true }),
      FIELD("amount", "Amount", "number", { group: "Essentials", required: true, step: 0.01 }),
      FIELD("direction", "Direction", "select", { group: "Classification", required: true, options: OPTIONS("income", "expense") }),
      FIELD("category", "Category", "text", { group: "Classification", required: true }),
      FIELD("status", "Ledger status", "select", { group: "Planning", options: OPTIONS("cleared", "pending") }),
      FIELD("entityScope", "Scope", "select", { group: "Classification", options: ENTITY_SCOPE_OPTIONS }),
      FIELD("memo", "Memo", "textarea", { group: "Details" })
    ];
    if (collection === "bills") return [
      FIELD("name", "Bill", "text", { group: "Essentials", required: true }),
      FIELD("amount", "Amount", "number", { group: "Essentials", required: true, step: 0.01 }),
      FIELD("dueDate", "Due date", "date", { group: "Planning", required: true }),
      FIELD("category", "Category", "text", { group: "Classification", required: true }),
      FIELD("recurring", "Repeats", "select", { group: "Planning", options: OPTIONS("monthly", "annual", "weekly") }),
      FIELD("autopay", "Autopay is recorded", "checkbox", { group: "Planning", help: "This records the setting only; it does not contact a bank." }),
      FIELD("entityScope", "Scope", "select", { group: "Classification", options: ENTITY_SCOPE_OPTIONS })
    ];
    if (collection === "budgets") return [
      FIELD("period", "Month", "month", { group: "Essentials", required: true }),
      FIELD("category", "Category", "text", { group: "Essentials", required: true }),
      FIELD("limit", "Limit", "number", { group: "Essentials", required: true, step: 0.01 }),
      FIELD("entityScope", "Scope", "select", { group: "Classification", options: ENTITY_SCOPE_OPTIONS })
    ];
    if (collection === "rules") return [
      FIELD("name", "Rule name", "text", { group: "Essentials", required: true }),
      FIELD("description", "Description", "textarea", { group: "Details" }),
      FIELD("mode", "Mode", "select", { group: "Planning", options: OPTIONS("suggest", "manual_approval", "auto", "draft", "disabled") }),
      FIELD("enabled", "Rule enabled", "checkbox", { group: "Planning", help: "Runs only within the existing Finance rule contract." })
    ];
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

export function readCanonicalRelationships(fields: Record<string, VaultFieldValue>): VaultCanonicalRelationship[] {
  const value = fields[VAULT_CANONICAL_RELATIONSHIPS_FIELD];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VaultCanonicalRelationship => Boolean(
    item && typeof item === "object" && !Array.isArray(item)
    && typeof item.linkId === "string"
    && typeof item.targetCanonicalId === "string"
    && typeof item.targetLabel === "string"
    && typeof item.relationship === "string"
    && (item.direction === "outgoing" || item.direction === "incoming")
    && (item.state === undefined || typeof item.state === "string")
  ));
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
      || !["create", "update", "owner_action"].includes(String(candidate.operation))
      || !candidate.patch || typeof candidate.patch !== "object" || Array.isArray(candidate.patch)
      || !candidate.baseFields || typeof candidate.baseFields !== "object" || Array.isArray(candidate.baseFields)
      || candidate.operation === "owner_action" && (!candidate.ownerAction || typeof candidate.ownerAction !== "object" || Array.isArray(candidate.ownerAction))
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
