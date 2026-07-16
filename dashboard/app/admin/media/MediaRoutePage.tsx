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
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import type { PersonalOpsState } from "../../../lib/modules/personal-ops/types";
import { readProjectsState } from "../../../lib/modules/projects/store";
import type { ProjectsState } from "../../../lib/modules/projects/types";
import { legacyPersonalRecordsToResources } from "../../../lib/modules/resources/legacy-adapter";
import { readReviewsState } from "../../../lib/modules/reviews/store";
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
  const ownerStatePromise = queueMode === "in-use"
    ? Promise.allSettled([readProjectsState(), readReviewsState(), readPersonalOpsState()] as const)
    : null;
  let records: PersonalRecord[] = [];
  let loadError = "";

  try {
    records = await readPersonalRecords();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Media records could not be loaded.";
  }

  const serverAssets = legacyPersonalRecordsToMediaAssets(records);
  const assets = serverAssets.map(mediaAssetForClient);
  const notes = legacyPersonalRecordsToNotes(records);
  const resources = legacyPersonalRecordsToResources(records);
  const contentGraph = buildLegacyContentGraph({ notes, resources, media: assets });
  if (!loadError && assetId && !assets.some((asset) => asset.id === assetId)) {
    notFound();
  }

  let inUseEvidence = null;
  if (queueMode === "in-use" && ownerStatePromise) {
    const [projectsResult, reviewsResult, personalOpsResult] = await ownerStatePromise;
    inUseEvidence = buildMediaUsageEvidence({
      assets,
      legacyContentGraph: contentGraph,
      projects: ownerEvidenceSource<ProjectsState>(projectsResult, "Projects"),
      reviews: ownerEvidenceSource<ReviewsState>(reviewsResult, "Reviews"),
      personalOps: ownerEvidenceSource<PersonalOpsState>(personalOpsResult, "Personal Ops")
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
          contentGraph={contentGraph}
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
