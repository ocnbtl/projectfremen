import ReviewEntryEditor from "../../../../../components/ReviewEntryEditor";

export default async function MonthlyReviewEntryPage({
  params
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  return (
    <main className="shell">
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
