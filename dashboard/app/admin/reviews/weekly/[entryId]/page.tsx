import AdminChrome from "../../../../../components/AdminChrome";
import ReviewEntryEditor from "../../../../../components/ReviewEntryEditor";
import { requireAdminSession } from "../../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function WeeklyReviewEntryPage({
  params
}: {
  params: Promise<{ entryId: string }>;
}) {
  await requireAdminSession();
  const { entryId } = await params;

  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Weekly Form"
        sidebarSummary="Autosaved weekly review entry."
        sidebarItems={[
          { label: "Cadence", value: "Weekly" },
          { label: "Entry", value: entryId }
        ]}
        sidebarActions={[
          { label: "Weekly List", href: "/admin/reviews/weekly" },
          { label: "Home", href: "/admin" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Weekly Review Form</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Fill this out directly in the app. Changes auto-save while you edit.
          </p>
        </div>
      </header>

      <ReviewEntryEditor kind="weekly" entryId={entryId} />
    </main>
  );
}
