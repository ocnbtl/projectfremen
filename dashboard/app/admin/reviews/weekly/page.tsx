import ReviewEntriesPanel from "../../../../components/ReviewEntriesPanel";

export default async function WeeklyReviewPage({
  searchParams
}: {
  searchParams: Promise<{ scheduledFor?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Weekly Review</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Sunday cadence. Use this page to keep a running history of weekly check-ins.
          </p>
        </div>
      </header>

      <ReviewEntriesPanel kind="weekly" initialScheduledFor={params.scheduledFor} />
    </main>
  );
}
