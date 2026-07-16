import { createNativeObjectRef } from "../../native-objects/routes";
import type {
  PersonalRecord,
  PersonalRecordClass,
  PersonalRecordInput,
  PersonalRecordPatch,
  PersonalRecordStatus
} from "../../personal-records-store";
import type {
  LegacyWritableNoteType,
  NoteCreateInput,
  NoteLifecycleStatus,
  NoteMappingNote,
  NoteRecord,
  NoteReviewState,
  NoteType,
  NoteUpdateInput,
  NoteWritableLifecycleStatus
} from "./types";

const EXCLUDED_NOTE_CLASSES = new Set<PersonalRecordClass>(["person", "org", "resource", "file"]);

type Mapping<Value> = {
  value: Value;
  note: NoteMappingNote;
};

function copyRelations(record: PersonalRecord) {
  return {
    north: [...record.relations.north],
    south: [...record.relations.south],
    east: [...record.relations.east],
    west: [...record.relations.west],
    stakeholders: [...record.relations.stakeholders],
    stakeholdings: [...record.relations.stakeholdings],
    internalSources: [...record.relations.internalSources],
    related: [...record.relations.related]
  };
}

function mapLegacyType(className: PersonalRecordClass): Mapping<NoteType> {
  if (className === "decision") {
    return {
      value: "decision",
      note: {
        code: "legacy_type_decision",
        field: "type",
        confidence: "direct",
        message: "Legacy Decision class maps to a Notes decision candidate; canonical durable Decisions belong to Personal Ops.",
        legacyValue: className
      }
    };
  }
  if (className === "meeting") {
    return {
      value: "meeting",
      note: {
        code: "legacy_type_meeting",
        field: "type",
        confidence: "direct",
        message: "Legacy Meeting class maps directly to the Notes meeting type.",
        legacyValue: className
      }
    };
  }
  if (className === "project") {
    return {
      value: "project_note",
      note: {
        code: "legacy_type_project_note",
        field: "type",
        confidence: "inferred",
        message: "Legacy Project-class content is presented as a project note; the original class is retained.",
        legacyValue: className
      }
    };
  }
  return {
    value: "idea",
    note: {
      code: "legacy_type_generic_note",
      field: "type",
      confidence: "inferred",
      message: "The legacy record has no canonical Notes subtype; it is presented as Idea without rewriting the source record.",
      legacyValue: className
    }
  };
}

