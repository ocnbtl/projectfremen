import { createNativeObjectRef } from "../../native-objects/routes";
import type { ModuleId, NativeObjectRef } from "../../native-objects/types";
import {
  contentTargetGroupsForObject,
  unresolvedReferencesForObject,
  type LegacyContentGraph
} from "../content-graph/types";
import type { ProjectsState } from "../projects/types";
import type { ReviewsState } from "../reviews/types";
import type { NoteRecord } from "./types";

export type NoteReferenceEvidenceSource<State> =
  | { available: true; error: null; state: State }
  | { available: false; error: string | null; state: null };

export type NoteReferenceIndexedOwnerModule =
  | "people"
  | "projects"
  | "resources"
  | "reviews";

export type NoteReferenceKnownOwnerModule =
  | NoteReferenceIndexedOwnerModule
  | "finance";

export type NoteReferenceEvidenceState =
  | "current"
  | "pending"
  | "stale"
  | "broken"
  | "missing";

export type NoteReferenceEvidenceSourceKind =
  | "legacy_content_candidate"
  | "project_link"
  | "project_milestone"
  | "project_blocker"
  | "review_context"
  | "review_evidence"
  | "review_decision"
  | "review_follow_up"
  | "review_carry_forward";

export type NoteReferenceEvidencePlacement = {
  id: string;
  noteId: string;
  ownerModule: ModuleId;
  ownerRef: NativeObjectRef;
  sourceKind: NoteReferenceEvidenceSourceKind;
  relationship: string;
  state: NoteReferenceEvidenceState;
  updatedAt?: string;
  readOnly: true;
  caveat: string;
};

export type NoteReferenceCoverageEntry = {
  ownerModule: NoteReferenceKnownOwnerModule;
  state: "indexed" | "read_failed" | "disconnected";
  available: boolean;
  error: string | null;
};

export type NoteReferenceEvidenceRecord = {
  noteId: string;
  placements: NoteReferenceEvidencePlacement[];
  ownerModules: ModuleId[];
  unresolvedReferenceCount: number;
  hasConnectedEvidence: boolean;
};

export type NoteReferenceEvidenceIndex = {
  records: NoteReferenceEvidenceRecord[];
  coverage: NoteReferenceCoverageEntry[];
  indexedAt: string;
};

export type BuildNoteReferenceEvidenceInput = {
  notes: readonly NoteRecord[];
  legacyContentGraph: LegacyContentGraph;
  projects: NoteReferenceEvidenceSource<ProjectsState>;
  reviews: NoteReferenceEvidenceSource<ReviewsState>;
};

type PlacementInput = Omit<NoteReferenceEvidencePlacement, "id" | "readOnly">;

const OWNER_MODULE_ORDER: readonly ModuleId[] = [
  "people",
  "projects",
  "resources",
  "reviews",
  "finance",
  "media",
  "personal_ops",
  "notes"
];

function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function noteIdForReference(
  reference: NativeObjectRef | undefined,
  notesById: ReadonlyMap<string, NoteRecord>
): string | null {
  if (!reference || reference.module !== "notes") return null;
  return notesById.has(reference.objectId) ? reference.objectId : null;
}

function projectRef(
  state: ProjectsState,
  projectId: string
): NativeObjectRef {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return createNativeObjectRef({
    module: "projects",
    objectType: "project",
    objectId: projectId,
    label: project?.name || `Missing Project ${projectId}`
  });
}

