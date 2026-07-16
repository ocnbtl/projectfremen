import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import type { LegacyContentGraph } from "../content-graph/types";
import type { PersonalOpsObject, PersonalOpsSecondaryObject, PersonalOpsState } from "../personal-ops/types";
import type { ProjectsState } from "../projects/types";
import type { ReviewsState } from "../reviews/types";
import type {
  MediaAsset,
  MediaIndexedReferenceOwnerModule,
  MediaLegacyUsageCandidate,
  MediaReferenceIdentity,
  MediaReferenceKnownOwnerModule,
  MediaReferencePlacement,
  MediaReferencePlacementState,
  MediaReferenceSourceKind,
  MediaUnresolvedLegacyUsageReference,
  MediaUsageEvidenceCoverage,
  MediaUsageEvidenceCoverageEntry,
  MediaUsageEvidenceIndex,
  MediaUsageEvidenceRecord
} from "./types";

/**
 * A source is either a successful snapshot or an explicitly unavailable
 * owner. The discriminated shape prevents a caller from silently treating a
 * failed read as an empty module.
 */
export type MediaUsageEvidenceSource<State> =
  | { available: true; error: null; state: State }
  | { available: false; error: string | null; state: null };

export type BuildMediaUsageEvidenceInput = {
  assets: readonly MediaAsset[];
  projects: MediaUsageEvidenceSource<ProjectsState>;
  reviews: MediaUsageEvidenceSource<ReviewsState>;
  personalOps: MediaUsageEvidenceSource<PersonalOpsState>;
  legacyContentGraph?: LegacyContentGraph | null;
};

type PlacementDraft = Omit<
  MediaReferencePlacement,
  "id" | "sourceKinds" | "readOnly"
>;
type PlacementInput = Omit<PlacementDraft, "referenceIdentity">;

type LegacyCandidateDraft = Omit<MediaLegacyUsageCandidate, "id" | "readOnly">;

const SOURCE_KIND_ORDER: readonly MediaReferenceSourceKind[] = [
  "project_link",
  "project_milestone",
  "project_blocker",
  "review_context",
  "review_evidence",
  "personal_ops_source",
  "personal_ops_link",
  "personal_ops_evidence",
  "personal_ops_output"
];

const MEDIA_ASSET_OBJECT_TYPES: ReadonlySet<string> = new Set([
  "media_asset",
  "asset"
]);
const MEDIA_VERSION_OBJECT_TYPES: ReadonlySet<string> = new Set([
  "asset_version"
]);
const MEDIA_DERIVATIVE_OBJECT_TYPES: ReadonlySet<string> = new Set([
  "asset_derivative"
]);
const INDEXED_OWNER_MODULE_COUNT = 3;
const KNOWN_OWNER_MODULE_COUNT = 7;

const PLACEMENT_STATE_ATTENTION: ReadonlySet<MediaReferencePlacementState> = new Set([
  "pending",
  "stale",
  "broken",
  "missing"
]);

const PLACEMENT_STATE_PRIORITY: Readonly<Record<MediaReferencePlacementState, number>> = {
  archived: 0,
  current: 1,
  pending: 2,
  stale: 3,
  missing: 4,
  broken: 5
};

function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
}

function sourceKinds(values: readonly MediaReferenceSourceKind[]): MediaReferenceSourceKind[] {
  const retained = new Set(values);
  return SOURCE_KIND_ORDER.filter((kind) => retained.has(kind));
}

function latestTimestamp(left: string, right: string): string {
  return left.localeCompare(right) >= 0 ? left : right;
}

function moreImportantState(
  left: MediaReferencePlacementState,
  right: MediaReferencePlacementState
): MediaReferencePlacementState {
  return PLACEMENT_STATE_PRIORITY[left] >= PLACEMENT_STATE_PRIORITY[right]
    ? left
    : right;
}

function refKey(ref: Pick<NativeObjectRef, "module" | "objectType" | "objectId" | "containerObjectId">) {
  return [ref.module, ref.objectType, ref.objectId, ref.containerObjectId || ""].join("|");
}

function safeLabel(value: string, fallback: string): string {
  const label = value.trim();
  return label || fallback;
}

