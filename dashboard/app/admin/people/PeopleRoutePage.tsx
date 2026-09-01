import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import PeopleWorkspace from "../../../components/PeopleWorkspace";
import { readFinanceState } from "../../../lib/modules/finance/store";
import { readPersonalLifeState } from "../../../lib/modules/personal-life/store";
import { listPersonalOpsObjects } from "../../../lib/modules/personal-ops/store";
import {
  createEmptyProjectsState,
  readProjectsState
} from "../../../lib/modules/projects/store";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { readNativeObjectLinks } from "../../../lib/native-objects/link-store";
import { createNativeObjectRef } from "../../../lib/native-objects/routes";
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
  const [recordsResult, followUpsResult, projectsResult, objectLinksResult, personalLifeResult, financeResult] = await Promise.all([
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
        error: error instanceof Error ? error.message : "Personal Follow-ups could not be loaded."
      })),
    readProjectsState()
      .then((state) => ({ ok: true as const, state }))
      .catch((error: unknown) => ({
        ok: false as const,
        state: createEmptyProjectsState(),
        error: error instanceof Error ? error.message : "Projects involvement could not be loaded."
      })),
    readNativeObjectLinks()
      .then((items) => ({ ok: true as const, items }))
      .catch(() => ({ ok: false as const, items: [] })),
    readPersonalLifeState()
      .then((state) => ({ ok: true as const, state }))
      .catch(() => ({ ok: false as const, state: { lists: [] } })),
    readFinanceState()
      .then((state) => ({ ok: true as const, state }))
      .catch(() => ({ ok: false as const, state: { accounts: [] } }))
  ]);
  const records: PersonalRecord[] = recordsResult.ok ? recordsResult.records : [];
  const loadError = recordsResult.ok ? "" : recordsResult.error;
  const people = records.filter(
    (record): record is PersonalRecord => record.className === "person" || record.className === "org"
  );
  const interactions = records.filter(
    (record): record is PersonalRecord => record.className === "interaction" && Boolean(record.interaction)
  );
  const objectTargets = [
    ...people
      .filter((record) => !record.archivedAt)
      .map((record) => createNativeObjectRef({
        module: "people",
        objectType: record.className === "org" ? "organization" : "person",
        objectId: record.id,
        label: record.title,
        versionId: record.updatedAt
      })),
    ...records
      .filter((record) => !record.archivedAt && record.className === "note")
      .map((record) => createNativeObjectRef({
        module: "notes",
        objectType: "note",
        objectId: record.id,
        label: record.title,
        versionId: record.updatedAt
      })),
    ...records
      .filter((record) => !record.archivedAt && record.className === "resource")
      .map((record) => createNativeObjectRef({
        module: "resources",
        objectType: "resource",
        objectId: record.id,
        label: record.title,
        versionId: record.updatedAt
      })),
    ...projectsResult.state.projects
      .filter((project) => project.lifecycle !== "archived")
      .map((project) => createNativeObjectRef({
        module: "projects",
        objectType: "project",
        objectId: project.id,
        label: project.name,
        versionId: project.updatedAt
      })),
    ...personalLifeResult.state.lists.map((list) => createNativeObjectRef({
      module: "personal_ops",
      objectType: "list",
      objectId: list.id,
      label: list.title,
      versionId: list.updatedAt
    })),
    ...financeResult.state.accounts
      .filter((account) => !account.archivedAt)
      .map((account) => createNativeObjectRef({
        module: "finance",
        objectType: "account",
        objectId: account.id,
        label: account.name,
        versionId: account.updatedAt
      }))
  ].sort((left, right) => left.label.localeCompare(right.label));

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
        initialInteractions={interactions}
        totalRecords={records.length}
        initialSelectedId={personId}
        initialMode={mode}
        initialLoadError={loadError}
        initialFollowUps={followUpsResult.ok ? followUpsResult.followUps : []}
        initialFollowUpsError={followUpsResult.ok ? "" : followUpsResult.error}
        initialProjectsState={projectsResult.state}
        initialProjectsError={projectsResult.ok ? "" : projectsResult.error}
        initialObjectLinks={objectLinksResult.items}
        initialObjectTargets={objectTargets}
      />
    </div>
  );
}
