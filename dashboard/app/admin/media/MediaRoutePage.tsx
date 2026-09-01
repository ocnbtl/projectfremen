import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import MediaWorkspace from "../../../components/MediaWorkspace";
import MediaDuplicatesWorkspace from "../../../components/media/MediaDuplicatesWorkspace";
import MediaInUseWorkspace from "../../../components/media/MediaInUseWorkspace";
import { buildLegacyContentGraph } from "../../../lib/modules/content-graph/legacy-adapter";
import {
  legacyPersonalRecordsToMediaAssets,
  mediaAssetForClient
} from "../../../lib/modules/media/legacy-adapter";
import {
  buildMediaUsageEvidence,
  type MediaUsageEvidenceSource
} from "../../../lib/modules/media/usage-evidence";
import { legacyPersonalRecordsToNotes } from "../../../lib/modules/notes/legacy-adapter";
import { createEmptyNoteLinksState, readNoteLinksState } from "../../../lib/modules/notes/links-store";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import type { PersonalOpsState } from "../../../lib/modules/personal-ops/types";
import {
  createEmptyProjectsState,
  readProjectsState
} from "../../../lib/modules/projects/store";
import type { ProjectsState } from "../../../lib/modules/projects/types";
import {
  legacyPersonalRecordsToResources,
  resourceForClient
} from "../../../lib/modules/resources/legacy-adapter";
import { readReviewsState, toReviewRunView } from "../../../lib/modules/reviews/store";
import type { ReviewsState } from "../../../lib/modules/reviews/types";
import type { MediaTab, MediaView } from "../../../lib/native-objects/url-state";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export type MediaRouteMode = "index" | "detail";
export type MediaQueueMode = "needs-review" | "missing-metadata" | "rights-usage" | "duplicates" | "in-use";

function ownerEvidenceSource<State>(
  result: PromiseSettledResult<State>,
  label: string
): MediaUsageEvidenceSource<State> {
  if (result.status === "fulfilled") {
    return { available: true, error: null, state: result.value };
  }
  return {
    available: false,
    error: `${label} references could not be loaded.`,
    state: null
  };
}

export default async function MediaRoutePage({
  mode,
  assetId,
  initialView,
  initialTab,
  queueMode
}: {
  mode: MediaRouteMode;
  assetId?: string;
  initialView?: MediaView;
  initialTab?: MediaTab;
  queueMode?: MediaQueueMode;
}) {
  await requireAdminSession();
  const [recordsResult, ownerStateResults] = await Promise.all([
    readPersonalRecords()
      .then((records) => ({ ok: true as const, records }))
      .catch((error: unknown) => ({
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Media records could not be loaded."
      })),
    Promise.allSettled([
      readProjectsState(),
      readReviewsState(),
      readPersonalOpsState(),
      readNoteLinksState()
    ] as const)
  ]);
  const records: PersonalRecord[] = recordsResult.ok
    ? recordsResult.records
    : [];
  const loadError = recordsResult.ok ? "" : recordsResult.error;

  const serverAssets = legacyPersonalRecordsToMediaAssets(records);
  const assets = serverAssets.map(mediaAssetForClient);
  const notes = legacyPersonalRecordsToNotes(records);
  const resources = legacyPersonalRecordsToResources(records);
  const clientResources = resources.map(resourceForClient);
  const contentGraph = buildLegacyContentGraph({ notes, resources, media: assets });
  const [projectsResult, reviewsResult, personalOpsResult, noteLinksResult] = ownerStateResults;
  if (!loadError && assetId && !assets.some((asset) => asset.id === assetId)) {
    notFound();
  }

  let inUseEvidence = null;
  if (queueMode === "in-use") {
    inUseEvidence = buildMediaUsageEvidence({
      assets,
      legacyContentGraph: contentGraph,
      projects: ownerEvidenceSource<ProjectsState>(projectsResult, "Projects"),
      reviews: ownerEvidenceSource<ReviewsState>(reviewsResult, "Reviews"),
      personalOps: ownerEvidenceSource<PersonalOpsState>(personalOpsResult, "Personal")
    });
  }

  return (
    <div className="shell admin-chrome-main module-ref-shell media-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Media"
        sidebarSummary="Binary assets, provenance, rights, versions, usage, and replacement."
      />
      {queueMode === "in-use" && inUseEvidence ? (
        <MediaInUseWorkspace
          evidence={inUseEvidence}
          initialLoadError={loadError}
        />
      ) : queueMode === "duplicates" ? (
        <MediaDuplicatesWorkspace
          initialAssets={assets}
          initialLoadError={loadError}
        />
      ) : (
        <MediaWorkspace
          initialAssets={assets}
          initialResources={clientResources}
          contentGraph={contentGraph}
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
              : "Personal Follow-up status could not be loaded."
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
          initialMode={mode}
          initialSelectedId={assetId}
          initialLoadError={loadError}
          initialView={initialView}
          initialTab={initialTab}
          queueMode={queueMode === "needs-review" || queueMode === "missing-metadata" || queueMode === "rights-usage"
            ? queueMode
            : undefined}
        />
      )}
    </div>
  );
}
