import type { PersonalRecord } from "../../personal-records-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import type {
  CadenceState,
  HealthState,
  NativeObjectRef,
  ReviewState
} from "../../native-objects/types";
import type { PersonalOpsObject, PersonalOpsState } from "../personal-ops/types";
import {
  LEGACY_PROJECT_DEFINITIONS,
  getLegacyProjectNativeRef
} from "./legacy-adapter";
import { projectUuid, stableProjectUuid } from "./identity";
import type {
  LegacyProjectDefinition,
  Project,
  ProjectBlocker,
  ProjectCadenceState,
  ProjectInteraction,
  ProjectLifecycleState,
  ProjectLink,
  ProjectMilestone,
  ProjectObjective,
  ProjectReviewState,
  ProjectsState,
  ProjectTimelineEvent
} from "./types";

export type ProjectsSourceAvailability = {
  projects?: string;
  personalRecords?: string;
  personalOps?: string;
  reviews?: string;
};

export type ProjectDisplayRecord = {
  id: string;
  uuid: string;
  nativeRef: NativeObjectRef;
  slug: string;
  name: string;
  description: string;
  sourceKind: "native" | "legacy_projection";
  editable: boolean;
  promotable: boolean;
  lifecycle: ProjectLifecycleState;
  health: HealthState;
  review: ProjectReviewState;
  cadence: ProjectCadenceState;
  objective?: string;
  objectives: ProjectObjective[];
  defaultCadence?: string;
  lifecycleBeforeArchive?: Project["lifecycleBeforeArchive"];
  starred: boolean;
  legacyKey?: string;
  legacyRoute?: string;
  legacyEntityName?: string;
  updatedAt?: string;
  lastActivityAt?: string;
};

export type ProjectLinkedContextSummary = {
  ref: NativeObjectRef;
  sourceKind: "native_project_link" | "legacy_project_tag" | "personal_ops_reference";
  relationship: string;
  summary?: string;
  role?: string;
  legacyStatus?: string;
  updatedAt?: string;
};

export type ProjectDirectoryItem = {
  project: ProjectDisplayRecord;
  milestones: ProjectMilestone[];
  blockers: ProjectBlocker[];
  links: ProjectLink[];
  interactions: ProjectInteraction[];
  timelineEvents: ProjectTimelineEvent[];
  linkedContext: ProjectLinkedContextSummary[];
  attentionReasons: string[];
};

export type ProjectsWorkspaceSnapshot = {
  schemaVersion: typeof import("./types").PROJECTS_SCHEMA_VERSION;
  defaultProjectId: string;
  projects: ProjectDirectoryItem[];
  nativeState: ProjectsState;
  sourceAvailability: ProjectsSourceAvailability;
};

type BuildProjectsWorkspaceSnapshotInput = {
  state: ProjectsState;
  personalRecords?: PersonalRecord[];
  personalOpsState?: PersonalOpsState;
  sourceAvailability?: ProjectsSourceAvailability;
};

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function excerpt(value: string, limit = 180) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
}

function displayFromNative(project: Project): ProjectDisplayRecord {
  return {
    id: project.id,
    uuid: projectUuid(project.uuid, project.id),
    nativeRef: createNativeObjectRef({
      module: "projects",
      objectType: "project",
      objectId: project.id,
      label: project.name
    }),
    slug: project.slug,
    name: project.name,
    description: project.description,
    sourceKind: "native",
    editable: true,
    promotable: false,
    lifecycle: project.lifecycle,
    health: project.health,
    review: project.review,
    cadence: project.cadence,
    objective: project.objective,
    objectives: project.objectives,
    defaultCadence: project.defaultCadence,
    lifecycleBeforeArchive: project.lifecycleBeforeArchive,
    starred: project.starred,
    legacyKey: project.legacySource?.key,
    legacyRoute: project.legacySource?.legacyRoute,
    legacyEntityName: project.legacySource?.entityName,
    updatedAt: project.updatedAt,
    lastActivityAt: project.lastActivityAt
  };
}

