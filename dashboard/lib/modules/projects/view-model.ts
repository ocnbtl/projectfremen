import type { DocsIndexState, KpiEntry, ReviewEntry } from "../../types";
import type { PersonalRecord } from "../../personal-records-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import type {
  CadenceState,
  HealthState,
  LifecycleState,
  NativeObjectRef,
  ReviewState
} from "../../native-objects/types";
import type { PersonalOpsObject, PersonalOpsState } from "../personal-ops/types";
import {
  LEGACY_PROJECT_DEFINITIONS,
  getLegacyProjectNativeRef
} from "./legacy-adapter";
import type {
  LegacyProjectDefinition,
  Project,
  ProjectBlocker,
  ProjectCadenceState,
  ProjectLink,
  ProjectMilestone,
  ProjectPriority,
  ProjectReviewState,
  ProjectsState,
  ProjectTimelineEvent
} from "./types";

export type ProjectsSourceAvailability = {
  projects?: string;
  personalRecords?: string;
  personalOps?: string;
  kpis?: string;
  docs?: string;
  reviews?: string;
};

export type ProjectDisplayRecord = {
  id: string;
  nativeRef: NativeObjectRef;
  slug: string;
  name: string;
  description: string;
  sourceKind: "native" | "legacy_projection";
  editable: boolean;
  promotable: boolean;
  lifecycle: LifecycleState;
  health: HealthState;
  review: ProjectReviewState;
  cadence: ProjectCadenceState;
  priority: ProjectPriority;
  owner?: string;
  area?: string;
  objective?: string;
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
  legacyStatus?: string;
  updatedAt?: string;
};

export type LegacyKpiSummary = {
  id: string;
  name: string;
  value: string;
  priority: string;
  updatedAt: string;
  link?: string;
  sourceLabel: "Legacy KPI source";
};

export type LegacyDocumentSummary = {
  id: string;
  title: string;
  repo: string;
  path: string;
  url: string;
  updatedAt: string;
  sourceLabel: "Legacy document index";
};

export type ProjectDirectoryItem = {
  project: ProjectDisplayRecord;
  milestones: ProjectMilestone[];
  blockers: ProjectBlocker[];
  links: ProjectLink[];
  timelineEvents: ProjectTimelineEvent[];
  linkedContext: ProjectLinkedContextSummary[];
  legacyKpis: LegacyKpiSummary[];
  legacyDocuments: LegacyDocumentSummary[];
  legacyDocumentTotal: number;
  docsLastSynced?: string;
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
  kpis?: KpiEntry[];
  docsState?: DocsIndexState;
  reviews?: ReviewEntry[];
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
    priority: project.priority,
    owner: project.owner,
    area: project.area,
    objective: project.objective,
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
    priority: "medium",
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
      legacyStatus: link.linkState,
      updatedAt: link.updatedAt
    }));
}

function legacyKpisFor(
  definition: LegacyProjectDefinition | undefined,
  kpis: readonly KpiEntry[]
): LegacyKpiSummary[] {
  if (!definition?.entityName) return [];
  return kpis
    .filter((kpi) => kpi.entity === definition.entityName)
    .map((kpi) => ({
      id: kpi.id,
      name: kpi.name,
      value: kpi.value,
      priority: kpi.priority,
      updatedAt: kpi.updatedAt,
      link: kpi.link,
      sourceLabel: "Legacy KPI source" as const
    }));
}

function legacyDocsFor(
  definition: LegacyProjectDefinition | undefined,
  docsState: DocsIndexState | undefined
) {
  if (!definition || !docsState) return { total: 0, items: [] as LegacyDocumentSummary[] };
  const repos = new Set(definition.repos);
  const documents = docsState.items.filter((item) => repos.has(item.repo));
  return {
    total: documents.length,
    items: documents.slice(0, 20).map((item) => ({
      id: item.id,
      title: item.title,
      repo: item.repo,
      path: item.path,
      url: item.url,
      updatedAt: item.updatedAt,
      sourceLabel: "Legacy document index" as const
    }))
  };
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
  if (!input.project.owner) reasons.push("Project owner is not assigned.");
  if (!input.project.objective) reasons.push("Project objective is not defined.");
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
  kpis = [],
  docsState,
  reviews: _reviews = [],
  sourceAvailability = {}
}: BuildProjectsWorkspaceSnapshotInput): ProjectsWorkspaceSnapshot {
  // Legacy Reviews are intentionally not inferred into ReviewRuns or project links.
  void _reviews;
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
    const timelineEvents = state.timelineEvents
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const docs = legacyDocsFor(definition, docsState);
    return {
      project,
      milestones,
      blockers,
      links,
      timelineEvents,
      linkedContext: [
        ...nativeLinkContext(links),
        ...legacyRecordContext(project, definition, personalRecords),
        ...personalOpsContext(project, personalOpsState)
      ],
      legacyKpis: legacyKpisFor(definition, kpis),
      legacyDocuments: docs.items,
      legacyDocumentTotal: docs.total,
      docsLastSynced: docsState?.lastSynced || undefined,
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
  lifecycle: LifecycleState;
  health: HealthState;
  review: ReviewState | "unknown";
  cadence: CadenceState | "unset";
};
