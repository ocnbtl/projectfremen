import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import PeopleWorkspace from "../../../components/PeopleWorkspace";
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
  let records: PersonalRecord[] = [];
  let loadError = "";
  try {
    records = await readPersonalRecords();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "People records could not be loaded.";
  }
  const people = records.filter(
    (record): record is PersonalRecord => record.className === "person" || record.className === "org"
  );

  if (!loadError && personId && !people.some((record) => record.id === personId)) {
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
      />
    </div>
  );
}
