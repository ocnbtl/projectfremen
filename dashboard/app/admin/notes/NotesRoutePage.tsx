import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import NotesWorkspace from "../../../components/NotesWorkspace";
import { buildLegacyContentGraph } from "../../../lib/modules/content-graph/legacy-adapter";
import { legacyPersonalRecordsToMediaAssets } from "../../../lib/modules/media/legacy-adapter";
import { legacyPersonalRecordsToNotes } from "../../../lib/modules/notes/legacy-adapter";
import { legacyPersonalRecordsToResources } from "../../../lib/modules/resources/legacy-adapter";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export type NotesRouteMode = "index" | "detail";

export default async function NotesRoutePage({
  mode,
  noteId
}: {
  mode: NotesRouteMode;
  noteId?: string;
}) {
  await requireAdminSession();
  let records: PersonalRecord[] = [];
  let loadError = "";

  try {
    records = await readPersonalRecords();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Notes could not be loaded.";
  }

  const notes = legacyPersonalRecordsToNotes(records);
  const resources = legacyPersonalRecordsToResources(records);
  const media = legacyPersonalRecordsToMediaAssets(records);
  const contentGraph = buildLegacyContentGraph({ notes, resources, media });
  if (!loadError && noteId && !notes.some((note) => note.id === noteId)) {
    notFound();
  }

  return (
    <div className="shell admin-chrome-main module-ref-shell notes-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Notes"
        sidebarSummary="Authored internal knowledge, explicit links, and note-local review state."
      />
      <NotesWorkspace
        initialNotes={notes}
        contentGraph={contentGraph}
        initialMode={mode}
        initialSelectedId={noteId}
        initialLoadError={loadError}
      />
    </div>
  );
}