function displayFromLegacy(project: LegacyProjectDefinition): ProjectDisplayRecord {
  return {
    id: project.projectId,
    uuid: stableProjectUuid(project.projectId),
    nativeRef: getLegacyProjectNativeRef(project),
    slug: project.slug,
    name: project.name,
    description: project.description,
    sourceKind: "legacy_projection",
    editable: false,
    promotable: true,
    lifecycle: project.lifecycle,
    health: "unknown",
    review: "unknown",
    cadence: "unset",
    objectives: [],
    starred: false,
    legacyKey: project.key,
    legacyRoute: project.legacyRoute,
    legacyEntityName: project.entityName
  };
}

function legacyDefinitionForDisplay(project: ProjectDisplayRecord) {
  if (project.legacyKey) {
    return LEGACY_PROJECT_DEFINITIONS.find((item) => item.key === project.legacyKey);
  }
  return LEGACY_PROJECT_DEFINITIONS.find((item) => item.projectId === project.id);
}

function projectAliases(project: ProjectDisplayRecord, definition?: LegacyProjectDefinition) {
  return new Set(
    [
      project.id,
      project.slug,
      project.name,
      project.name.replace(/^Project\s+/i, ""),
      definition?.shortName,
      definition?.entityName
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalized)
  );
}

function recordRef(record: PersonalRecord): NativeObjectRef {
  if (record.className === "person" || record.className === "org") {
    return createNativeObjectRef({
      module: "people",
      objectType: record.className === "org" ? "organization" : "person",
      objectId: record.id,
      label: record.profile?.fullName || record.title
    });
  }
  if (record.className === "resource") {
    return createNativeObjectRef({
      module: "resources",
      objectType: "resource",
      objectId: record.id,
      label: record.title
    });
  }
  if (record.className === "file") {
    return createNativeObjectRef({
      module: "media",
      objectType: "media_asset",
      objectId: record.id,
      label: record.title
    });
  }
  return createNativeObjectRef({
    module: "notes",
    objectType: record.className === "decision" ? "decision_candidate" : "note",
    objectId: record.id,
    label: record.title
  });
}

function legacyRecordContext(
  project: ProjectDisplayRecord,
  definition: LegacyProjectDefinition | undefined,
  records: readonly PersonalRecord[]
): ProjectLinkedContextSummary[] {
  const aliases = projectAliases(project, definition);
  return records.flatMap((record) => {
    if (record.className === "project") return [];
    const matches = record.projects.some((label) => aliases.has(normalized(label)));
    if (!matches) return [];
    return [
      {
        ref: recordRef(record),
        sourceKind: "legacy_project_tag" as const,
        relationship: "Legacy project tag",
        summary: excerpt(record.body),
        legacyStatus: record.status,
        updatedAt: record.updatedAt
      }
    ];
  });
}

function personalOpsObjectRef(item: PersonalOpsObject) {
  return createNativeObjectRef({
    module: "personal_ops",
    objectType: item.objectType,
    objectId: item.id,
    label: item.title
  });
}

function refMatchesProject(ref: NativeObjectRef, project: ProjectDisplayRecord) {
  return ref.module === "projects" && ref.objectId === project.id;
}

function personalOpsContext(
  project: ProjectDisplayRecord,
  state: PersonalOpsState | undefined
): ProjectLinkedContextSummary[] {
  if (!state) return [];
  const objects: PersonalOpsObject[] = [
    ...state.goals,
    ...state.decisions,
    ...state.obligations,
    ...state.followUps
  ];
  return objects.flatMap((item) => {
    const relationship = item.sourceRefs.some((ref) => refMatchesProject(ref, project))
      ? "Source project"
      : item.linkedRefs.some((ref) => refMatchesProject(ref, project))
        ? "Linked project"
        : "";
    if (!relationship) return [];
    return [
      {
        ref: personalOpsObjectRef(item),
        sourceKind: "personal_ops_reference" as const,
        relationship,
        summary: excerpt(item.description),
        legacyStatus: item.lifecycle,
        updatedAt: item.updatedAt
      }
    ];
  });
}