/** Rebuilds routes through the centralized registry before client transport. */
function safeRef(ref: NativeObjectRef, fallbackLabel?: string): NativeObjectRef {
  return createNativeObjectRef({
    module: ref.module,
    objectType: ref.objectType,
    objectId: ref.objectId,
    ...(ref.containerObjectId ? { containerObjectId: ref.containerObjectId } : {}),
    label: safeLabel(ref.label, fallbackLabel || `${ref.objectType} ${ref.objectId}`),
    ...(ref.versionId ? { versionId: ref.versionId } : {})
  });
}

function canonicalAssetRef(input: {
  assetId: string;
  label: string;
  versionId?: string;
}): NativeObjectRef {
  return createNativeObjectRef({
    module: "media",
    objectType: "media_asset",
    objectId: input.assetId,
    label: input.label,
    ...(input.versionId ? { versionId: input.versionId } : {})
  });
}

type ResolvedMediaReference = {
  assetId: string;
  assetRef: NativeObjectRef;
  referenceIdentity: MediaReferenceIdentity;
};

/**
 * Only explicit native Media identities are accepted. AssetVersion and
 * AssetDerivative references must retain their parent asset in
 * `containerObjectId`; arbitrary Media object types cannot create orphans.
 */
function resolveMediaReference(
  ref: NativeObjectRef,
  assetsById: ReadonlyMap<string, MediaAsset>
): ResolvedMediaReference | null {
  if (ref.module !== "media") return null;

  if (MEDIA_ASSET_OBJECT_TYPES.has(ref.objectType)) {
    const asset = assetsById.get(ref.objectId);
    const versionId = ref.versionId || null;
    return {
      assetId: ref.objectId,
      assetRef: canonicalAssetRef({
        assetId: ref.objectId,
        label: asset?.title || safeLabel(ref.label, `Missing Media asset ${ref.objectId}`),
        ...(versionId ? { versionId } : {})
      }),
      referenceIdentity: {
        kind: versionId ? "version" : "asset",
        assetId: ref.objectId,
        objectId: versionId || ref.objectId,
        versionId
      }
    };
  }

  const assetId = ref.containerObjectId;
  if (!assetId) return null;
  const asset = assetsById.get(assetId);

  if (MEDIA_VERSION_OBJECT_TYPES.has(ref.objectType)) {
    return {
      assetId,
      assetRef: canonicalAssetRef({
        assetId,
        label: asset?.title || `Missing Media asset ${assetId}`,
        versionId: ref.objectId
      }),
      referenceIdentity: {
        kind: "version",
        assetId,
        objectId: ref.objectId,
        versionId: ref.objectId
      }
    };
  }

  if (MEDIA_DERIVATIVE_OBJECT_TYPES.has(ref.objectType)) {
    return {
      assetId,
      assetRef: canonicalAssetRef({
        assetId,
        label: asset?.title || `Missing Media asset ${assetId}`,
        ...(ref.versionId ? { versionId: ref.versionId } : {})
      }),
      referenceIdentity: {
        kind: "derivative",
        assetId,
        objectId: ref.objectId,
        versionId: ref.versionId || null
      }
    };
  }

  return null;
}

function coverageEntry<State>(
  ownerModule: MediaIndexedReferenceOwnerModule,
  source: MediaUsageEvidenceSource<State>
): MediaUsageEvidenceCoverageEntry {
  return {
    ownerModule,
    indexState: source.available ? "indexed" : "read_failed",
    available: source.available,
    error: source.error
  };
}

function disconnectedCoverageEntry(
  ownerModule: Exclude<
    MediaReferenceKnownOwnerModule,
    MediaIndexedReferenceOwnerModule
  >
): MediaUsageEvidenceCoverageEntry {
  return {
    ownerModule,
    indexState: "disconnected",
    available: false,
    error: null
  };
}

function projectTarget(
  state: ProjectsState,
  projectId: string
): { ref: NativeObjectRef; missing: boolean } {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return {
    ref: createNativeObjectRef({
      module: "projects",
      objectType: "project",
      objectId: projectId,
      label: project?.name || `Missing Project ${projectId}`
    }),
    missing: !project
  };
}

function projectChildTarget(input: {
  objectType: "milestone" | "blocker";
  objectId: string;
  projectId: string;
  label: string;
}): NativeObjectRef {
  return createNativeObjectRef({
    module: "projects",
    objectType: input.objectType,
    objectId: input.objectId,
    containerObjectId: input.projectId,
    label: input.label
  });
}

