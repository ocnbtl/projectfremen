import type { NoteMappingNote, NoteRecord } from "./types";

export type NotePropertyIssue =
  | "none"
  | "missing"
  | "invalid"
  | "unconfirmed"
  | "unavailable";

export type NotePropertyCheck = {
  id: string;
  label: string;
  value: string;
  detail: string;
  requirement: "required" | "recommended" | "native";
  outcome: "supported" | "attention" | "unavailable";
  outcomeLabel: string;
  issue: NotePropertyIssue;
  queueRelevant: boolean;
};

export type NotePropertyReadiness = {
  checks: readonly NotePropertyCheck[];
  requiredChecks: readonly NotePropertyCheck[];
  readyRequiredCount: number;
  missingCount: number;
  invalidCount: number;
  unconfirmedCount: number;
  unavailableCount: number;
  attentionCount: number;
  requiresAttention: boolean;
  primaryReason: string;
};

export type NotePropertyQueueItem = {
  noteId: string;
  priorityScore: number;
  primaryReason: string;
  attentionCount: number;
  missingCount: number;
  invalidCount: number;
  unconfirmedCount: number;
  readyRequiredCount: number;
  requiredCount: number;
};

export type NotePropertyQueue = {
  items: readonly NotePropertyQueueItem[];
  byNoteId: ReadonlyMap<string, NotePropertyQueueItem>;
  summary: {
    totalNotes: number;
    queuedNotes: number;
    attentionItems: number;
    missingValues: number;
    invalidValues: number;
    unconfirmedMappings: number;
    requiredReady: number;
    requiredChecks: number;
  };
};

function isValidDate(value: string): boolean {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()));
}

function mappingFor(note: NoteRecord, field: NoteMappingNote["field"]): NoteMappingNote | undefined {
  return note.mappingNotes.find((mapping) => mapping.field === field);
}

function present(
  id: string,
  label: string,
  value: string,
  requirement: NotePropertyCheck["requirement"],
  detail: string
): NotePropertyCheck {
  return {
    id,
    label,
    value,
    detail,
    requirement,
    outcome: "supported",
    outcomeLabel: requirement === "required" ? "Required · ready" : "Available",
    issue: "none",
    queueRelevant: false
  };
}

function attention(
  id: string,
  label: string,
  value: string,
  requirement: NotePropertyCheck["requirement"],
  detail: string,
  issue: Extract<NotePropertyIssue, "missing" | "invalid" | "unconfirmed">
): NotePropertyCheck {
  return {
    id,
    label,
    value,
    detail,
    requirement,
    outcome: "attention",
    outcomeLabel:
      issue === "missing" ? "Missing" : issue === "invalid" ? "Invalid" : "Needs confirmation",
    issue,
    queueRelevant: true
  };
}

function unavailable(id: string, label: string, detail: string): NotePropertyCheck {
  return {
    id,
    label,
    value: "Not stored",
    detail,
    requirement: "native",
    outcome: "unavailable",
    outcomeLabel: "Not connected",
    issue: "unavailable",
    queueRelevant: false
  };
}

function mappedRequiredCheck(
  note: NoteRecord,
  field: Extract<NoteMappingNote["field"], "type" | "lifecycle">,
  label: string,
  value: string
): NotePropertyCheck {
  const mapping = mappingFor(note, field);
  if (mapping?.confidence === "direct") {
    return present(field, label, value, "required", mapping.message);
  }
  return attention(
    field,
    label,
    value,
    "required",
    mapping?.message || `The canonical ${label.toLowerCase()} is not directly stored.`,
    "unconfirmed"
  );
}

