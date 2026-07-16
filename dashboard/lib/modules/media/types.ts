import type { MutationError, MutationResult } from "../../native-objects/mutation-result";
import type { ModuleId, NativeObjectRef } from "../../native-objects/types";

export type MediaType =
  | "image"
  | "video"
  | "audio"
  | "screenshot"
  | "design_file"
  | "document_pdf"
  | "source_file"
  | "attachment"
  | "unknown";

export type MediaLifecycleState = "active" | "archived" | "unknown";
export type MediaPinnedState = "pinned" | "not_pinned" | "unknown";
export type MediaReviewState = "needs_review" | "pending_review" | "reviewed" | "blocked" | "unknown";
export type MediaReadinessState = "not_ready" | "needs_metadata" | "needs_rights" | "ready" | "unknown";
export type MediaDuplicateState =
  | "unchecked"
  | "unique"
  | "possible_duplicate"
  | "duplicate"
  | "resolved"
  | "unknown";
export type MediaVisibility = "internal" | "review" | "project" | "public" | "external" | "archived" | "unknown";

export type MediaRightsState =
  | "unknown"
  | "needs_confirmation"
  | "personal_use"
  | "internal_use"
  | "owned"
  | "licensed"
  | "restricted"
  | "expired"
  | "public_safe";

export type MediaProvisionalUseScope = "internal" | "review";

export type MediaRights = {
  id: string | null;
  state: MediaRightsState;
  scopeState: "provisional" | "confirmed";
  confirmedAllowedUse: readonly string[];
  provisionalAllowedUse: readonly MediaProvisionalUseScope[];
  publicUseAllowed: boolean | null;
  commercialUseAllowed: boolean | null;
  modificationAllowed: boolean | null;
  attributionRequired: boolean | null;
  licenseResourceId: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
};

export type MediaTechnicalMetadata = {
  filename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  checksum: string | null;
  dimensions: { width: number; height: number } | null;
  durationSeconds: number | null;
  pageCount: number | null;
};

export type MediaUploadSource =
  | "drag_drop"
  | "manual_upload"
  | "desktop_capture"
  | "mobile_upload"
  | "url_import"
  | "scanner"
  | "export"
  | "finance_import"
  | "resource_import"
  | "external_import";

export type MediaRawFileValidationState =
  | "pending"
  | "valid"
  | "invalid_file"
  | "security_blocked"
  | "unsupported_type";

export type MediaRawFileSecurityState = "pending" | "passed" | "blocked" | "unknown";

/**
 * The native binary contract. The local intake preview intentionally does not
 * construct this object because storage, validation, checksum, and actor
 * identity are not connected yet.
 */
export type MediaRawFile = {
  fileId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  dimensions: { width: number; height: number } | null;
  durationSeconds: number | null;
  pageCount: number | null;
  uploadedBy: string;
  uploadedAt: string;
  uploadSource: MediaUploadSource;
  validationState: MediaRawFileValidationState;
  securityState: MediaRawFileSecurityState;
  retentionState: "active" | "retained" | "pending_delete" | "unknown";
  deletedAt: string | null;
};

export type MediaUploadProcessingState =
  | "queued"
  | "processing"
  | "metadata_extracted"
  | "needs_input"
  | "ready_to_create"
  | "failed"
  | "blocked"
  | "completed";

export type MediaUploadExtractionState =
  | "not_started"
  | "running"
  | "succeeded"
  | "partial"
  | "failed";

export type MediaUploadClassificationState =
  | "unclassified"
  | "inferred"
  | "confirmed"
  | "needs_input";

/**
 * Temporary native intake record. This remains a contract only until a Media
 * repository, audit actor, retention policy, and processing service exist.
 */
