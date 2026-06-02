import Link from "next/link";
import AdminChrome from "../../../../components/AdminChrome";
import ReviewEntriesPanel from "../../../../components/ReviewEntriesPanel";
import { requireAdminSession } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

const broadReviews = [
  ["Weekly review", "Today", "Check goals, open notes, people follow-ups, and blocked work.", "green"],
  ["Monthly review", "Jun 30", "Look across finance, resources, media, projects, and habits.", "blue"],
  ["System cleanup", "Friday", "Archive stale notes, resolve missing owners, and clear review queues.", "orange"]
];

const reviewLanes: Array<{ title: string; items: string[]; tone: string }> = [
  { title: "Due now", items: ["Metadata gaps", "Contact cadence", "Subscription review"], tone: "crimson" },
  { title: "This week", items: ["Module checks", "Media alt text", "Source cleanup"], tone: "orange" },
  { title: "Monthly", items: ["Finance snapshot", "Resources saved", "People follow-up plan"], tone: "blue" }
];

export default async function WeeklyReviewPage({
  searchParams
}: {
  searchParams: Promise<{ scheduledFor?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;

  return (
    <main className="shell admin-chrome-main module-ref-shell reviews-module-shell">
      <AdminChrome
        sidebarTitle="Reviews"
        sidebarSummary="Weekly, monthly, and focused checks across the operating system."
        sidebarItems={[
          { label: "Weekly", value: "1" },
          { label: "Monthly", value: "1" },
          { label: "Waiting", value: "5" },
          { label: "Due soon", value: "8" }
        ]}
        sidebarActions={[
          { label: "This week", href: "/admin/reviews/weekly" },
          { label: "Monthly Review", href: "/admin/reviews/monthly" },
          { label: "Needs attention", href: "/admin/reviews/weekly" },
          { label: "Done recently", href: "/admin/reviews/weekly" },
          { label: "Current Goals", href: "/admin" }
        ]}
      />
      <header className="module-ref-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-green">Reviews</p>
          <h1>Review center</h1>
          <p>
            Broad weekly and monthly reviews come first, then specific cadence checks for notes,
            people, finance, resources, media, and system cleanup.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search reviews" placeholder="Search reviews, queues, checks" />
          <kbd>review</kbd>
        </label>
      </header>

      <section className="module-ref-content">
        <div className="module-ref-main">
          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Broad review strip</h2>
              <Link href="/admin" className="review-back-link">
                Current Goals
              </Link>
            </div>
            <div className="module-ref-card-strip">
              {broadReviews.map(([title, date, summary, tone]) => (
                <article className={`module-ref-mini-card module-ref-tone-${tone}`} key={title}>
                  <span className="module-ref-dot" />
                  <h3>{title}</h3>
                  <p>{date}</p>
                  <p>{summary}</p>
                </article>
              ))}
            </div>
          </article>

          <section className="module-ref-lanes">
            {reviewLanes.map(({ title, items, tone }) => (
              <article className={`module-ref-lane module-ref-tone-${tone}`} key={title}>
                <h3>{title}</h3>
                <div className="module-ref-lane-list">
                  {items.map((item) => (
                    <div className="module-ref-activity" key={item}>
                      <strong>{item}</strong>
                      <span>Cadence check</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <article className="module-ref-live-panel">
            <div className="module-ref-section-title">
              <h2>Weekly Review</h2>
              <span>Live history</span>
            </div>
            <p>Sunday cadence. Use this page to keep a running history of weekly check-ins.</p>
            <ReviewEntriesPanel kind="weekly" initialScheduledFor={params.scheduledFor} />
          </article>
        </div>

        <aside className="module-ref-detail">
          <div className="module-ref-detail-title">
            <span className="module-ref-eyebrow module-ref-tone-green">Selected review</span>
            <h2>Weekly review</h2>
          </div>
          <p>
            Check goals, open notes, people follow-ups, and blocked work, then capture the live
            entry below without changing the existing review storage flow.
          </p>
          <div className="module-ref-field-list">
            {[
              ["Green", "Done or healthy"],
              ["Blue", "Scheduled or monthly"],
              ["Orange", "Decision soon"],
              ["Crimson", "Blocked or missing info"],
              ["Cadence", "Weekly"],
              ["Default day", "Sunday"]
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
