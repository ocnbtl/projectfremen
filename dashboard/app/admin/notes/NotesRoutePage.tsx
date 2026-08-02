import { notFound } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import NotesWorkspace from "../../../components/NotesWorkspace";
import { buildLegacyContentGraph } from "../../../lib/modules/content-graph/legacy-adapter";
import { legacyPersonalRecordsToMediaAssets } from "../../../lib/modules/media/legacy-adapter";
import { legacyPersonalRecordsToNotes } from "../../../lib/modules/notes/legacy-adapter";
import {
  buildNoteReferenceEvidence,
  type NoteReferenceEvidenceSource
} from "../../../lib/modules/notes/reference-evidence";
import { legacyPersonalRecordsToPeople } from "../../../lib/modules/people/legacy-adapter";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import {
  createEmptyProjectsState,
  readProjectsState
} from "../../../lib/modules/projects/store";
import type { ProjectsState } from "../../../lib/modules/projects/types";
import { legacyPersonalRecordsToResources } from "../../../lib/modules/resources/legacy-adapter";
import { readReviewsState, toReviewRunView } from "../../../lib/modules/reviews/store";
import type { ReviewsState } from "../../../lib/modules/reviews/types";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export type NotesRouteMode = "index" | "detail";

function ownerEvidenceSource<State>(
  result: PromiseSettledResult<State>,
  label: string
): NoteReferenceEvidenceSource<State> {
  if (result.status === "fulfilled") {
    return { available: true, error: null, state: result.value };
  }
  return {
    available: false,
    error: `${label} references could not be loaded.`,
    state: null
  };
}

export default async function NotesRoutePage({
  mode,
  noteId
}: {
  mode: NotesRouteMode;
  noteId?: string;
}) {
  await requireAdminSession();
  const [recordsResult, personalOpsResult, ownerStateResults] = await Promise.all([
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
      })),
    Promise.allSettled([readProjectsState(), readReviewsState()] as const)
  ]);
  const records: PersonalRecord[] = recordsResult.ok ? recordsResult.records : [];
  const loadError = recordsResult.ok ? "" : recordsResult.error;

  const notes = legacyPersonalRecordsToNotes(records);
  const resources = legacyPersonalRecordsToResources(records);
  const media = legacyPersonalRecordsToMediaAssets(records);
  const people = legacyPersonalRecordsToPeople(records);
  const contentGraph = buildLegacyContentGraph({ notes, resources, media, people });
  const [projectsResult, reviewsResult] = ownerStateResults;
  const referenceEvidence = buildNoteReferenceEvidence({
    notes,
    legacyContentGraph: contentGraph,
    projects: ownerEvidenceSource<ProjectsState>(projectsResult, "Projects"),
    reviews: ownerEvidenceSource<ReviewsState>(reviewsResult, "Reviews")
  });
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
        referenceEvidence={referenceEvidence}
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
        initialMediaAssets={media}
        initialResources={resources}
        initialMode={mode}
        initialSelectedId={noteId}
        initialLoadError={loadError}
        initialPersonalOpsDecisions={personalOpsResult.ok ? personalOpsResult.state.decisions : []}
        initialDecisionMappings={personalOpsResult.ok ? personalOpsResult.state.legacyMappings : []}
        initialDecisionLoadError={personalOpsResult.ok ? "" : personalOpsResult.error}
        initialPersonalOpsFollowUps={personalOpsResult.ok ? personalOpsResult.state.followUps : []}
        initialFollowUpsError={personalOpsResult.ok ? "" : personalOpsResult.error}
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
      />
    </div>
  );
}
