import type { MutationError, MutationResult } from "../../native-objects/mutation-result";
import type { NativeObjectRef } from "../../native-objects/types";
import type {
  PersonalRecordClass,
  PersonalRecordCreatedMeta,
  PersonalRecordGrowth,
  PersonalRecordIntent,
  PersonalRecordKnowledgeShape,
  PersonalRecordPrivacy,
  PersonalRecordRelations,
  PersonalRecordStage,
  PersonalRecordStatus
} from "../../personal-records-store";

export type NoteType =
  | "decision"
  | "meeting"
  | "idea"
  | "research"
  | "personal_context"
  | "project_note";

export type NoteLifecycleStatus = "draft" | "active" | "archived";

export type NoteReviewState =
  | "unreviewed"
  | "needs_review"
  | "in_review"
  | "reviewed"
  | "scheduled"
  | "blocked"
  | "archived";

/** Values the legacy Personal Records API can round-trip without inventing storage. */
export type LegacyWritableNoteType = "idea" | "decision" | "meeting";
export type NoteWritableLifecycleStatus = "draft" | "active";

export type NoteMappingConfidence = "direct" | "inferred" | "unavailable";

export type NoteMappingNote = {
  code: string;
  field: "type" | "lifecycle" | "review" | "body" | "links";
  confidence: NoteMappingConfidence;
  message: string;
  legacyValue?: string;
};

export type NoteLegacyProvenance = {
  kind: "legacy_personal_record";
  recordId: string;
  domain: string;
  className: PersonalRecordClass;
  status: PersonalRecordStatus;
  stage: PersonalRecordStage;
  growth: PersonalRecordGrowth;
  knowledgeShape: PersonalRecordKnowledgeShape;
  intents: PersonalRecordIntent[];
  createdMeta: PersonalRecordCreatedMeta;
};

export type NoteRecord = {
  id: string;
  uid: string;
  nativeRef: NativeObjectRef;
  title: string;
  /** Legacy plain text only. This is not a structured rich-text document. */
  body: string;
  type: NoteType;
  lifecycleStatus: NoteLifecycleStatus;
  reviewState: NoteReviewState;
  privacy: PersonalRecordPrivacy;
  areas: string[];
  subjects: string[];
  projects: string[];
  relations: PersonalRecordRelations;
  legacySources: {
    sourceUrl?: string;
    externalSources: string[];
  };
  reviewCadence?: string;
  nextReviewAt?: string;
  legacyLastReviewAt?: string;
  createdAt: string;
  updatedAt: string;
  provenance: NoteLegacyProvenance;
  mappingNotes: NoteMappingNote[];
  capabilities: {
    structuredBody: false;
    versionHistory: false;
    nativeLinks: false;
  };
};

export type NoteCreateInput = {
  title: string;
  body?: string;
  type?: LegacyWritableNoteType;
  lifecycleStatus?: NoteWritableLifecycleStatus;
  privacy?: PersonalRecordPrivacy;
  areas?: string[];
  subjects?: string[];
  reviewCadence?: string;
  nextReviewAt?: string;
};

export type NoteUpdateInput = {
  title?: string;
  body?: string;
  lifecycleStatus?: NoteWritableLifecycleStatus;
  areas?: string[];
  subjects?: string[];
  reviewCadence?: string;
  nextReviewAt?: string;
};

export type NoteMutationError = MutationError;
export type NoteMutationResult<T> = MutationResult<T>;

export type NoteDirectoryItem = {
  id: string;
  title: string;
  bodyExcerpt: string;
  type: NoteType;
  lifecycleStatus: NoteLifecycleStatus;
  reviewState: NoteReviewState;
  area?: string;
  nextReviewAt?: string;
  updatedAt: string;
  hasLegacySources: boolean;
  hasLegacyRelationships: boolean;
  mappingWarningCount: number;
};

export type NoteViewCounts = {
  total: number;
  active: number;
  drafts: number;
  archived: number;
  needsReview: number;
  withLegacySources: number;
  withLegacyRelationships: number;
};

export type NotesViewModel = {
  counts: NoteViewCounts;
  filteredTotal: number;
  items: NoteDirectoryItem[];
  selected: NoteRecord | null;
};

