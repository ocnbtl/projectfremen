import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import ResourcesWorkspace from "../../../components/ResourcesWorkspace";
import { buildLegacyContentGraph } from "../../../lib/modules/content-graph/legacy-adapter";
import { legacyPersonalRecordsToMediaAssets } from "../../../lib/modules/media/legacy-adapter";
import { legacyPersonalRecordsToNotes } from "../../../lib/modules/notes/legacy-adapter";
import {
  legacyPersonalRecordsToResources,
  resourceForClient
} from "../../../lib/modules/resources/legacy-adapter";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export type ResourcesRouteMode = "index" | "detail";

export default async function ResourcesRoutePage({
  mode,
  resourceId
}: {
  mode: ResourcesRouteMode;
  resourceId?: string;
}) {
  await requireAdminSession();
  let records: PersonalRecord[] = [];
  let loadError = "";

  try {
    records = await readPersonalRecords();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Resources could not be loaded.";
  }

  const resources = legacyPersonalRecordsToResources(records);
  const notes = legacyPersonalRecordsToNotes(records);
  const media = legacyPersonalRecordsToMediaAssets(records);
  const contentGraph = buildLegacyContentGraph({ notes, resources, media });
  const clientResources = resources.map(resourceForClient);
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
        initialMode={mode}
        initialSelectedId={resourceId}
        initialLoadError={loadError}
      />
    </div>
  );
}