function reviewTarget(id: string, title: string): NativeObjectRef {
  return createNativeObjectRef({
    module: "reviews",
    objectType: "review_run",
    objectId: id,
    label: title
  });
}

function personalOpsTarget(item: PersonalOpsObject | PersonalOpsSecondaryObject): NativeObjectRef {
  return createNativeObjectRef({
    module: "personal_ops",
    objectType: item.objectType,
    objectId: item.id,
    label: item.title
  });
}

function projectLinkState(value: ProjectsState["links"][number]["linkState"]): MediaReferencePlacementState {
  if (value === "active") return "current";
  if (value === "pending") return "pending";
  if (value === "stale") return "stale";
  if (value === "broken") return "broken";
  if (value === "missing") return "missing";
  return "archived";
}

function reviewContextState(
  value: ReviewsState["runs"][number]["contextLinks"][number]["state"]
): MediaReferencePlacementState {
  if (value === "linked") return "current";
  if (value === "stale") return "stale";
  if (value === "broken") return "broken";
  return "archived";
}

function reviewEvidenceState(
  value: ReviewsState["runs"][number]["evidence"][number]["state"]
): MediaReferencePlacementState {
  if (value === "linked") return "current";
  if (value === "stale") return "stale";
  if (value === "missing") return "missing";
  if (value === "replaced" || value === "waived") return "archived";
  return "pending";
}

function objectReferenceState(
  item: PersonalOpsObject | PersonalOpsSecondaryObject
): MediaReferencePlacementState {
  return item.lifecycle === "archived" ? "archived" : "pending";
}