function nativeLinkContext(links: readonly ProjectLink[]): ProjectLinkedContextSummary[] {
  return links
    .filter((link) => link.linkState !== "removed")
    .map((link) => ({
      ref: link.source,
      sourceKind: "native_project_link" as const,
      relationship: link.relationship,
      summary: link.projectSpecificNote,
      role: link.role,
      legacyStatus: link.linkState,
      updatedAt: link.updatedAt
    }));
}

function attentionReasons(input: {
  project: ProjectDisplayRecord;
  blockers: readonly ProjectBlocker[];
  milestones: readonly ProjectMilestone[];
}) {
  if (input.project.sourceKind === "legacy_projection") {
    return ["Start tracking to add project-owned milestones, blockers, links, and audit history."];
  }
  if (input.project.lifecycle === "archived") return [];
  const reasons: string[] = [];
  if (input.project.objectives.length === 0) reasons.push("Project objectives are not defined.");
  const openBlockers = input.blockers.filter((blocker) => blocker.state === "open");
  if (openBlockers.length) reasons.push(`${openBlockers.length} open project blocker${openBlockers.length === 1 ? "" : "s"}.`);
  const now = Date.now();
  const overdue = input.milestones.filter(
    (milestone) =>
      !["complete", "archived"].includes(milestone.state) &&
      Number.isFinite(Date.parse(milestone.dueAt)) &&
      Date.parse(milestone.dueAt) < now
  );
  if (overdue.length) reasons.push(`${overdue.length} overdue milestone${overdue.length === 1 ? "" : "s"}.`);
  return reasons;
}

export function buildProjectsWorkspaceSnapshot({
  state,
  personalRecords = [],
  personalOpsState,
  sourceAvailability = {}
}: BuildProjectsWorkspaceSnapshotInput): ProjectsWorkspaceSnapshot {
  const mappedLegacyKeys = new Set(state.legacyMappings.map((mapping) => mapping.legacyKey));
  const displayProjects: ProjectDisplayRecord[] = [
    ...state.projects.map(displayFromNative),
    ...LEGACY_PROJECT_DEFINITIONS.filter((project) => !mappedLegacyKeys.has(project.key)).map(
      displayFromLegacy
    )
  ];

  const projects = displayProjects.map((project): ProjectDirectoryItem => {
    const definition = legacyDefinitionForDisplay(project);
    const milestones = state.milestones
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
    const blockers = state.blockers
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const links = state.links
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const interactions = state.interactions
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const timelineEvents = state.timelineEvents
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return {
      project,
      milestones,
      blockers,
      links,
      interactions,
      timelineEvents,
      linkedContext: [
        ...nativeLinkContext(links),
        ...legacyRecordContext(project, definition, personalRecords),
        ...personalOpsContext(project, personalOpsState)
      ],
      attentionReasons: attentionReasons({ project, blockers, milestones })
    };
  });

  const defaultProjectId =
    projects.find((item) => item.project.id === "PRJ-ICE")?.project.id ||
    projects.find((item) => item.project.lifecycle !== "archived")?.project.id ||
    projects[0]?.project.id ||
    "";

  return {
    schemaVersion: state.schemaVersion,
    defaultProjectId,
    projects,
    nativeState: state,
    sourceAvailability
  };
}

export function findProjectDirectoryItem(
  snapshot: ProjectsWorkspaceSnapshot,
  identifier: string
): ProjectDirectoryItem | null {
  const normalizedIdentifier = normalized(identifier);
  return (
    snapshot.projects.find((item) =>
      [item.project.id, item.project.slug, item.project.legacyKey]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalized(value) === normalizedIdentifier)
    ) || null
  );
}

// Re-export commonly consumed state dimensions for the client workspace contract.
export type ProjectWorkspaceStateDimensions = {
  lifecycle: ProjectLifecycleState;
  health: HealthState;
  review: ReviewState | "unknown";
  cadence: CadenceState | "unset";
};