export function buildNotePropertyReadiness(note: NoteRecord): NotePropertyReadiness {
  const checks: NotePropertyCheck[] = [
    note.uid.trim()
      ? present("uid", "UID", note.uid, "required", "Stable user-visible identity is retained by the legacy adapter.")
      : attention("uid", "UID", "Missing", "required", "A stable UID is required.", "missing"),
    note.title.trim()
      ? present("title", "Title", note.title, "required", "The authored Note title is stored.")
      : attention("title", "Title", "Missing", "required", "A title is required outside a temporary draft.", "missing"),
    mappedRequiredCheck(note, "type", "Type", note.type),
    mappedRequiredCheck(note, "lifecycle", "Lifecycle", note.lifecycleStatus),
    note.privacy === "private" || note.privacy === "shared"
      ? present("privacy", "Privacy", note.privacy, "required", "Privacy is stored by the Personal Records contract.")
      : attention("privacy", "Privacy", "Invalid", "required", "Privacy must be a recognized value.", "invalid"),
    isValidDate(note.createdAt)
      ? present("created-at", "Created at", note.createdAt, "required", "Creation provenance is retained.")
      : attention("created-at", "Created at", note.createdAt || "Missing", "required", "A valid creation timestamp is required.", note.createdAt ? "invalid" : "missing"),
    isValidDate(note.updatedAt)
      ? present("updated-at", "Updated at", note.updatedAt, "required", "The current legacy revision has a valid update timestamp.")
      : attention("updated-at", "Updated at", note.updatedAt || "Missing", "required", "A valid update timestamp is required.", note.updatedAt ? "invalid" : "missing"),
    note.provenance.recordId && note.provenance.domain
      ? present(
          "provenance",
          "Source provenance",
          note.provenance.recordId,
          "required",
          `Legacy domain ${note.provenance.domain}; original record identity remains intact.`
        )
      : attention("provenance", "Source provenance", "Missing", "required", "Migration provenance is required.", "missing"),
    note.areas.length
      ? present("area", "Area", note.areas.join(", "), "recommended", "At least one operating area is available.")
      : attention(
          "area",
          "Area",
          "Unassigned",
          "recommended",
          "Area is optional in storage but needed for useful routing and property cleanup.",
          "missing"
        ),
    unavailable("owner", "Owner", "The legacy Notes adapter does not store a canonical owner identity."),
    unavailable("pinned", "Pinned", "Pinned state is absent from the legacy Personal Records contract."),
    unavailable("current-version", "Current version", "A native NoteVersion repository is not connected."),
    unavailable("review-owner", "Review owner", "Reviewer identity and a native NoteReviewState are not connected."),
    unavailable("content-schema", "Content schema version", "The body remains preserved legacy plain text, not a versioned document."),
    unavailable("audit", "Last audit event", "The native Note audit stream is not connected.")
  ];
  const requiredChecks = checks.filter((check) => check.requirement === "required");
  const queueChecks = checks.filter((check) => check.queueRelevant);
  const missingCount = queueChecks.filter((check) => check.issue === "missing").length;
  const invalidCount = queueChecks.filter((check) => check.issue === "invalid").length;
  const unconfirmedCount = queueChecks.filter((check) => check.issue === "unconfirmed").length;
  const unavailableCount = checks.filter((check) => check.outcome === "unavailable").length;
  const primaryReason =
    queueChecks.find((check) => check.issue === "missing")?.label ||
    queueChecks.find((check) => check.issue === "invalid")?.label ||
    queueChecks.find((check) => check.issue === "unconfirmed")?.label ||
    "Properties ready";

  return {
    checks,
    requiredChecks,
    readyRequiredCount: requiredChecks.filter((check) => check.outcome === "supported").length,
    missingCount,
    invalidCount,
    unconfirmedCount,
    unavailableCount,
    attentionCount: queueChecks.length,
    requiresAttention: queueChecks.length > 0,
    primaryReason
  };
}

function queueItem(note: NoteRecord): NotePropertyQueueItem {
  const readiness = buildNotePropertyReadiness(note);
  return {
    noteId: note.id,
    priorityScore:
      readiness.missingCount * 10 +
      readiness.invalidCount * 8 +
      readiness.unconfirmedCount * 4,
    primaryReason: readiness.primaryReason,
    attentionCount: readiness.attentionCount,
    missingCount: readiness.missingCount,
    invalidCount: readiness.invalidCount,
    unconfirmedCount: readiness.unconfirmedCount,
    readyRequiredCount: readiness.readyRequiredCount,
    requiredCount: readiness.requiredChecks.length
  };
}

export function buildNotePropertyQueue(notes: readonly NoteRecord[]): NotePropertyQueue {
  const items = notes
    .map(queueItem)
    .filter((item) => item.attentionCount > 0)
    .sort((left, right) =>
      right.priorityScore - left.priorityScore ||
      left.noteId.localeCompare(right.noteId)
    );
  const byNoteId = new Map(items.map((item) => [item.noteId, item]));

  return {
    items,
    byNoteId,
    summary: {
      totalNotes: notes.length,
      queuedNotes: items.length,
      attentionItems: items.reduce((sum, item) => sum + item.attentionCount, 0),
      missingValues: items.reduce((sum, item) => sum + item.missingCount, 0),
      invalidValues: items.reduce((sum, item) => sum + item.invalidCount, 0),
      unconfirmedMappings: items.reduce((sum, item) => sum + item.unconfirmedCount, 0),
      requiredReady: items.reduce((sum, item) => sum + item.readyRequiredCount, 0),
      requiredChecks: items.reduce((sum, item) => sum + item.requiredCount, 0)
    }
  };
}