export type MediaUploadQueueItem = {
  uploadId: string;
  rawFileId: string;
  originalFilename: string;
  proposedTitle: string | null;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  dimensions: { width: number; height: number } | null;
  durationSeconds: number | null;
  pageCount: number | null;
  checksum: string;
  uploadSource: MediaUploadSource;
  uploadedBy: string;
  uploadedAt: string;
  processingState: MediaUploadProcessingState;
  validationState: MediaRawFileValidationState;
  securityState: MediaRawFileSecurityState;
  extractionState: MediaUploadExtractionState;
  duplicateState: MediaDuplicateState;
  classificationState: MediaUploadClassificationState;
  proposedMediaType: MediaType | null;
  proposedTags: readonly string[];
  proposedAltText: string | null;
  proposedTranscript: string | null;
  proposedOcrText: string | null;
  proposedLinks: readonly NativeObjectRef[];
  rightsState: MediaRightsState;
  sourceState: "unassigned" | "candidate" | "confirmed";
  linkedResourceId: string | null;
  resultingAssetId: string | null;
  intakeNotes: string;
  processingLog: readonly {
    id: string;
    occurredAt: string;
    event: string;
    detail?: string;
  }[];
};

export type MediaResourceReference = {
  value: string;
  kind: "url";
  provenance: "legacy_record_url" | "legacy_external_source";
  state: "unresolved";
};

export type MediaAssetSource = {
  id: string | null;
  state: "unknown" | "resource_reference_unresolved";
  rawFileId: string | null;
  storageKey: string | null;
  resourceReferences: MediaResourceReference[];
};

export type MediaAccessibility = {
  altTextState: "missing" | "needs_update" | "drafted" | "approved" | "unknown";
  altText: string | null;
  ocrState: "not_run" | "running" | "generated" | "needs_review" | "approved" | "failed" | "unknown";
  ocrText: string | null;
  transcriptState: "not_run" | "running" | "generated" | "needs_review" | "approved" | "failed" | "unknown";
  transcriptText: string | null;
};

export type MediaLegacyRelations = {
  north: string[];
  south: string[];
  east: string[];
  west: string[];
  stakeholders: string[];
  stakeholdings: string[];
  internalSources: string[];
  related: string[];
};

export type MediaLegacyTime = {
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  reviewCadence?: string;
  nextReview?: string;
  lastReview?: string;
  processedOn?: string;
};

export type MediaLegacyProvenance = {
  kind: "legacy_personal_record";
  recordId: string;
  domain: string;
  className: "file";
  status: "idea" | "draft" | "active" | "completed" | "blocked" | "inactive" | "next";
  stage: "processed" | "unprocessed";
  privacy: "private" | "shared";
  knowledgeShape: "" | "observation" | "claim" | "procedure" | "process" | "collection" | "reference";
  growth: "seed" | "plant" | "tree" | "forest" | "jungle";
  url: string | null;
  externalSources: string[];
  nonUrlExternalReferences: string[];
  areas: string[];
  subjects: string[];
  projects: string[];
  intents: string[];
  relations: MediaLegacyRelations;
  time: MediaLegacyTime;
};

/**
 * A read model for a legacy file record. Null and `unknown` are intentional:
 * the broad Personal Records model has no verified binary or technical fields.
 */
export type MediaAsset = {
  id: string;
  nativeRef: NativeObjectRef;
  title: string;
  body: string;
  type: MediaType;
  roles: readonly string[];
  lifecycleState: MediaLifecycleState;
  pinnedState: MediaPinnedState;
  reviewState: MediaReviewState;
  readinessState: MediaReadinessState;
  duplicateState: MediaDuplicateState;
  visibility: MediaVisibility;
  technical: MediaTechnicalMetadata;
  source: MediaAssetSource;
  rights: MediaRights;
  accessibility: MediaAccessibility;
  currentVersionId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readOnly: true;
  migrationState: "legacy_unverified";
  provenance: MediaLegacyProvenance;
};

/**
 * Evidence that another native object retains a reference to a Media asset.
 * This is deliberately separate from rights, visibility, lifecycle, and the
 * not-yet-connected native AssetUsage repository.
 */
export type MediaReferencePlacementState =
  | "current"
  | "pending"
  | "stale"
  | "broken"
  | "missing"
  | "archived";

export type MediaIndexedReferenceOwnerModule = Extract<
  ModuleId,
  "projects" | "reviews" | "personal_ops"
>;

export type MediaReferenceKnownOwnerModule = Exclude<ModuleId, "media">;
export type MediaReferenceOwnerModule = MediaReferenceKnownOwnerModule;

