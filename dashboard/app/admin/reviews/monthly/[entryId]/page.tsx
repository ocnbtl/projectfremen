import AdminChrome from "../../../../../components/AdminChrome";
import ReviewEntryEditor from "../../../../../components/ReviewEntryEditor";
import { requireAdminSession } from "../../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function MonthlyReviewEntryPage({
  params
}: {
  params: Promise<{ entryId: string }>;
}) {
  await requireAdminSession();
  const { entryId } = await params;

  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Monthly Form"
        sidebarSummary="Autosaved monthly review entry."
        sidebarItems={[
          { label: "Cadence", value: "Monthly" },
          { label: "Entry", value: entryId }
        ]}
        sidebarActions={[
          { label: "Monthly List", href: "/admin/reviews/monthly" },
          { label: "Home", href: "/admin" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Monthly Review Form</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Fill this out directly in the app. Changes auto-save while you edit.
          </p>
        </div>
      </header>

      <ReviewEntryEditor kind="monthly" entryId={entryId} />
    </main>
  );
}