function mapLegacyLifecycle(status: PersonalRecordStatus): Mapping<NoteLifecycleStatus> {
  if (status === "draft") {
    return {
      value: "draft",
      note: {
        code: "legacy_lifecycle_draft",
        field: "lifecycle",
        confidence: "direct",
        message: "Legacy Draft maps directly to the Notes draft lifecycle.",
        legacyValue: status
      }
    };
  }
  if (status === "active") {
    return {
      value: "active",
      note: {
        code: "legacy_lifecycle_active",
        field: "lifecycle",
        confidence: "direct",
        message: "Legacy Active maps directly to the Notes active lifecycle.",
        legacyValue: status
      }
    };
  }
  if (status === "inactive") {
    return {
      value: "archived",
      note: {
        code: "legacy_lifecycle_inactive_archived",
        field: "lifecycle",
        confidence: "inferred",
        message: "Legacy Inactive is presented as archived because the old store normalized archived into inactive; no source value is changed.",
        legacyValue: status
      }
    };
  }
  if (status === "idea") {
    return {
      value: "draft",
      note: {
        code: "legacy_lifecycle_idea_draft",
        field: "lifecycle",
        confidence: "inferred",
        message: "Legacy Idea mixed type and lifecycle; it is presented as a draft while the original status is retained.",
        legacyValue: status
      }
    };
  }
  return {
    value: "active",
    note: {
      code: "legacy_lifecycle_workflow_active",
      field: "lifecycle",
      confidence: "inferred",
      message: "The legacy workflow status has no direct Notes lifecycle equivalent; the Note remains active and the original status is retained.",
      legacyValue: status
    }
  };
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapLegacyReview(record: PersonalRecord, now: Date): Mapping<NoteReviewState> {
  const nextReview = parseDate(record.time.nextReview);
  if (nextReview) {
    const due = nextReview.getTime() <= now.getTime();
    return {
      value: due ? "needs_review" : "scheduled",
      note: {
        code: due ? "legacy_review_due" : "legacy_review_scheduled",
        field: "review",
        confidence: "inferred",
        message: due
          ? "Needs Review is derived from the legacy next-review date."
          : "Scheduled is derived from the legacy next-review date.",
        legacyValue: record.time.nextReview
      }
    };
  }

  if (record.status === "idea" || record.status === "draft" || record.status === "blocked") {
    return {
      value: "needs_review",
      note: {
        code: "legacy_review_queue_status",
        field: "review",
        confidence: "inferred",
        message: "Needs Review preserves the legacy queue rule for Idea, Draft, and Blocked records; no independent review state exists.",
        legacyValue: record.status
      }
    };
  }

  const lastReview = parseDate(record.time.lastReview);
  const createdAt = parseDate(record.createdAt);
  if (lastReview && createdAt && lastReview.getTime() > createdAt.getTime()) {
    return {
      value: "reviewed",
      note: {
        code: "legacy_review_timestamp",
        field: "review",
        confidence: "inferred",
        message: "Reviewed is inferred because the legacy last-review timestamp is later than creation.",
        legacyValue: record.time.lastReview
      }
    };
  }

  return {
    value: "unreviewed",
    note: {
      code: "legacy_review_unavailable",
      field: "review",
      confidence: "unavailable",
      message: "The legacy record has no independent review state; Unreviewed is shown without mutating the source record.",
      legacyValue: record.time.lastReview
    }
  };
}

export function isLegacyNoteRecord(record: PersonalRecord): boolean {
  return record.domain === "notes-docs" && !EXCLUDED_NOTE_CLASSES.has(record.className);
}

export function legacyPersonalRecordToNoteRecord(
  record: PersonalRecord,
  options: { now?: Date } = {}
): NoteRecord {
  const type = mapLegacyType(record.className);
  const lifecycle = mapLegacyLifecycle(record.status);
  const review = mapLegacyReview(record, options.now || new Date());

  return {
    id: record.id,
    uid: record.createdMeta.uid,
    nativeRef: createNativeObjectRef({
      module: "notes",
      objectType: "note",
      objectId: record.id,
      label: record.title
    }),
    title: record.title,
    body: record.body,
    type: type.value,
    lifecycleStatus: lifecycle.value,
    reviewState: review.value,
    privacy: record.privacy,
    areas: [...record.areas],
    subjects: [...record.subjects],
    projects: [...record.projects],
    relations: copyRelations(record),
    legacySources: {
      sourceUrl: record.url,
      externalSources: [...record.externalSources]
    },
    reviewCadence: record.time.reviewCadence,
    nextReviewAt: record.time.nextReview,
    legacyLastReviewAt: record.time.lastReview,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    provenance: {
      kind: "legacy_personal_record",
      recordId: record.id,
      domain: record.domain,
      className: record.className,
      status: record.status,
      stage: record.stage,
      growth: record.growth,
      knowledgeShape: record.knowledgeShape,
      intents: [...record.intents],
      createdMeta: { ...record.createdMeta }
    },
    mappingNotes: [
      type.note,
      lifecycle.note,
      review.note,
      {
        code: "legacy_plain_text_body",
        field: "body",
        confidence: "unavailable",
        message: "The body is preserved as legacy plain text; no structured document or version history is claimed."
      },
      {
        code: "legacy_untyped_relations",
        field: "links",
        confidence: "unavailable",
        message: "Legacy relation IDs are preserved but are not promoted to native NoteLink records without relationship and provenance data."
      }
    ],
    capabilities: {
      structuredBody: false,
      versionHistory: false,
      nativeLinks: false
    }
  };
}

export function legacyPersonalRecordsToNotes(
  records: PersonalRecord[],
  options: { now?: Date } = {}
): NoteRecord[] {
  return records
    .filter(isLegacyNoteRecord)
    .map((record) => legacyPersonalRecordToNoteRecord(record, options));
}

function legacyClassForType(type: LegacyWritableNoteType): PersonalRecordClass {
  if (type === "decision") return "decision";
  if (type === "meeting") return "meeting";
  return "note";
}

function legacyStatusForLifecycle(status: NoteWritableLifecycleStatus): PersonalRecordStatus {
  return status;
}

export function noteCreateInputToLegacy(input: NoteCreateInput): PersonalRecordInput {
  const type = input.type || "idea";
  return {
    domain: "notes-docs",
    title: input.title,
    className: legacyClassForType(type),
    status: legacyStatusForLifecycle(input.lifecycleStatus || "draft"),
    body: input.body || "",
    privacy: input.privacy || "private",
    stage: "processed",
    areas: input.areas || [],
    subjects: input.subjects || [],
    time: {
      reviewCadence: input.reviewCadence,
      nextReview: input.nextReviewAt
    }
  };
}

export function noteUpdateInputToLegacy(input: NoteUpdateInput): PersonalRecordPatch {
  const hasTimeUpdate = input.reviewCadence !== undefined || input.nextReviewAt !== undefined;
  return {
    title: input.title,
    body: input.body,
    status: input.lifecycleStatus
      ? legacyStatusForLifecycle(input.lifecycleStatus)
      : undefined,
    areas: input.areas,
    subjects: input.subjects,
    time: hasTimeUpdate
      ? {
          reviewCadence: input.reviewCadence,
          nextReview: input.nextReviewAt
        }
      : undefined
  };
}
