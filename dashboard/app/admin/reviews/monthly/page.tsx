import ReviewEntriesPanel from "../../../../components/ReviewEntriesPanel";

export default async function MonthlyReviewPage({
  searchParams
}: {
  searchParams: Promise<{ scheduledFor?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Monthly Review</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            First-Sunday cadence. Use this page to keep a running history of monthly check-ins.
          </p>
        </div>
      </header>

      <ReviewEntriesPanel kind="monthly" initialScheduledFor={params.scheduledFor} />
    </main>
  );
}
