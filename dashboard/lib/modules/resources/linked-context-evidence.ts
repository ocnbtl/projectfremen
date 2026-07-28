import { createNativeObjectRef } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import type {
  LegacyContentGraph,
  LegacyContentLinkCandidate
} from "../content-graph/types";
import type {
  PersonalOpsObject,
  PersonalOpsSecondaryObject,
  PersonalOpsState
} from "../personal-ops/types";
import type { ProjectsState } from "../projects/types";
import type { ReviewsState } from "../reviews/types";
import type { ResourceRecord } from "./types";

export const RESOURCE_LINKED_CONTEXT_MODULES = [
  "people",
  "projects",
  "notes",
  "finance",
  "reviews",
  "personal_ops"
] as const;

export type ResourceLinkedContextModule =
  (typeof RESOURCE_LINKED_CONTEXT_MODULES)[number];

export type ResourceLinkedContextView =
  | "linked-people"
  | "linked-projects"
  | "linked-notes"
  | "linked-finance"
  | "linked-reviews"
  | "linked-personal-ops";

export const RESOURCE_LINKED_CONTEXT_VIEW_BY_MODULE: Readonly<
  Record<ResourceLinkedContextModule, ResourceLinkedContextView>
> = {
  people: "linked-people",
  projects: "linked-projects",
  notes: "linked-notes",
  finance: "linked-finance",
  reviews: "linked-reviews",
  personal_ops: "linked-personal-ops"
};

export const RESOURCE_LINKED_CONTEXT_MODULE_BY_VIEW: Readonly<
  Record<ResourceLinkedContextView, ResourceLinkedContextModule>
> = {
  "linked-people": "people",
  "linked-projects": "projects",
  "linked-notes": "notes",
  "linked-finance": "finance",
  "linked-reviews": "reviews",
  "linked-personal-ops": "personal_ops"
};

export type ResourceLinkedContextEvidenceSource<State> =
  | { available: true; error: null; state: State }
  | { available: false; error: string | null; state: null };

export type ResourceLinkedContextEvidenceState =
  | "current"
  | "pending"
  | "stale"
  | "broken"
  | "missing"
  | "archived";

export type ResourceLinkedContextSourceKind =
  | "legacy_content_candidate"
  | "project_link"
  | "project_milestone"
  | "project_blocker"
  | "project_timeline"
  | "review_context"
  | "review_evidence"
  | "review_decision"
  | "review_follow_up"
  | "review_carry_forward"
  | "personal_ops_source"
  | "personal_ops_link"
  | "personal_ops_evidence"
  | "personal_ops_output";

export type ResourceLinkedContextPlacement = {
  id: string;
  resourceId: string;
  ownerModule: ResourceLinkedContextModule;
  ownerRef: NativeObjectRef;
  sourceKinds: ResourceLinkedContextSourceKind[];
  sourceRecordIds: string[];
  relationships: string[];
  state: ResourceLinkedContextEvidenceState;
  evidenceSignalCount: number;
  ambiguity: "unique" | "multiple_targets";
  updatedAt: string | null;
  readOnly: true;
  caveat: string;
};

export type ResourceLinkedContextRecord = {
  resourceId: string;
  placements: ResourceLinkedContextPlacement[];
  unresolvedLegacyReferenceCount: number;
};

export type ResourceLinkedContextCoverageEntry = {
  ownerModule: ResourceLinkedContextModule;
  state: "indexed" | "read_failed" | "disconnected";
  available: boolean;
  error: string | null;
};

export type ResourceLinkedContextModuleSummary = {
  affectedResources: number;
  ownerTargets: number;
  evidenceSignals: number;
  attentionTargets: number;
  ambiguousTargets: number;
};

export type ResourceLinkedContextEvidenceIndex = {
  records: ResourceLinkedContextRecord[];
  coverage: Record<
    ResourceLinkedContextModule,
    ResourceLinkedContextCoverageEntry
  >;
  summary: Record<
    ResourceLinkedContextModule,
    ResourceLinkedContextModuleSummary
  >;
};