export type MediaReferenceSourceKind =
  | "project_link"
  | "project_milestone"
  | "project_blocker"
  | "review_context"
  | "review_evidence"
  | "personal_ops_source"
  | "personal_ops_link"
  | "personal_ops_evidence"
  | "personal_ops_output";

export type MediaReferenceIdentity = {
  kind: "asset" | "version" | "derivative";
  assetId: string;
  objectId: string;
  versionId: string | null;
};

export type MediaReferencePlacement = {
  id: string;
  assetRef: NativeObjectRef;
  targetRef: NativeObjectRef;
  ownerModule: MediaReferenceOwnerModule;
  /** Deterministic primary source for compact displays. */
  sourceKind: MediaReferenceSourceKind;
  /** All retained sources when several references collapse to one location. */
  sourceKinds: MediaReferenceSourceKind[];
  /** Exact embedded/native record identities retained after location grouping. */
  sourceRecordIds: string[];
  referenceIdentity: MediaReferenceIdentity;
  relationships: string[];
  state: MediaReferencePlacementState;
  updatedAt: string;
  readOnly: true;
  caveat: string;
};

/**
 * A retained legacy relation-id match. It is supplementary evidence only and
 * must not be promoted to a native placement without an explicit decision.
 */
export type MediaLegacyUsageCandidate = {
  id: string;
  assetRef: NativeObjectRef;
  targetRef: NativeObjectRef;
  candidateIds: string[];
  relationships: string[];
  evidenceFields: string[];
  legacyDirections: string[];
  ambiguity: "unique" | "multiple_targets";
  readOnly: true;
  caveat: string;
};

export type MediaUnresolvedLegacyUsageReference = {
  id: string;
  assetRef: NativeObjectRef;
  value: string;
  evidenceField: string;
  legacyDirection: string | null;
  readOnly: true;
  caveat: string;
};

export type MediaUsageEvidenceState =
  | "referenced"
  | "attention"
  | "legacy_only"
  | "unreferenced"
  | "coverage_incomplete"
  | "missing_asset";

export type MediaUsageEvidenceRecord = {
  id: string;
  assetRef: NativeObjectRef;
  asset: MediaAsset | null;
  placements: MediaReferencePlacement[];
  legacyCandidates: MediaLegacyUsageCandidate[];
  unresolvedLegacyReferences: MediaUnresolvedLegacyUsageReference[];
  state: MediaUsageEvidenceState;
};

export type MediaUsageEvidenceCoverageEntry = {
  ownerModule: MediaReferenceKnownOwnerModule;
  indexState: "indexed" | "read_failed" | "disconnected";
  available: boolean;
  error: string | null;
};

export type MediaUsageEvidenceCoverage = {
  projects: MediaUsageEvidenceCoverageEntry;
  reviews: MediaUsageEvidenceCoverageEntry;
  personal_ops: MediaUsageEvidenceCoverageEntry;
  notes: MediaUsageEvidenceCoverageEntry;
  resources: MediaUsageEvidenceCoverageEntry;
  people: MediaUsageEvidenceCoverageEntry;
  finance: MediaUsageEvidenceCoverageEntry;
};

export type MediaUsageEvidenceSummary = {
  assetCount: number;
  recordCount: number;
  referencedCount: number;
  attentionCount: number;
  legacyOnlyCount: number;
  unreferencedCount: number;
  coverageIncompleteCount: number;
  missingAssetCount: number;
  placementCount: number;
  referenceRecordCount: number;
  placementStates: Record<MediaReferencePlacementState, number>;
  legacyCandidateCount: number;
  unresolvedLegacyReferenceCount: number;
  availableOwnerCount: number;
  unavailableOwnerCount: number;
  indexedOwnerModuleCount: number;
  knownOwnerModuleCount: number;
  disconnectedOwnerModuleCount: number;
};

export type MediaUsageEvidenceIndex = {
  records: MediaUsageEvidenceRecord[];
  coverage: MediaUsageEvidenceCoverage;
  summary: MediaUsageEvidenceSummary;
};

export type MediaRepositoryError = MutationError;
export type MediaRepositoryResult<T> = MutationResult<T>;
