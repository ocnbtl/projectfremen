import type { MutationError, MutationResult } from "../../native-objects/mutation-result";
import type { NativeObjectRef } from "../../native-objects/types";

export type ResourceType =
  | "article"
  | "website"
  | "tool"
  | "vendor"
  | "document"
  | "dataset"
  | "video_media"
  | "book"
  | "contract_invoice"
  | "external_account"
  | "unknown";

export type ResourceLifecycleState =
  | "active"
  | "archived"
  | "unavailable"
  | "merged"
  | "replaced"
  | "unknown";

export type ResourceReviewState =
  | "reviewed"
  | "needs_review"
  | "needs_cleanup"
  | "stale"
  | "blocked"
  | "archived"
  | "unknown";

export type ResourceReviewCadence =
  | "manual"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "unknown";

export type ResourceLevel = "low" | "medium" | "high" | "unknown";
export type ResourceFreshness = "stable" | "time_sensitive" | "stale" | "unknown";
export type ResourceHealthState = "ok" | "redirected" | "broken" | "unreachable" | "unknown";
export type ResourceDuplicateState = "none" | "possible" | "confirmed" | "unknown";
export type ResourceSnapshotState = "attached" | "missing" | "unknown";

export type ResourceLegacyStatus =
  | "idea"
  | "draft"
  | "active"
  | "completed"
  | "blocked"
  | "inactive"
  | "next";

export type ResourceRelations = {
  north: string[];
  south: string[];
  east: string[];
  west: string[];
  stakeholders: string[];
  stakeholdings: string[];
  internalSources: string[];
  related: string[];
};

export type ResourceLegacyTime = {
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  reviewCadence?: string;
  nextReview?: string;
  lastReview?: string;
  processedOn?: string;
};

export type ResourceSourceCandidate = {
  /** A normalized HTTP(S) value that is safe to open as a user-initiated link. */
  value: string;
  /** Fragment-free byte comparison key for exact legacy candidate matching. */
  matchKey: string;
  normalizationVersion: "whatwg-http-v1";
  hadFragment: boolean;
  provenance: "legacy_record_url" | "legacy_external_source";
  evidenceField: string;
  displayDomain: string;
  state: "syntax_accepted";
};

export type ResourceSourceEvidenceState =
  | "syntax_accepted"
  | "credentials_withheld"
  | "unsupported_protocol"
  | "invalid_url";

/**
 * Literal evidence derived from one stored legacy URL field. This is not a
 * URL-health result, canonical confirmation, duplicate decision, or audit
 * event. Unsafe values receive a redacted display value and no openable URL.
 */
export type ResourceSourceEvidenceItem = {
  id: string;
  provenance: ResourceSourceCandidate["provenance"];
  evidenceField: string;
  displayValue: string;
  navigationUrl: string | null;
  matchKey: string | null;
  normalizationVersion: "whatwg-http-v1";
  hadFragment: boolean;
  displayDomain: string | null;
  protocol: string | null;
  state: ResourceSourceEvidenceState;
};

export type ResourceExactUrlMatch = {
  target: NativeObjectRef;
  normalizedUrls: string[];
};

export type ResourceSourceEvidenceReport = {
  entries: ResourceSourceEvidenceItem[];
  acceptedCount: number;
  withheldCount: number;
  exactResourceMatches: ResourceExactUrlMatch[];
};

/**
 * External-source identity read from the broad legacy Personal Record. Null
 * means the legacy model did not contain evidence for the native field.
 */
export type ResourceSourceIdentity = {
  canonicalUrl: string | null;
  canonicalState: "confirmed" | "legacy_unverified" | "withheld_unsafe" | "missing";
  sourceTitle: string | null;
  sourceTitleState: "not_available";
  displayDomain: string | null;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  savedAt: string;
  lastFetchedAt: string | null;
  sourceImportId: string | null;
  captureMethod: "legacy_unknown";
  candidates: ResourceSourceCandidate[];
  evidence: ResourceSourceEvidenceItem[];
};

export type ResourceReviewSummary = {
  state: ResourceReviewState;
  cadence: ResourceReviewCadence;
  usefulness: ResourceLevel;
  trustLevel: ResourceLevel;
  freshness: ResourceFreshness;
  confidence: ResourceLevel;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
};

export type ResourceSourceHealth = {
  state: ResourceHealthState;
  httpStatus: number | null;
  lastCheckedAt: string | null;
  redirectTarget: string | null;
  duplicateState: ResourceDuplicateState;
  snapshotState: ResourceSnapshotState;
};

export type ResourceLegacyProvenance = {
  kind: "legacy_personal_record";
  recordId: string;
  domain: string;
  className: "resource";
  status: ResourceLegacyStatus;
  stage: "processed" | "unprocessed";
  privacy: "private" | "shared";
  knowledgeShape:
    | ""
    | "observation"
    | "claim"
    | "procedure"
    | "process"
    | "collection"
    | "reference";
  growth: "seed" | "plant" | "tree" | "forest" | "jungle";
  rawUrl: string | null;
  externalSources: string[];
  areas: string[];
  subjects: string[];
  projects: string[];
  intents: string[];
  relations: ResourceRelations;
  time: ResourceLegacyTime;
  createdMeta: {
    uid: string;
    createdIso: string;
    created: string;
    createdDate: string;
    createdYear: string;
    createdMonth: string;
    createdYearMonth: string;
    createdQuarter: string;
    createdYearQuarter: string;
    createdWeek: string;
    createdYearWeek: string;
    createdWeekdayName: string;
    createdWeekdayNumber: string;
  };
  lifecycleMapping: "legacy_active_to_active" | "not_inferred";
  pinnedMapping: "legacy_model_has_no_pinned_field";
};

/**
 * Native-shaped, read-only view of a legacy Resource record. The user-facing
 * title and fetched source title are deliberately distinct fields.
 */
export type ResourceRecord = {
  id: string;
  nativeRef: NativeObjectRef;
  title: string;
  body: string;
  type: ResourceType;
  lifecycleState: ResourceLifecycleState;
  /** Null means the legacy source has no pinned field; false must not be inferred. */
  pinned: boolean | null;
  source: ResourceSourceIdentity;
  health: ResourceSourceHealth;
  review: ResourceReviewSummary;
  citationCount: number | null;
  linkedObjectCount: number | null;
  relations: ResourceRelations;
  createdAt: string;
  updatedAt: string;
  readOnly: true;
  migrationState: "legacy_unverified";
  provenance: ResourceLegacyProvenance;
};

export type ResourceDirectoryItem = {
  id: string;
  title: string;
  sourceTitle: string | null;
  displayDomain: string | null;
  canonicalUrl: string | null;
  type: ResourceType;
  lifecycleState: ResourceLifecycleState;
  reviewState: ResourceReviewState;
  nextReviewAt: string | null;
  usefulness: ResourceLevel;
  pinned: boolean | null;
  updatedAt: string;
  readOnly: true;
};

export type ResourcesViewModel = {
  total: number;
  filteredTotal: number;
  items: ResourceDirectoryItem[];
  selected: ResourceRecord | null;
};

export type ResourcesRepositoryError = MutationError;
export type ResourcesRepositoryResult<T> = MutationResult<T>;