export type BuildResourceLinkedContextEvidenceInput = {
  resources: readonly ResourceRecord[];
  legacyContent: ResourceLinkedContextEvidenceSource<LegacyContentGraph>;
  projects: ResourceLinkedContextEvidenceSource<ProjectsState>;
  reviews: ResourceLinkedContextEvidenceSource<ReviewsState>;
  personalOps: ResourceLinkedContextEvidenceSource<PersonalOpsState>;
};

type PlacementDraft = Omit<
  ResourceLinkedContextPlacement,
  "id" | "sourceKinds" | "evidenceSignalCount" | "readOnly"
> & {
  sourceKind: ResourceLinkedContextSourceKind;
};

const SOURCE_KIND_ORDER: readonly ResourceLinkedContextSourceKind[] = [
  "legacy_content_candidate",
  "project_link",
  "project_milestone",
  "project_blocker",
  "project_timeline",
  "review_context",
  "review_evidence",
  "review_decision",
  "review_follow_up",
  "review_carry_forward",
  "personal_ops_source",
  "personal_ops_link",
  "personal_ops_evidence",
  "personal_ops_output"
];

const STATE_PRIORITY: Readonly<
  Record<ResourceLinkedContextEvidenceState, number>
> = {
  archived: 0,
  current: 1,
  pending: 2,
  stale: 3,
  missing: 4,
  broken: 5
};

const ATTENTION_STATES: ReadonlySet<ResourceLinkedContextEvidenceState> =
  new Set(["pending", "stale", "missing", "broken"]);

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

function orderedSourceKinds(
  values: readonly ResourceLinkedContextSourceKind[]
): ResourceLinkedContextSourceKind[] {
  const retained = new Set(values);
  return SOURCE_KIND_ORDER.filter((kind) => retained.has(kind));
}

function moreImportantState(
  left: ResourceLinkedContextEvidenceState,
  right: ResourceLinkedContextEvidenceState
): ResourceLinkedContextEvidenceState {
  return STATE_PRIORITY[left] >= STATE_PRIORITY[right] ? left : right;
}

function latestTimestamp(
  left: string | null,
  right: string | null
): string | null {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) >= 0 ? left : right;
}

function safeRef(ref: NativeObjectRef): NativeObjectRef {
  return createNativeObjectRef({
    module: ref.module,
    objectType: ref.objectType,
    objectId: ref.objectId,
    ...(ref.containerObjectId
      ? { containerObjectId: ref.containerObjectId }
      : {}),
    label: ref.label.trim() || `${ref.objectType} ${ref.objectId}`,
    ...(ref.versionId ? { versionId: ref.versionId } : {})
  });
}

function resourceIdForRef(
  ref: NativeObjectRef | undefined,
  resourceIds: ReadonlySet<string>
): string | null {
  if (!ref || ref.module !== "resources") return null;
  return resourceIds.has(ref.objectId) ? ref.objectId : null;
}

function coverageEntry<State>(
  ownerModule: ResourceLinkedContextModule,
  source: ResourceLinkedContextEvidenceSource<State>
): ResourceLinkedContextCoverageEntry {
  return {
    ownerModule,
    state: source.available ? "indexed" : "read_failed",
    available: source.available,
    error: source.error
  };
}

