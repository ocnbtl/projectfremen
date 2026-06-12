import Link from "next/link";
import AdminChrome from "../../../../components/AdminChrome";
import ReviewEntriesPanel from "../../../../components/ReviewEntriesPanel";
import { requireAdminSession } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

const monthlyFocus = [
  ["Finance snapshot", "Cash flow, subscriptions, bills, and budgets.", "blue"],
  ["Resources saved", "References to read, summarize, link, or archive.", "orange"],
  ["People follow-up plan", "Dormant ties, active collaborators, and due cadence.", "pink"],
  ["System cleanup", "Stale notes, missing owners, source gaps, and review queues.", "green"]
];

export default async function MonthlyReviewPage({
  searchParams
}: {
  searchParams: Promise<{ scheduledFor?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;

  return (
    <main className="shell admin-chrome-main module-ref-shell reviews-module-shell">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="Monthly Review"
        sidebarSummary="Higher-level review history across finance, resources, media, people, and system state."
        sidebarItems={[
          { label: "Cadence", value: "Monthly" },
          { label: "Default day", value: "First Sunday" },
          { label: "Focus areas", value: "4" },
          { label: "Due soon", value: "8" }
        ]}
        sidebarActions={[
          { label: "Weekly Review", href: "/admin/reviews/weekly" },
          { label: "Finance", href: "/admin/finance" },
          { label: "Resources", href: "/admin/resources" },
          { label: "People", href: "/admin/people" },
          { label: "Current Goals", href: "/admin" }
        ]}
      />
      <header className="module-ref-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-blue">Reviews</p>
          <h1>Monthly review</h1>
          <p>
            First-Sunday cadence for looking across finance, resources, media, people, projects,
            habits, and the health of the operating system.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search monthly reviews" placeholder="Search monthly checks" />
          <kbd>month</kbd>
        </label>
      </header>

      <section className="module-ref-content">
        <div className="module-ref-main">
          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Monthly focus</h2>
              <Link href="/admin/reviews/weekly" className="review-back-link">
                Weekly Review
              </Link>
            </div>
            <div className="module-ref-card-strip">
              {monthlyFocus.map(([title, summary, tone]) => (
                <article className={`module-ref-mini-card module-ref-tone-${tone}`} key={title}>
                  <span className="module-ref-dot" />
                  <h3>{title}</h3>
                  <p>{summary}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="module-ref-live-panel">
            <div className="module-ref-section-title">
              <h2>Monthly Review</h2>
              <span>Live history</span>
            </div>
            <p>First-Sunday cadence. Use this page to keep a running history of monthly check-ins.</p>
            <ReviewEntriesPanel kind="monthly" initialScheduledFor={params.scheduledFor} />
          </article>
        </div>

        <aside className="module-ref-detail">
          <div className="module-ref-detail-title">
            <span className="module-ref-eyebrow module-ref-tone-blue">Selected review</span>
            <h2>Monthly operating snapshot</h2>
          </div>
          <p>
            The monthly view keeps broad review context visible while preserving the existing live
            monthly entry form and history.
          </p>
          <div className="module-ref-field-list">
            {[
              ["Cadence", "Monthly"],
              ["Default day", "First Sunday"],
              ["Finance", "Cash flow and subscriptions"],
              ["Resources", "Saved references"],
              ["People", "Contact cadence"],
              ["System", "Cleanup and gaps"]
            ].map(([label, value]) => (
              <div className="module-ref-field" key={label}>
                <strong>{label}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
