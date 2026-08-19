import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import PeopleWorkspace from "../../../components/PeopleWorkspace";
import { listPersonalOpsObjects } from "../../../lib/modules/personal-ops/store";
import {
  createEmptyProjectsState,
  readProjectsState
} from "../../../lib/modules/projects/store";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export type PeopleRouteMode = "directory" | "profile" | "new" | "edit";

export default async function PeopleRoutePage({
  mode,
  personId
}: {
  mode: PeopleRouteMode;
  personId?: string;
}) {
  await requireAdminSession();
  const [recordsResult, followUpsResult, projectsResult] = await Promise.all([
    readPersonalRecords()
      .then((records) => ({ ok: true as const, records }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "People records could not be loaded."
      })),
    listPersonalOpsObjects("followUps")
      .then((followUps) => ({ ok: true as const, followUps }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Personal Ops Follow-ups could not be loaded."
      })),
    readProjectsState()
      .then((state) => ({ ok: true as const, state }))
      .catch((error: unknown) => ({
        ok: false as const,
        state: createEmptyProjectsState(),
        error: error instanceof Error ? error.message : "Projects involvement could not be loaded."
      }))
  ]);
  const records: PersonalRecord[] = recordsResult.ok ? recordsResult.records : [];
  const loadError = recordsResult.ok ? "" : recordsResult.error;
  const people = records.filter(
    (record): record is PersonalRecord => record.className === "person" || record.className === "org"
  );

  if (!loadError && personId && !people.some((record) => record.id === personId && !record.archivedAt)) {
    notFound();
  }

  return (
    <div className="shell admin-chrome-main module-ref-shell people-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="People"
        sidebarSummary="Identity, relationship context, cadence, and meaningful interactions."
      />
      <PeopleWorkspace
        initialPeople={people}
        totalRecords={records.length}
        initialSelectedId={personId}
        initialMode={mode}
        initialLoadError={loadError}
        initialFollowUps={followUpsResult.ok ? followUpsResult.followUps : []}
        initialFollowUpsError={followUpsResult.ok ? "" : followUpsResult.error}
        initialProjectsState={projectsResult.state}
        initialProjectsError={projectsResult.ok ? "" : projectsResult.error}
      />
    </div>
  );
}
