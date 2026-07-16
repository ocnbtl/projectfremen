import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import ProjectsWorkspace from "../../../components/projects/ProjectsWorkspace";
import { readDocsIndex } from "../../../lib/docs-sync";
import { readKpis } from "../../../lib/kpis-store";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import { createEmptyProjectsState, readProjectsState } from "../../../lib/modules/projects/store";
import {
  buildProjectsWorkspaceSnapshot,
  findProjectDirectoryItem,
  type ProjectsSourceAvailability
} from "../../../lib/modules/projects/view-model";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";
import { readReviews } from "../../../lib/reviews-store";

export type ProjectsRouteMode = "index" | "detail";

type SettledSource<Value> = {
  value: Value;
  error?: string;
};

async function settleSource<Value>(
  promise: Promise<Value>,
  fallback: Value,
  fallbackMessage: string
): Promise<SettledSource<Value>> {
  try {
    return { value: await promise };
  } catch (error) {
    return {
      value: fallback,
      error: error instanceof Error ? error.message : fallbackMessage
    };
  }
}

export default async function ProjectsRoutePage({
  mode,
  projectId
}: {
  mode: ProjectsRouteMode;
  projectId?: string;
}) {
  await requireAdminSession();

  const [native, personalRecords, personalOps, kpis, docs, reviews] = await Promise.all([
    settleSource(
      readProjectsState(),
      createEmptyProjectsState(),
      "Native Projects data could not be loaded."
    ),
    settleSource(readPersonalRecords(), [], "Legacy Personal Records could not be loaded."),
    settleSource(readPersonalOpsState(), undefined, "Personal Ops context could not be loaded."),
    settleSource(readKpis(), [], "Legacy KPI context could not be loaded."),
    settleSource(readDocsIndex(), undefined, "Legacy document context could not be loaded."),
    settleSource(readReviews(), [], "Legacy Review context could not be loaded.")
  ]);

  const sourceAvailability: ProjectsSourceAvailability = {
    ...(native.error ? { projects: native.error } : {}),
    ...(personalRecords.error ? { personalRecords: personalRecords.error } : {}),
    ...(personalOps.error ? { personalOps: personalOps.error } : {}),
    ...(kpis.error ? { kpis: kpis.error } : {}),
    ...(docs.error ? { docs: docs.error } : {}),
    ...(reviews.error ? { reviews: reviews.error } : {})
  };
  const snapshot = buildProjectsWorkspaceSnapshot({
    state: native.value,
    personalRecords: personalRecords.value,
    personalOpsState: personalOps.value,
    kpis: kpis.value,
    docsState: docs.value,
    reviews: reviews.value,
    sourceAvailability
  });
  const selected = projectId ? findProjectDirectoryItem(snapshot, projectId) : null;

  if (mode === "detail" && projectId && !selected) {
    notFound();
  }

  const loadErrors = Object.entries(sourceAvailability).map(
    ([source, message]) => `${source}: ${message}`
  );

  return (
    <div className="shell admin-chrome-main module-ref-shell projects-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Projects"
        sidebarSummary="Project objectives, milestones, blockers, roles, links, health, timeline, and completion gates."
      />
      <ProjectsWorkspace
        initialSnapshot={snapshot}
        initialMode={mode}
        initialProjectId={selected?.project.id}
        initialLoadError={loadErrors.length ? loadErrors.join(" ") : undefined}
      />
    </div>
  );
}
