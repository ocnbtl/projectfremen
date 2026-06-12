import AdminChrome from "../../../components/AdminChrome";
import NotesWorkspace from "../../../components/NotesWorkspace";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

function hasReviewDue(record: PersonalRecord) {
  if (!record.time.nextReview) {
    return record.status === "idea" || record.status === "draft" || record.status === "blocked";
  }
  const reviewDate = new Date(record.time.nextReview);
  if (Number.isNaN(reviewDate.getTime())) {
    return false;
  }
  return reviewDate.getTime() <= Date.now() + 1000 * 60 * 60 * 24 * 7;
}

export default async function NotesPage() {
  await requireAdminSession();
  const records = await readPersonalRecords().catch(() => []);
  const notes = records.filter((record): record is PersonalRecord => record.domain === "notes-docs");
  const needsReview = notes.filter(hasReviewDue).length;
  const linkedGoals = notes.filter((record) => record.projects.length > 0 || record.relations.north.length > 0).length;
  const sources = notes.filter((record) => record.externalSources.length > 0 || Boolean(record.url)).length;

  return (
    <main className="shell admin-chrome-main module-ref-shell notes-module-shell">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="Notes"
        sidebarSummary="Dashboard-native objects grouped by properties, workflow, and review state."
        sidebarItems={[
          { label: "All notes", value: String(notes.length) },
          { label: "Needs review", value: String(needsReview) },
          { label: "Linked goals", value: String(linkedGoals) },
          { label: "Sources", value: String(sources) }
        ]}
        sidebarActions={[
          { label: "Missing owner", href: "/admin/notes" },
          { label: "Recent notes", href: "/admin/notes" },
          { label: "Media attached", href: "/admin/media" },
          { label: "Archived sources", href: "/admin/notes" },
          { label: "Create Note", href: "/admin/personal/notes-docs" },
          { label: "Personal Ops", href: "/admin/personal" }
        ]}
      />
      <NotesWorkspace initialNotes={notes} totalRecords={records.length} />
    </main>
  );
}