export function buildMediaUsageEvidence({
  assets,
  projects,
  reviews,
  personalOps,
  legacyContentGraph
}: BuildMediaUsageEvidenceInput): MediaUsageEvidenceIndex {
  const indexedCoverageComplete =
    projects.available && reviews.available && personalOps.available;
  const assetsById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const refsByAssetId = new Map(
    assets.map((asset) => [asset.id, safeRef(asset.nativeRef, asset.title)] as const)
  );
  const placementDrafts = new Map<
    string,
    PlacementDraft & { sourceKinds: MediaReferenceSourceKind[] }
  >();

  const retainAssetRef = (ref: NativeObjectRef) => {
    const resolved = resolveMediaReference(ref, assetsById);
    if (!resolved) return null;
    if (!refsByAssetId.has(resolved.assetId)) {
      refsByAssetId.set(
        resolved.assetId,
        canonicalAssetRef({
          assetId: resolved.assetId,
          label: assetsById.get(resolved.assetId)?.title || `Missing Media asset ${resolved.assetId}`
        })
      );
    }
    return resolved;
  };

  const addPlacement = (draft: PlacementInput) => {
    const resolved = retainAssetRef(draft.assetRef);
    if (!resolved) return;
    const { assetRef, referenceIdentity } = resolved;
    const targetRef = safeRef(draft.targetRef);
    const versionKey = [
      referenceIdentity.kind,
      referenceIdentity.objectId,
      referenceIdentity.versionId || ""
    ].join("|");
    const key = `${resolved.assetId}|${versionKey}|${draft.ownerModule}|${refKey(targetRef)}`;
    const previous = placementDrafts.get(key);
    if (!previous) {
      placementDrafts.set(key, {
        ...draft,
        assetRef,
        targetRef,
        referenceIdentity,
        sourceKinds: [draft.sourceKind],
        sourceRecordIds: unique(draft.sourceRecordIds),
        relationships: unique(draft.relationships)
      });
      return;
    }

    const kinds = sourceKinds([...previous.sourceKinds, draft.sourceKind]);
    placementDrafts.set(key, {
      ...previous,
      sourceKind: kinds[0] || previous.sourceKind,
      sourceKinds: kinds,
      sourceRecordIds: unique([...previous.sourceRecordIds, ...draft.sourceRecordIds]),
      relationships: unique([...previous.relationships, ...draft.relationships]),
      state: moreImportantState(previous.state, draft.state),
      updatedAt: latestTimestamp(previous.updatedAt, draft.updatedAt),
      caveat: unique([previous.caveat, draft.caveat]).join(" ")
    });
  };

  if (projects.available) {
    const state = projects.state;
    for (const link of state.links) {
      if (link.source.module !== "media") continue;
      const target = projectTarget(state, link.projectId);
      addPlacement({
        assetRef: link.source,
        targetRef: target.ref,
        ownerModule: "projects",
        sourceKind: "project_link",
        sourceRecordIds: [link.id],
        relationships: [link.relationship],
        state: target.missing ? "broken" : projectLinkState(link.linkState),
        updatedAt: link.updatedAt,
        caveat: target.missing
          ? "This ProjectLink retains a Media reference, but its owning Project is missing from the loaded snapshot."
          : "This ProjectLink is explicit reference evidence. It does not establish public visibility, a deployed version, replacement safety, or active delivery usage."
      });
    }

    for (const milestone of state.milestones) {
      const parentMissing = !state.projects.some((project) => project.id === milestone.projectId);
      for (const ref of milestone.linkedRefs) {
        if (ref.module !== "media") continue;
        addPlacement({
          assetRef: ref,
          targetRef: projectChildTarget({
            objectType: "milestone",
            objectId: milestone.id,
            projectId: milestone.projectId,
            label: milestone.title
          }),
          ownerModule: "projects",
          sourceKind: "project_milestone",
          sourceRecordIds: [milestone.id],
          relationships: ["linked_ref"],
          state: parentMissing ? "broken" : milestone.state === "archived" ? "archived" : "pending",
          updatedAt: milestone.updatedAt,
          caveat: parentMissing
            ? "This milestone retains a Media reference, but its owning Project is missing from the loaded snapshot."
            : "The milestone retains this linked reference. No native AssetUsage placement, visibility, or version evidence is connected."
        });
      }
    }

    for (const blocker of state.blockers) {
      const parentMissing = !state.projects.some((project) => project.id === blocker.projectId);
      for (const ref of blocker.sourceRefs) {
        if (ref.module !== "media") continue;
        addPlacement({
          assetRef: ref,
          targetRef: projectChildTarget({
            objectType: "blocker",
            objectId: blocker.id,
            projectId: blocker.projectId,
            label: blocker.title
          }),
          ownerModule: "projects",
          sourceKind: "project_blocker",
          sourceRecordIds: [blocker.id],
          relationships: ["source_ref"],
          state: parentMissing ? "broken" : blocker.state === "archived" ? "archived" : "pending",
          updatedAt: blocker.updatedAt,
          caveat: parentMissing
            ? "This blocker retains a Media reference, but its owning Project is missing from the loaded snapshot."
            : "The blocker retains this source reference. It is evidence of project context, not evidence that the asset is actively deployed or safe to replace."
        });
      }
    }
  }

  if (reviews.available) {
    for (const run of reviews.state.runs) {
      const targetRef = reviewTarget(run.id, run.title);
      const targetArchived = run.lifecycle === "archived";

      for (const context of run.contextLinks) {
        if (context.sourceRef.module !== "media") continue;
        addPlacement({
          assetRef: context.sourceRef,
          targetRef,
          ownerModule: "reviews",
          sourceKind: "review_context",
          sourceRecordIds: [context.id],
          relationships: [context.relationship],
          state: targetArchived ? "archived" : reviewContextState(context.state),
          updatedAt: context.removedAt || context.linkedAt,
          caveat: "The Review run retains an explicit context reference. This does not establish product visibility, active delivery usage, or replacement safety."
        });
      }

      for (const evidence of run.evidence) {
        // Duplicate evidence is represented by its retained canonical context,
        // not counted again as a separate placement.
        if (evidence.state === "duplicate") continue;

        if (evidence.sourceRef?.module === "media") {
          addPlacement({
            assetRef: evidence.sourceRef,
            targetRef,
            ownerModule: "reviews",
            sourceKind: "review_evidence",
            sourceRecordIds: [evidence.id],
            relationships: [evidence.relationship, "evidence_source"],
            state: targetArchived ? "archived" : reviewEvidenceState(evidence.state),
            updatedAt: evidence.updatedAt,
            caveat: "This Review evidence item references the asset. It records evidence use within the Review, not a native AssetUsage placement or a replacement dependency."
          });
        }

        const replacement = evidence.replacement;
        if (replacement?.replacementSourceRef.module === "media") {
          addPlacement({
            assetRef: replacement.replacementSourceRef,
            targetRef,
            ownerModule: "reviews",
            sourceKind: "review_evidence",
            sourceRecordIds: [evidence.id],
            relationships: [evidence.relationship, "replacement_source"],
            state: targetArchived
              ? "archived"
              : replacement.reviewed
                ? "current"
                : "pending",
            updatedAt: evidence.updatedAt,
            caveat: "The asset is named as Review replacement evidence. Replacement review state does not establish Media version rollback, usage synchronization, or external visibility."
          });
        }
      }
    }
  }

  const addPersonalOpsRef = (
    item: PersonalOpsObject | PersonalOpsSecondaryObject,
    ref: NativeObjectRef | undefined,
    sourceKind: MediaReferenceSourceKind,
    relationship: string,
    sourceRecordId: string
  ) => {
    if (!ref || ref.module !== "media") return;
    addPlacement({
      assetRef: ref,
      targetRef: personalOpsTarget(item),
      ownerModule: "personal_ops",
      sourceKind,
      sourceRecordIds: [sourceRecordId],
      relationships: [relationship],
      state: objectReferenceState(item),
      updatedAt: item.updatedAt,
      caveat: "Personal Ops retains this explicit reference for operating context. It is not proof of public visibility, active delivery usage, or version replacement safety."
    });
  };

  if (personalOps.available) {
    const state = personalOps.state;
    const core: PersonalOpsObject[] = [
      ...state.goals,
      ...state.decisions,
      ...state.obligations,
      ...state.followUps
    ];

    for (const item of core) {
      item.sourceRefs.forEach((ref) =>
        addPersonalOpsRef(item, ref, "personal_ops_source", "source_ref", item.id)
      );
      item.linkedRefs.forEach((ref) =>
        addPersonalOpsRef(item, ref, "personal_ops_link", "linked_ref", item.id)
      );
    }

    for (const decision of state.decisions) {
      addPersonalOpsRef(
        decision,
        decision.supersededBy,
        "personal_ops_link",
        "superseded_by",
        decision.id
      );
    }

    for (const obligation of state.obligations) {
      obligation.requiredEvidence.forEach((requirement) =>
        addPersonalOpsRef(
          obligation,
          requirement.evidenceRef,
          "personal_ops_evidence",
          `evidence_requirement:${requirement.id}`,
          requirement.id
        )
      );
    }

    for (const routine of state.routines) {
      routine.linkedRefs.forEach((ref) =>
        addPersonalOpsRef(routine, ref, "personal_ops_link", "linked_ref", routine.id)
      );
      routine.runHistory.forEach((run) => {
        run.generatedRefs.forEach((ref) =>
          addPersonalOpsRef(routine, ref, "personal_ops_output", "run_generated_ref", run.id)
        );
        run.results.forEach((result) =>
          addPersonalOpsRef(
            routine,
            result.createdRef,
            "personal_ops_output",
            "run_result_ref",
            run.id
          )
        );
      });
    }

    for (const capture of state.captures) {
      capture.linkedRefs.forEach((ref) =>
        addPersonalOpsRef(capture, ref, "personal_ops_link", "linked_ref", capture.id)
      );
      addPersonalOpsRef(
        capture,
        capture.source.sourceRef,
        "personal_ops_source",
        "capture_source",
        capture.id
      );
      capture.processedRefs.forEach((ref) =>
        addPersonalOpsRef(capture, ref, "personal_ops_output", "processed_ref", capture.id)
      );
      capture.processingActions.forEach((action) =>
        action.createdRefs.forEach((ref) =>
          addPersonalOpsRef(capture, ref, "personal_ops_output", "processing_output", action.id)
        )
      );
    }

    for (const template of state.templates) {
      template.linkedRefs.forEach((ref) =>
        addPersonalOpsRef(template, ref, "personal_ops_link", "linked_ref", template.id)
      );
      template.usages.forEach((usage) =>
        addPersonalOpsRef(template, usage.createdRef, "personal_ops_output", "usage_output", usage.id)
      );
    }
  }

  const legacyCandidateDrafts = new Map<string, LegacyCandidateDraft>();
  const unresolvedByAssetId = new Map<string, MediaUnresolvedLegacyUsageReference[]>();

  if (legacyContentGraph) {
    for (const candidate of legacyContentGraph.linkCandidates) {
      // URL identity belongs to Resources and must never be presented as
      // Media usage evidence.
      if (candidate.relationship !== "legacy_relation_candidate") continue;

      const sides: Array<{ assetRef: NativeObjectRef; targetRef: NativeObjectRef }> = [];
      if (candidate.source.module === "media") {
        sides.push({ assetRef: candidate.source, targetRef: candidate.target });
      }
      if (candidate.target.module === "media") {
        sides.push({ assetRef: candidate.target, targetRef: candidate.source });
      }

      for (const side of sides) {
        const resolved = retainAssetRef(side.assetRef);
        if (!resolved) continue;
        const { assetRef, referenceIdentity } = resolved;
        const targetRef = safeRef(side.targetRef);
        const key = [
          resolved.assetId,
          referenceIdentity.kind,
          referenceIdentity.objectId,
          referenceIdentity.versionId || "",
          refKey(targetRef)
        ].join("|");
        const previous = legacyCandidateDrafts.get(key);
        const direction = candidate.legacyDirection || "unknown";
        if (!previous) {
          legacyCandidateDrafts.set(key, {
            assetRef,
            targetRef,
            candidateIds: [candidate.id],
            relationships: [candidate.relationship],
            evidenceFields: [candidate.evidenceField],
            legacyDirections: [direction],
            ambiguity: candidate.ambiguity,
            caveat: candidate.caveat
          });
          continue;
        }
        legacyCandidateDrafts.set(key, {
          ...previous,
          candidateIds: unique([...previous.candidateIds, candidate.id]),
          relationships: unique([...previous.relationships, candidate.relationship]),
          evidenceFields: unique([...previous.evidenceFields, candidate.evidenceField]),
          legacyDirections: unique([...previous.legacyDirections, direction]),
          ambiguity:
            previous.ambiguity === "multiple_targets" || candidate.ambiguity === "multiple_targets"
              ? "multiple_targets"
              : "unique",
          caveat: unique([previous.caveat, candidate.caveat]).join(" ")
        });
      }
    }

    for (const reference of legacyContentGraph.unresolvedReferences) {
      if (reference.kind !== "legacy_relation_id" || reference.source.module !== "media") {
        continue;
      }
      const resolved = retainAssetRef(reference.source);
      if (!resolved) continue;
      const { assetRef } = resolved;
      const retained: MediaUnresolvedLegacyUsageReference = {
        id: reference.id,
        assetRef,
        value: reference.value,
        evidenceField: reference.evidenceField,
        legacyDirection: reference.legacyDirection || null,
        readOnly: true,
        caveat: reference.caveat
      };
      unresolvedByAssetId.set(resolved.assetId, [
        ...(unresolvedByAssetId.get(resolved.assetId) || []),
        retained
      ]);
    }
  }

  const placementsByAssetId = new Map<string, MediaReferencePlacement[]>();
  for (const [key, draft] of placementDrafts) {
    const placement: MediaReferencePlacement = {
      ...draft,
      id: stableId("media-reference-placement", key),
      sourceKinds: sourceKinds(draft.sourceKinds),
      readOnly: true
    };
    placementsByAssetId.set(placement.assetRef.objectId, [
      ...(placementsByAssetId.get(placement.assetRef.objectId) || []),
      placement
    ]);
  }

  const legacyCandidatesByAssetId = new Map<string, MediaLegacyUsageCandidate[]>();
  for (const [key, draft] of legacyCandidateDrafts) {
    const candidate: MediaLegacyUsageCandidate = {
      ...draft,
      id: stableId("media-legacy-usage-candidate", key),
      readOnly: true
    };
    legacyCandidatesByAssetId.set(candidate.assetRef.objectId, [
      ...(legacyCandidatesByAssetId.get(candidate.assetRef.objectId) || []),
      candidate
    ]);
  }

  const records: MediaUsageEvidenceRecord[] = Array.from(refsByAssetId, ([assetId, assetRef]) => {
    const asset = assetsById.get(assetId) || null;
    const placements = (placementsByAssetId.get(assetId) || []).sort((left, right) =>
      [left.ownerModule, left.targetRef.label, left.targetRef.objectId]
        .join("|")
        .localeCompare([right.ownerModule, right.targetRef.label, right.targetRef.objectId].join("|"), undefined, {
          sensitivity: "base"
        })
    );
    const legacyCandidates = (legacyCandidatesByAssetId.get(assetId) || []).sort((left, right) =>
      [left.targetRef.module, left.targetRef.label, left.targetRef.objectId]
        .join("|")
        .localeCompare([right.targetRef.module, right.targetRef.label, right.targetRef.objectId].join("|"), undefined, {
          sensitivity: "base"
        })
    );
    const unresolvedLegacyReferences = (unresolvedByAssetId.get(assetId) || []).sort((left, right) =>
      [left.legacyDirection || "", left.value, left.evidenceField]
        .join("|")
        .localeCompare([right.legacyDirection || "", right.value, right.evidenceField].join("|"), undefined, {
          sensitivity: "base"
        })
    );

    const hasAttention =
      placements.some((placement) => PLACEMENT_STATE_ATTENTION.has(placement.state)) ||
      unresolvedLegacyReferences.length > 0;
    const state: MediaUsageEvidenceRecord["state"] = !asset
      ? "missing_asset"
      : placements.length > 0
        ? hasAttention
          ? "attention"
          : "referenced"
        : legacyCandidates.length > 0 || unresolvedLegacyReferences.length > 0
          ? "legacy_only"
          : indexedCoverageComplete
            ? "unreferenced"
            : "coverage_incomplete";

    return {
      id: stableId("media-usage-evidence", assetId),
      assetRef,
      asset,
      placements,
      legacyCandidates,
      unresolvedLegacyReferences,
      state
    };
  }).sort((left, right) =>
    [left.asset?.title || left.assetRef.label, left.assetRef.objectId]
      .join("|")
      .localeCompare([right.asset?.title || right.assetRef.label, right.assetRef.objectId].join("|"), undefined, {
        sensitivity: "base"
      })
  );

  const coverage: MediaUsageEvidenceCoverage = {
    projects: coverageEntry("projects", projects),
    reviews: coverageEntry("reviews", reviews),
    personal_ops: coverageEntry("personal_ops", personalOps),
    notes: disconnectedCoverageEntry("notes"),
    resources: disconnectedCoverageEntry("resources"),
    people: disconnectedCoverageEntry("people"),
    finance: disconnectedCoverageEntry("finance")
  };
  const allPlacements = records.flatMap((record) => record.placements);
  const placementStates: MediaUsageEvidenceIndex["summary"]["placementStates"] = {
    current: 0,
    pending: 0,
    stale: 0,
    broken: 0,
    missing: 0,
    archived: 0
  };
  allPlacements.forEach((placement) => {
    placementStates[placement.state] += 1;
  });
  const coverageEntries = Object.values(coverage);
  const referenceRecordCount = new Set(
    allPlacements.flatMap((placement) =>
      placement.sourceRecordIds.map(
        (sourceRecordId) => `${placement.ownerModule}|${sourceRecordId}`
      )
    )
  ).size;

  return {
    records,
    coverage,
    summary: {
      assetCount: assets.length,
      recordCount: records.length,
      referencedCount: records.filter((record) => record.state === "referenced").length,
      attentionCount: records.filter((record) => record.state === "attention").length,
      legacyOnlyCount: records.filter((record) => record.state === "legacy_only").length,
      unreferencedCount: records.filter((record) => record.state === "unreferenced").length,
      coverageIncompleteCount: records.filter((record) => record.state === "coverage_incomplete").length,
      missingAssetCount: records.filter((record) => record.state === "missing_asset").length,
      placementCount: allPlacements.length,
      referenceRecordCount,
      placementStates,
      legacyCandidateCount: records.reduce(
        (total, record) => total + record.legacyCandidates.length,
        0
      ),
      unresolvedLegacyReferenceCount: records.reduce(
        (total, record) => total + record.unresolvedLegacyReferences.length,
        0
      ),
      availableOwnerCount: coverageEntries.filter(
        (entry) => entry.indexState === "indexed" && entry.available
      ).length,
      unavailableOwnerCount: coverageEntries.filter(
        (entry) => entry.indexState === "read_failed"
      ).length,
      indexedOwnerModuleCount: INDEXED_OWNER_MODULE_COUNT,
      knownOwnerModuleCount: KNOWN_OWNER_MODULE_COUNT,
      disconnectedOwnerModuleCount: coverageEntries.filter(
        (entry) => entry.indexState === "disconnected"
      ).length
    }
  };
}
