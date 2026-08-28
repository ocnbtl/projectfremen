import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import ResourcesWorkspace from "../../../components/ResourcesWorkspace";
import { buildLegacyContentGraph } from "../../../lib/modules/content-graph/legacy-adapter";
import { legacyPersonalRecordsToMediaAssets } from "../../../lib/modules/media/legacy-adapter";
import { legacyPersonalRecordsToNotes } from "../../../lib/modules/notes/legacy-adapter";
import { createEmptyNoteLinksState, readNoteLinksState } from "../../../lib/modules/notes/links-store";
import { legacyPersonalRecordsToPeople } from "../../../lib/modules/people/legacy-adapter";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import type { PersonalOpsState } from "../../../lib/modules/personal-ops/types";
import {
  createEmptyProjectsState,
  readProjectsState
} from "../../../lib/modules/projects/store";
import type { ProjectsState } from "../../../lib/modules/projects/types";
import {
  buildResourceLinkedContextEvidence,
  type ResourceLinkedContextEvidenceSource
} from "../../../lib/modules/resources/linked-context-evidence";
import {
  legacyPersonalRecordsToResources,
  resourceForClient
} from "../../../lib/modules/resources/legacy-adapter";
import { readReviewsState, toReviewRunView } from "../../../lib/modules/reviews/store";
import type { ReviewsState } from "../../../lib/modules/reviews/types";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { readNativeObjectLinks } from "../../../lib/native-objects/link-store";
import { createNativeObjectRef } from "../../../lib/native-objects/routes";
import { requireAdminSession } from "../../../lib/require-admin";

export type ResourcesRouteMode = "index" | "detail";

function ownerEvidenceSource<State>(
  result: PromiseSettledResult<State>,
  label: string
): ResourceLinkedContextEvidenceSource<State> {
  if (result.status === "fulfilled") {
    return { available: true, error: null, state: result.value };
  }
  return {
    available: false,
    error: `${label} references could not be loaded.`,
    state: null
  };
}

export default async function ResourcesRoutePage({
  mode,
  resourceId
}: {
  mode: ResourcesRouteMode;
  resourceId?: string;
}) {
  await requireAdminSession();
  const [recordsResult, ownerStateResults, objectLinksResult] = await Promise.all([
    readPersonalRecords()
      .then((records) => ({ ok: true as const, records }))
      .catch((error: unknown) => ({
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Resources could not be loaded."
      })),
    Promise.allSettled([
      readProjectsState(),
      readReviewsState(),
      readPersonalOpsState(),
      readNoteLinksState()
    ] as const),
    readNativeObjectLinks().then((items) => ({ ok: true as const, items })).catch(() => ({ ok: false as const, items: [] }))
  ]);
  const records: PersonalRecord[] = recordsResult.ok
    ? recordsResult.records
    : [];
  const loadError = recordsResult.ok ? "" : recordsResult.error;

  const resources = legacyPersonalRecordsToResources(records);
  const notes = legacyPersonalRecordsToNotes(records);
  const media = legacyPersonalRecordsToMediaAssets(records);
  const people = legacyPersonalRecordsToPeople(records);
  const contentGraph = buildLegacyContentGraph({
    notes,
    resources,
    media,
    people
  });
  const [projectsResult, reviewsResult, personalOpsResult, noteLinksResult] = ownerStateResults;
  const linkedContextEvidence = buildResourceLinkedContextEvidence({
    resources,
    legacyContent: recordsResult.ok
      ? { available: true, error: null, state: contentGraph }
      : {
          available: false,
          error: "Legacy Notes and People references could not be loaded.",
          state: null
        },
    projects: ownerEvidenceSource<ProjectsState>(projectsResult, "Projects"),
    reviews: ownerEvidenceSource<ReviewsState>(reviewsResult, "Reviews"),
    personalOps: ownerEvidenceSource<PersonalOpsState>(
      personalOpsResult,
      "Personal Ops"
    )
  });
  const clientResources = resources.map(resourceForClient);
  const objectTargets = [
    ...records
      .filter((record) => !record.archivedAt && ["person", "org", "note", "resource"].includes(record.className))
      .map((record) => createNativeObjectRef({
        module: record.className === "resource" ? "resources" : record.className === "note" ? "notes" : "people",
        objectType: record.className === "org" ? "organization" : record.className,
        objectId: record.id,
        label: record.title,
        versionId: record.updatedAt
      })),
    ...(projectsResult.status === "fulfilled" ? projectsResult.value.projects.filter((project) => project.lifecycle !== "archived").map((project) => createNativeObjectRef({
      module: "projects",
      objectType: "project",
      objectId: project.id,
      label: project.name,
      versionId: project.updatedAt
    })) : []),
    ...(reviewsResult.status === "fulfilled" ? reviewsResult.value.runs.filter((run) => run.lifecycle !== "archived").map((run) => createNativeObjectRef({
      module: "reviews",
      objectType: "review_run",
      objectId: run.id,
      label: run.title,
      versionId: run.updatedAt
    })) : [])
  ].sort((left, right) => left.label.localeCompare(right.label));
  if (!loadError && resourceId && !resources.some((resource) => resource.id === resourceId)) {
    notFound();
  }

  return (
    <div className="shell admin-chrome-main module-ref-shell resource-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Resources"
        sidebarSummary="Canonical external sources, citations, freshness, trust, and source lifecycle."
      />
      <ResourcesWorkspace
        initialResources={clientResources}
        contentGraph={contentGraph}
        linkedContextEvidence={linkedContextEvidence}
        initialProjectsState={
          projectsResult.status === "fulfilled"
            ? projectsResult.value
            : createEmptyProjectsState()
        }
        initialProjectsError={
          projectsResult.status === "fulfilled"
            ? ""
            : "Projects associations could not be loaded."
        }
        initialNoteLinksState={
          noteLinksResult.status === "fulfilled" ? noteLinksResult.value : createEmptyNoteLinksState()
        }
        initialNoteLinksError={
          noteLinksResult.status === "fulfilled" ? "" : "Notes-owned links could not be loaded."
        }
        initialPersonalOpsFollowUps={
          personalOpsResult.status === "fulfilled"
            ? personalOpsResult.value.followUps
            : []
        }
        initialPersonalOpsFollowUpsError={
          personalOpsResult.status === "fulfilled"
            ? ""
            : "Personal Ops Follow-up status could not be loaded."
        }
        initialReviewViews={
          reviewsResult.status === "fulfilled"
            ? reviewsResult.value.runs.map(toReviewRunView)
            : []
        }
        initialReviewsError={
          reviewsResult.status === "fulfilled"
            ? ""
            : "Reviews-owned context could not be loaded."
        }
        initialObjectLinks={objectLinksResult.items}
        initialObjectTargets={objectTargets}
        initialMode={mode}
        initialSelectedId={resourceId}
        initialLoadError={loadError}
      />
    </div>
  );
}