function projectChildRef(input: {
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

function reviewRef(id: string, title: string): NativeObjectRef {
  return createNativeObjectRef({
    module: "reviews",
    objectType: "review_run",
    objectId: id,
    label: title
  });
}

function projectLinkState(
  value: ProjectsState["links"][number]["linkState"]
): NoteReferenceEvidenceState | null {
  if (value === "active") return "current";
  if (value === "pending") return "pending";
  if (value === "stale") return "stale";
  if (value === "broken") return "broken";
  if (value === "missing") return "missing";
  return null;
}

function reviewContextState(
  value: ReviewsState["runs"][number]["contextLinks"][number]["state"]
): NoteReferenceEvidenceState | null {
  if (value === "linked") return "current";
  if (value === "stale") return "stale";
  if (value === "broken") return "broken";
  return null;
}

function reviewEvidenceState(
  value: ReviewsState["runs"][number]["evidence"][number]["state"]
): NoteReferenceEvidenceState | null {
  if (value === "linked") return "current";
  if (value === "stale") return "stale";
  if (value === "missing") return "missing";
  if (value === "duplicate" || value === "carried_forward") return "pending";
  return null;
}

function addPlacement(
  placementsByNoteId: Map<string, NoteReferenceEvidencePlacement[]>,
  seen: Set<string>,
  input: PlacementInput
) {
  const identity = [
    input.noteId,
    input.ownerModule,
    input.ownerRef.objectType,
    input.ownerRef.objectId,
    input.ownerRef.containerObjectId || "",
    input.sourceKind,
    input.relationship
  ].join("|");
  if (seen.has(identity)) return;
  seen.add(identity);
  const placement: NoteReferenceEvidencePlacement = {
    ...input,
    id: stableId("note-reference", identity),
    readOnly: true
  };
  placementsByNoteId.set(input.noteId, [
    ...(placementsByNoteId.get(input.noteId) || []),
    placement
  ]);
}

function coverageEntry<State>(
  ownerModule: Extract<NoteReferenceIndexedOwnerModule, "projects" | "reviews">,
  source: NoteReferenceEvidenceSource<State>
): NoteReferenceCoverageEntry {
  return {
    ownerModule,
    state: source.available ? "indexed" : "read_failed",
    available: source.available,
    error: source.error
  };
}

export function buildNoteReferenceEvidence({
  notes,
  legacyContentGraph,
  projects,
  reviews
}: BuildNoteReferenceEvidenceInput): NoteReferenceEvidenceIndex {
  const notesById = new Map(notes.map((note) => [note.id, note] as const));
  const placementsByNoteId = new Map<string, NoteReferenceEvidencePlacement[]>();
  const seen = new Set<string>();

  for (const note of notes) {
    for (const group of contentTargetGroupsForObject(legacyContentGraph, note.nativeRef)) {
      const relationships = Array.from(
        new Set(group.candidates.map((candidate) => candidate.relationship))
      ).sort();
      addPlacement(placementsByNoteId, seen, {
        noteId: note.id,
        ownerModule: group.target.module,
        ownerRef: group.target,
        sourceKind: "legacy_content_candidate",
        relationship: relationships.join(","),
        state: "pending",
        caveat: "Exact retained evidence resolves this owner route, but no persisted NoteLink is claimed."
      });
    }
  }

  if (projects.available) {
    for (const link of projects.state.links) {
      const noteId = noteIdForReference(link.source, notesById);
      const state = projectLinkState(link.linkState);
      if (!noteId || !state) continue;
      addPlacement(placementsByNoteId, seen, {
        noteId,
        ownerModule: "projects",
        ownerRef: projectRef(projects.state, link.projectId),
        sourceKind: "project_link",
        relationship: link.relationship,
        state,
        updatedAt: link.updatedAt,
        caveat: "Projects owns this ProjectLink. Notes indexes the current owner reference read-only."
      });
    }

    for (const milestone of projects.state.milestones) {
      if (milestone.state === "archived") continue;
      for (const reference of milestone.linkedRefs) {
        const noteId = noteIdForReference(reference, notesById);
        if (!noteId) continue;
        addPlacement(placementsByNoteId, seen, {
          noteId,
          ownerModule: "projects",
          ownerRef: projectChildRef({
            objectType: "milestone",
            objectId: milestone.id,
            projectId: milestone.projectId,
            label: milestone.title
          }),
          sourceKind: "project_milestone",
          relationship: "linked_reference",
          state: "current",
          updatedAt: milestone.updatedAt,
          caveat: "Projects owns the milestone and its reference. Notes does not copy or edit it."
        });
      }
    }

    for (const blocker of projects.state.blockers) {
      if (blocker.state === "archived") continue;
      for (const reference of blocker.sourceRefs) {
        const noteId = noteIdForReference(reference, notesById);
        if (!noteId) continue;
        addPlacement(placementsByNoteId, seen, {
          noteId,
          ownerModule: "projects",
          ownerRef: projectChildRef({
            objectType: "blocker",
            objectId: blocker.id,
            projectId: blocker.projectId,
            label: blocker.title
          }),
          sourceKind: "project_blocker",
          relationship: "source_reference",
          state: "current",
          updatedAt: blocker.updatedAt,
          caveat: "Projects owns the blocker and its source reference. Notes retains authored ownership."
        });
      }
    }
  }

  if (reviews.available) {
    for (const run of reviews.state.runs) {
      const ownerRef = reviewRef(run.id, run.title);

      for (const context of run.contextLinks) {
        const noteId = noteIdForReference(context.sourceRef, notesById);
        const state = reviewContextState(context.state);
        if (!noteId || !state) continue;
        addPlacement(placementsByNoteId, seen, {
          noteId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_context",
          relationship: context.relationship,
          state,
          updatedAt: context.linkedAt,
          caveat: "Reviews owns this context link and its state. Notes indexes it without changing the ReviewRun."
        });
      }

      for (const evidence of run.evidence) {
        const noteId = noteIdForReference(evidence.sourceRef, notesById);
        const state = reviewEvidenceState(evidence.state);
        if (!noteId || !state) continue;
        addPlacement(placementsByNoteId, seen, {
          noteId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_evidence",
          relationship: evidence.relationship,
          state,
          updatedAt: evidence.updatedAt,
          caveat: "Reviews owns evidence-use state. This index does not mark the source Note reviewed."
        });
      }

      for (const decision of run.decisions) {
        const noteId = noteIdForReference(decision.sourceRef, notesById);
        if (!noteId) continue;
        addPlacement(placementsByNoteId, seen, {
          noteId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_decision",
          relationship: "decision_source",
          state: "current",
          updatedAt: decision.updatedAt,
          caveat: "Reviews owns candidate resolution; Personal Ops owns any filed durable Decision."
        });
      }

      for (const followUp of run.followUps) {
        const noteId = noteIdForReference(followUp.sourceRef, notesById);
        if (!noteId) continue;
        addPlacement(placementsByNoteId, seen, {
          noteId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_follow_up",
          relationship: "follow_up_source",
          state: "current",
          updatedAt: followUp.updatedAt,
          caveat: "Reviews owns workflow state; Personal Ops owns any created actionable Follow-up."
        });
      }

      for (const carryForward of run.carryForward) {
        const noteId = noteIdForReference(carryForward.sourceRef, notesById);
        if (!noteId) continue;
        addPlacement(placementsByNoteId, seen, {
          noteId,
          ownerModule: "reviews",
          ownerRef,
          sourceKind: "review_carry_forward",
          relationship: "carry_forward_source",
          state: carryForward.state === "resolved" ? "current" : "pending",
          updatedAt: carryForward.updatedAt,
          caveat: "Reviews owns carry-forward state. The source Note remains unchanged."
        });
      }
    }
  }

  const records = notes.map((note) => {
    const placements = (placementsByNoteId.get(note.id) || []).sort((left, right) => {
      const moduleDifference =
        OWNER_MODULE_ORDER.indexOf(left.ownerModule) - OWNER_MODULE_ORDER.indexOf(right.ownerModule);
      if (moduleDifference !== 0) return moduleDifference;
      return left.ownerRef.label.localeCompare(right.ownerRef.label, undefined, {
        sensitivity: "base"
      });
    });
    const ownerModules = OWNER_MODULE_ORDER.filter((module) =>
      placements.some((placement) => placement.ownerModule === module)
    );
    const unresolvedReferenceCount = unresolvedReferencesForObject(
      legacyContentGraph,
      note.nativeRef
    ).length;
    return {
      noteId: note.id,
      placements,
      ownerModules,
      unresolvedReferenceCount,
      hasConnectedEvidence: placements.length > 0
    };
  });

  return {
    records,
    coverage: [
      { ownerModule: "people", state: "indexed", available: true, error: null },
      coverageEntry("projects", projects),
      { ownerModule: "resources", state: "indexed", available: true, error: null },
      coverageEntry("reviews", reviews),
      {
        ownerModule: "finance",
        state: "disconnected",
        available: false,
        error: "Finance fixtures do not expose stable native Note references."
      }
    ],
    indexedAt: new Date().toISOString()
  };
}

export function noteReferenceEvidenceRecord(
  index: NoteReferenceEvidenceIndex,
  noteId: string
): NoteReferenceEvidenceRecord | null {
  return index.records.find((record) => record.noteId === noteId) || null;
}
