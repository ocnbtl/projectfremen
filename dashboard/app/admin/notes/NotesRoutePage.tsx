import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import NotesWorkspace from "../../../components/NotesWorkspace";
import { buildLegacyContentGraph } from "../../../lib/modules/content-graph/legacy-adapter";
import { legacyPersonalRecordsToMediaAssets } from "../../../lib/modules/media/legacy-adapter";
import { legacyPersonalRecordsToNotes } from "../../../lib/modules/notes/legacy-adapter";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
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
  const [recordsResult, personalOpsResult] = await Promise.all([
    readPersonalRecords()
      .then((records) => ({ ok: true as const, records }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Notes could not be loaded."
      })),
    readPersonalOpsState()
      .then((state) => ({ ok: true as const, state }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Personal Ops Decisions could not be loaded."
      }))
  ]);
  const records: PersonalRecord[] = recordsResult.ok ? recordsResult.records : [];
  const loadError = recordsResult.ok ? "" : recordsResult.error;

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
        initialPersonalOpsDecisions={personalOpsResult.ok ? personalOpsResult.state.decisions : []}
        initialDecisionMappings={personalOpsResult.ok ? personalOpsResult.state.legacyMappings : []}
        initialDecisionLoadError={personalOpsResult.ok ? "" : personalOpsResult.error}
      />
    </div>
  );
}