function disconnectedCoverageEntry(
  ownerModule: ResourceLinkedContextModule
): ResourceLinkedContextCoverageEntry {
  return {
    ownerModule,
    state: "disconnected",
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
  objectType: "milestone" | "blocker" | "timeline_event";
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

function personalOpsTarget(
  item: PersonalOpsObject | PersonalOpsSecondaryObject
): NativeObjectRef {
  return createNativeObjectRef({
    module: "personal_ops",
    objectType: item.objectType,
    objectId: item.id,
    label: item.title
  });
}

function projectLinkState(
  value: ProjectsState["links"][number]["linkState"]
): ResourceLinkedContextEvidenceState {
  if (value === "active") return "current";
  if (value === "pending") return "pending";
  if (value === "stale") return "stale";
  if (value === "broken") return "broken";
  if (value === "missing") return "missing";
  return "archived";
}

function reviewContextState(
  value: ReviewsState["runs"][number]["contextLinks"][number]["state"]
): ResourceLinkedContextEvidenceState {
  if (value === "linked") return "current";
  if (value === "stale") return "stale";
  if (value === "broken") return "broken";
  return "archived";
}

function reviewEvidenceState(
  value: ReviewsState["runs"][number]["evidence"][number]["state"]
): ResourceLinkedContextEvidenceState {
  if (value === "linked") return "current";
  if (value === "stale") return "stale";
  if (value === "missing") return "missing";
  if (value === "waived" || value === "replaced") return "archived";
  return "pending";
}

function objectReferenceState(
  item: PersonalOpsObject | PersonalOpsSecondaryObject
): ResourceLinkedContextEvidenceState {
  return item.lifecycle === "archived" ? "archived" : "current";
}

function legacyOwnerModule(
  candidate: LegacyContentLinkCandidate,
  resourceId: string
): ResourceLinkedContextModule | null {
  const other =
    candidate.source.module === "resources" &&
    candidate.source.objectId === resourceId
      ? candidate.target
      : candidate.target.module === "resources" &&
          candidate.target.objectId === resourceId
        ? candidate.source
        : null;
  if (!other) return null;
  return other.module === "notes" || other.module === "people"
    ? other.module
    : null;
}

export function buildResourceLinkedContextEvidence({
  resources,
  legacyContent,
  projects,
  reviews,
  personalOps
}: BuildResourceLinkedContextEvidenceInput): ResourceLinkedContextEvidenceIndex {
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const placementDrafts = new Map<
    string,
    Omit<PlacementDraft, "sourceKind"> & {
      sourceKinds: ResourceLinkedContextSourceKind[];
    }
  >();

  const addPlacement = (draft: PlacementDraft) => {
    if (!resourceIds.has(draft.resourceId)) return;
    const ownerRef = safeRef(draft.ownerRef);
    const key = [
      draft.resourceId,
      draft.ownerModule,
      ownerRef.objectType,
      ownerRef.objectId,
      ownerRef.containerObjectId || ""
    ].join("|");
    const previous = placementDrafts.get(key);
    if (!previous) {
      placementDrafts.set(key, {
        ...draft,
        ownerRef,
        sourceKinds: [draft.sourceKind],
        sourceRecordIds: unique(draft.sourceRecordIds),
        relationships: unique(draft.relationships)
      });
      return;
    }
    placementDrafts.set(key, {
      ...previous,
      sourceKinds: orderedSourceKinds([
        ...previous.sourceKinds,
        draft.sourceKind
      ]),
      sourceRecordIds: unique([
        ...previous.sourceRecordIds,
        ...draft.sourceRecordIds
      ]),
      relationships: unique([
        ...previous.relationships,
        ...draft.relationships
      ]),
      state: moreImportantState(previous.state, draft.state),
      ambiguity:
        previous.ambiguity === "multiple_targets" ||
        draft.ambiguity === "multiple_targets"
          ? "multiple_targets"
          : "unique",
      updatedAt: latestTimestamp(previous.updatedAt, draft.updatedAt),
      caveat: unique([previous.caveat, draft.caveat]).join(" ")
    });
  };

  if (legacyContent.available) {
    for (const candidate of legacyContent.state.linkCandidates) {
      const resourceRef =
        candidate.source.module === "resources"
          ? candidate.source
          : candidate.target.module === "resources"
            ? candidate.target
            : null;
      const resourceId = resourceIdForRef(resourceRef || undefined, resourceIds);
      if (!resourceId) continue;
      const ownerModule = legacyOwnerModule(candidate, resourceId);
      if (!ownerModule) continue;
      const ownerRef =
        candidate.source.module === "resources"
          ? candidate.target
          : candidate.source;
      addPlacement({
        resourceId,
        ownerModule,
        ownerRef,
        sourceKind: "legacy_content_candidate",
        sourceRecordIds: [candidate.id],
        relationships: [candidate.relationship],
        state: "pending",
        ambiguity: candidate.ambiguity,
        updatedAt: null,
        caveat: candidate.caveat
      });
    }
  }

  if (projects.available) {
    const state = projects.state;
    for (const link of state.links) {
      const resourceId = resourceIdForRef(link.source, resourceIds);
      if (!resourceId) continue;
      const target = projectTarget(state, link.projectId);
      addPlacement({
        resourceId,
        ownerModule: "projects",
        ownerRef: target.ref,
        sourceKind: "project_link",
        sourceRecordIds: [link.id],
        relationships: [link.relationship],
        state: target.missing ? "broken" : projectLinkState(link.linkState),
        ambiguity: "unique",
        updatedAt: link.updatedAt,
        caveat: target.missing
          ? "This ProjectLink retains the Resource reference, but its owning Project is missing from the loaded snapshot."
          : "Projects owns this explicit reference and its relationship state. It is not a Resource-owned ResourceLink or a usage audit event."
      });
    }

    for (const milestone of state.milestones) {
      const parentMissing = !state.projects.some(
        (project) => project.id === milestone.projectId
      );
      for (const ref of milestone.linkedRefs) {
        const resourceId = resourceIdForRef(ref, resourceIds);
        if (!resourceId) continue;
        addPlacement({
          resourceId,
          ownerModule: "projects",
          ownerRef: projectChildTarget({
            objectType: "milestone",
            objectId: milestone.id,
            projectId: milestone.projectId,
            label: milestone.title
          }),
          sourceKind: "project_milestone",
          sourceRecordIds: [milestone.id],
          relationships: ["linked_ref"],
          state: parentMissing
            ? "broken"
            : milestone.state === "archived"
              ? "archived"
              : "current",
          ambiguity: "unique",
          updatedAt: milestone.updatedAt,
          caveat: "The Project milestone retains this explicit context reference. Projects remains the owner of milestone state."
        });
      }
    }

    for (const blocker of state.blockers) {
      const parentMissing = !state.projects.some(
        (project) => project.id === blocker.projectId
      );
      for (const ref of blocker.sourceRefs) {
        const resourceId = resourceIdForRef(ref, resourceIds);
        if (!resourceId) continue;
        addPlacement({
          resourceId,
          ownerModule: "projects",
          ownerRef: projectChildTarget({
            objectType: "blocker",
            objectId: blocker.id,
            projectId: blocker.projectId,
            label: blocker.title
          }),
          sourceKind: "project_blocker",
          sourceRecordIds: [blocker.id],
          relationships: ["source_ref"],
          state: parentMissing
            ? "broken"
            : blocker.state === "archived"
              ? "archived"
              : "current",
          ambiguity: "unique",
          updatedAt: blocker.updatedAt,
          caveat: "The Project blocker retains this source reference. Projects remains the owner of blocker state."
        });
      }
    }

    for (const event of state.timelineEvents) {
      for (const [relationship, ref] of [
        ["source_ref", event.sourceRef],
        ["related_object_ref", event.relatedObjectRef]
      ] as const) {
        const resourceId = resourceIdForRef(ref, resourceIds);
        if (!resourceId) continue;
        addPlacement({
          resourceId,
          ownerModule: "projects",
          ownerRef: projectChildTarget({
            objectType: "timeline_event",
            objectId: event.id,
            projectId: event.projectId,
            label: event.title
          }),
          sourceKind: "project_timeline",
          sourceRecordIds: [event.id],
          relationships: [relationship],
          state: state.projects.some(
            (project) => project.id === event.projectId
          )
            ? "current"
            : "broken",
          ambiguity: "unique",
          updatedAt: event.occurredAt,
          caveat: "The Project timeline event retains this reference as historical context. It is not a Resource usage event."
        });
      }
    }
  }

  if (reviews.available) {
    for (const run of reviews.state.runs) {
      const ownerRef = reviewTarget(run.id, run.title);
      const runArchived =
        run.lifecycle === "archived" || run.lifecycle === "canceled";

      for (const context of run.contextLinks) {
        const resourceId = resourceIdForRef(
          context.sourceRef,
          resourceIds
        );
        if (!resourceId) continue;
        addPlacement({
          resourceId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_context",
          sourceRecordIds: [context.id],
          relationships: [context.relationship],
          state: runArchived
            ? "archived"
            : reviewContextState(context.state),
          ambiguity: "unique",
          updatedAt: context.removedAt || context.linkedAt,
          caveat: "Reviews owns this explicit context reference and ReviewRun state. Resources does not complete or mutate the run."
        });
      }

      for (const evidence of run.evidence) {
        const evidenceRefs = [
          ["evidence_source", evidence.sourceRef],
          ["replacement_source", evidence.replacement?.replacementSourceRef]
        ] as const;
        for (const [relationship, ref] of evidenceRefs) {
          const resourceId = resourceIdForRef(ref, resourceIds);
          if (!resourceId) continue;
          addPlacement({
            resourceId,
            ownerModule: "reviews",
            ownerRef,
            sourceKind: "review_evidence",
            sourceRecordIds: [evidence.id],
            relationships: [evidence.relationship, relationship],
            state: runArchived
              ? "archived"
              : reviewEvidenceState(evidence.state),
            ambiguity: "unique",
            updatedAt: evidence.updatedAt,
            caveat: "The Review evidence item retains this Resource reference. Evidence-use state remains owned by Reviews."
          });
        }
      }

      for (const decision of run.decisions) {
        const resourceId = resourceIdForRef(decision.sourceRef, resourceIds);
        if (!resourceId) continue;
        addPlacement({
          resourceId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_decision",
          sourceRecordIds: [decision.id],
          relationships: ["decision_source"],
          state: runArchived ? "archived" : "current",
          ambiguity: "unique",
          updatedAt: decision.updatedAt,
          caveat: "The Resource is retained as Review decision context. Durable Decision ownership remains in Personal Ops."
        });
      }

      for (const followUp of run.followUps) {
        const resourceId = resourceIdForRef(followUp.sourceRef, resourceIds);
        if (!resourceId) continue;
        addPlacement({
          resourceId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_follow_up",
          sourceRecordIds: [followUp.id],
          relationships: ["follow_up_source"],
          state: runArchived ? "archived" : "current",
          ambiguity: "unique",
          updatedAt: followUp.updatedAt,
          caveat: "The Resource is retained as Review follow-up context. Actionable Follow-up ownership remains in Personal Ops."
        });
      }

      for (const carryForward of run.carryForward) {
        const resourceId = resourceIdForRef(
          carryForward.sourceRef,
          resourceIds
        );
        if (!resourceId) continue;
        addPlacement({
          resourceId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_carry_forward",
          sourceRecordIds: [carryForward.id],
          relationships: ["carry_forward_source"],
          state: runArchived ? "archived" : "current",
          ambiguity: "unique",
          updatedAt: carryForward.updatedAt,
          caveat: "The Resource remains Review carry-forward context. Reviews owns carry-forward resolution."
        });
      }
    }
  }

  const addPersonalOpsRef = (
    item: PersonalOpsObject | PersonalOpsSecondaryObject,
    ref: NativeObjectRef | undefined,
    sourceKind: ResourceLinkedContextSourceKind,
    relationship: string,
    sourceRecordId: string
  ) => {
    const resourceId = resourceIdForRef(ref, resourceIds);
    if (!resourceId) return;
    addPlacement({
      resourceId,
      ownerModule: "personal_ops",
      ownerRef: personalOpsTarget(item),
      sourceKind,
      sourceRecordIds: [sourceRecordId],
      relationships: [relationship],
      state: objectReferenceState(item),
      ambiguity: "unique",
      updatedAt: item.updatedAt,
      caveat: "Personal Ops retains this explicit operating-context reference. It owns due dates, completion, decisions, obligations, routines, and follow-ups."
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
        addPersonalOpsRef(
          item,
          ref,
          "personal_ops_source",
          "source_ref",
          item.id
        )
      );
      item.linkedRefs.forEach((ref) =>
        addPersonalOpsRef(
          item,
          ref,
          "personal_ops_link",
          "linked_ref",
          item.id
        )
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
        addPersonalOpsRef(
          routine,
          ref,
          "personal_ops_link",
          "linked_ref",
          routine.id
        )
      );
      routine.runHistory.forEach((run) => {
        run.generatedRefs.forEach((ref) =>
          addPersonalOpsRef(
            routine,
            ref,
            "personal_ops_output",
            "run_generated_ref",
            run.id
          )
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
        addPersonalOpsRef(
          capture,
          ref,
          "personal_ops_link",
          "linked_ref",
          capture.id
        )
      );
      addPersonalOpsRef(
        capture,
        capture.source.sourceRef,
        "personal_ops_source",
        "capture_source",
        capture.id
      );
      capture.processedRefs.forEach((ref) =>
        addPersonalOpsRef(
          capture,
          ref,
          "personal_ops_output",
          "processed_ref",
          capture.id
        )
      );
    }

    for (const template of state.templates) {
      template.linkedRefs.forEach((ref) =>
        addPersonalOpsRef(
          template,
          ref,
          "personal_ops_link",
          "linked_ref",
          template.id
        )
      );
      template.usages.forEach((usage) =>
        addPersonalOpsRef(
          template,
          usage.createdRef,
          "personal_ops_output",
          "usage_output",
          usage.id
        )
      );
    }
  }

  const placementsByResourceId = new Map<
    string,
    ResourceLinkedContextPlacement[]
  >();
  for (const [key, draft] of placementDrafts) {
    const placement: ResourceLinkedContextPlacement = {
      ...draft,
      id: stableId("resource-linked-context", key),
      sourceKinds: orderedSourceKinds(draft.sourceKinds),
      evidenceSignalCount: draft.sourceRecordIds.length,
      readOnly: true
    };
    placementsByResourceId.set(placement.resourceId, [
      ...(placementsByResourceId.get(placement.resourceId) || []),
      placement
    ]);
  }

  const unresolvedByResourceId = new Map<string, number>();
  if (legacyContent.available) {
    for (const reference of legacyContent.state.unresolvedReferences) {
      if (reference.source.module !== "resources") continue;
      if (!resourceIds.has(reference.source.objectId)) continue;
      unresolvedByResourceId.set(
        reference.source.objectId,
        (unresolvedByResourceId.get(reference.source.objectId) || 0) + 1
      );
    }
  }

  const records = resources.map((resource) => ({
    resourceId: resource.id,
    placements: (placementsByResourceId.get(resource.id) || []).sort(
      (left, right) =>
        [
          RESOURCE_LINKED_CONTEXT_MODULES.indexOf(left.ownerModule),
          left.ownerRef.label,
          left.ownerRef.objectId
        ]
          .join("|")
          .localeCompare(
            [
              RESOURCE_LINKED_CONTEXT_MODULES.indexOf(right.ownerModule),
              right.ownerRef.label,
              right.ownerRef.objectId
            ].join("|"),
            undefined,
            { sensitivity: "base" }
          )
    ),
    unresolvedLegacyReferenceCount:
      unresolvedByResourceId.get(resource.id) || 0
  }));

  const coverage: ResourceLinkedContextEvidenceIndex["coverage"] = {
    people: coverageEntry("people", legacyContent),
    projects: coverageEntry("projects", projects),
    notes: coverageEntry("notes", legacyContent),
    finance: disconnectedCoverageEntry("finance"),
    reviews: coverageEntry("reviews", reviews),
    personal_ops: coverageEntry("personal_ops", personalOps)
  };

  const summary = Object.fromEntries(
    RESOURCE_LINKED_CONTEXT_MODULES.map((ownerModule) => {
      const placements = records.flatMap((record) =>
        record.placements.filter(
          (placement) => placement.ownerModule === ownerModule
        )
      );
      return [
        ownerModule,
        {
          affectedResources: new Set(
            placements.map((placement) => placement.resourceId)
          ).size,
          ownerTargets: placements.length,
          evidenceSignals: placements.reduce(
            (total, placement) => total + placement.evidenceSignalCount,
            0
          ),
          attentionTargets: placements.filter((placement) =>
            ATTENTION_STATES.has(placement.state)
          ).length,
          ambiguousTargets: placements.filter(
            (placement) => placement.ambiguity === "multiple_targets"
          ).length
        }
      ];
    })
  ) as ResourceLinkedContextEvidenceIndex["summary"];

  return { records, coverage, summary };
}
