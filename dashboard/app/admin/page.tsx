import Link from "next/link";
import AdminChrome from "../../components/AdminChrome";
import CurrentGoalsPanel, { type HomeGoalItem } from "../../components/CurrentGoalsPanel";
import { readEntityGoals } from "../../lib/entity-goals-store";
import { ENTITY_HUBS } from "../../lib/entity-hub";
import { readPersonalRecords } from "../../lib/personal-records-store";
import { requireAdminSession } from "../../lib/require-admin";
import {
  daysUntil,
  formatMonthDay,
  getNextFirstSunday,
  getNextFriday,
  getNextSunday
} from "../../lib/review-schedule";

export const dynamic = "force-dynamic";

const ENTITIES = [
  {
    name: "Project Fremen",
    theme: "fremen",
    slug: "unigentamos"
  },
  {
    name: "Project Iceflake",
    theme: "iceflake",
    slug: "pngwn"
  },
  {
    name: "Project Pint",
    theme: "pint",
    slug: "diyesu-decor"
  }
];

const ENTITY_THEME_BY_SLUG: Record<string, "fremen" | "iceflake" | "pint"> = {
  unigentamos: "fremen",
  pngwn: "iceflake",
  "diyesu-decor": "pint"
};

const COMMAND_METRICS = [
  { label: "Active goals", value: "12", tone: "green", detail: "Across live project lanes" },
  { label: "Reviews today", value: "5", tone: "crimson", detail: "Weekly and module cadence" },
  { label: "Sync checks", value: "8", tone: "blue", detail: "Docs, KPIs, notes, deploys" },
  { label: "AI suggestions", value: "14", tone: "violet", detail: "Local-only review prompts" },
  { label: "Media queued", value: "6", tone: "cyan", detail: "Files waiting for context" }
];

const WORK_LANES = [
  {
    title: "Note work",
    tone: "green",
    items: [
      ["Personal Ops notes", "Properties visible during capture"],
      ["Resources split", "External references stay out of authored notes"],
      ["People cadence", "Relationship context and follow-up notes"]
    ]
  },
  {
    title: "Execution",
    tone: "blue",
    items: [
      ["Figma transfer", "Admin chrome and page systems"],
      ["Deployment review", "Main site smoke checks after each slice"],
      ["Current Goals", "Autosave, sync, and completion stay guarded"]
    ]
  },
  {
    title: "Review",
    tone: "crimson",
    items: [
      ["Weekly review", "Capture broad operating state"],
      ["Finance prep", "Manual summaries and subscription checks"],
      ["Module health", "Find stale surfaces before expansion"]
    ]
  }
];

const FOCUS_STACK = [
  ["Command Center", "Make the first viewport useful for daily operating state", "Active"],
  ["Personal Ops", "Transfer Notes layout, property groups, and right rail", "Active"],
  ["Resources", "Separate saved references from authored notes and files", "Queued"]
];

const MODULE_HEALTH = [
  ["Notes", "Live", "green"],
  ["People", "Designing", "blue"],
  ["Media", "Queued", "cyan"],
  ["Resources", "New slice", "violet"],
  ["Finance", "Guarded", "orange"],
  ["Reviews", "Cadence live", "crimson"]
];

function getReviewRows(now: Date): Array<{ name: string; when: string }> {
  const weekly = getNextSunday(now);
  const monthly = getNextFirstSunday(now);
  const kpiRefresh = getNextFriday(now);
  const dayLabel = (days: number) => `${days} day${days === 1 ? "" : "s"}`;
  const formatReviewWhen = (date: Date, dayName: string) =>
    `${formatMonthDay(date)} (${dayName} in ${dayLabel(daysUntil(date, now))})`;

  return [
    {
      name: "Weekly Review",
      when: formatReviewWhen(weekly, "Sunday")
    },
    {
      name: "Monthly Review",
      when: formatReviewWhen(monthly, "Sunday")
    },
    {
      name: "KPI Refresh",
      when: formatReviewWhen(kpiRefresh, "Friday")
    }
  ];
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const playIntro = params.welcome === "1";
  const reviewRows = getReviewRows(new Date());
  const personalNotes = await readPersonalRecords().catch(() => []);
  const goalItems: HomeGoalItem[] = await Promise.all(
    ENTITY_HUBS.map(async (hub) => ({
      slug: hub.slug,
      entity: hub.entity,
      theme: ENTITY_THEME_BY_SLUG[hub.slug] || "fremen",
      goals: await readEntityGoals(hub.slug, hub.defaultGoals)
    }))
  );

  return (
    <main className="admin-shell admin-home-shell admin-chrome-main">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="Command Center"
        sidebarSummary="Home base for projects, reviews, KPIs, and personal systems."
        sidebarItems={[
          { label: "Projects", value: String(ENTITIES.length) },
          { label: "Goal lanes", value: String(goalItems.length) },
          { label: "Reviews", value: String(reviewRows.length) }
        ]}
        sidebarActions={[
          { label: "Notes", href: "/admin/notes" },
          { label: "Personal Ops", href: "/admin/personal" },
          { label: "Reviews", href: "/admin/reviews/weekly" },
          { label: "Modules", href: "/admin/docs" }
        ]}
        sidebarChildren={
          <>
            <CurrentGoalsPanel initialItems={goalItems} />
            <section className="admin-plain-section">
              <div className="admin-section-heading">
                <h2>Upcoming Reviews</h2>
                <div className="admin-review-links">
                  <Link href="/admin/reviews/weekly" className="admin-review-link">
                    Weekly
                  </Link>
                  <Link href="/admin/reviews/monthly" className="admin-review-link">
                    Monthly
                  </Link>
                </div>
              </div>
              <ul className="admin-plain-list admin-review-list">
                {reviewRows.map((item) => (
                  <li key={item.name}>
                    <span>{item.name}</span>
                    <span className="admin-review-when">{item.when}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        }
      />
      <section className="command-center-grid" aria-label="Command Center">
        <div className="command-center-primary">
          <section className="command-hero">
            <div>
              <p className="command-kicker">Command Center</p>
              <h1>Today across Unigentamos</h1>
              <p>
                Daily operating view for goals, notes, reviews, resources, finance, and module health.
                This is the dashboard-native shell for deciding what needs attention next.
              </p>
            </div>
            <div className="command-hero-actions" aria-label="Primary command actions">
              <Link href="/admin/personal">Open Personal Ops</Link>
              <Link href="/admin/notes">Open Notes</Link>
            </div>
          </section>

          <section className="command-metric-grid" aria-label="Command metrics">
            {COMMAND_METRICS.map((metric, index) => {
              const value =
                metric.label === "Active goals"
                  ? String(goalItems.reduce((total, item) => total + item.goals.filter((goal) => !goal.done).length, 0) || 12)
                  : metric.label === "Reviews today"
                    ? String(reviewRows.length + 2)
                    : metric.label === "Sync checks"
                      ? String(8)
                      : metric.label === "Media queued"
                        ? String(Math.max(6, personalNotes.filter((note) => note.className === "file").length))
                        : metric.value;

              return (
                <article className={`command-metric command-tone-${metric.tone}`} key={metric.label}>
                  <span>{index + 1}</span>
                  <strong>{value}</strong>
                  <p>{metric.label}</p>
                  <small>{metric.detail}</small>
                </article>
              );
            })}
          </section>

          <section className="command-lanes" aria-label="Work lanes">
            {WORK_LANES.map((lane) => (
              <article className={`command-lane command-tone-${lane.tone}`} key={lane.title}>
                <div className="command-section-title">
                  <h2>{lane.title}</h2>
                  <span />
                </div>
                <div className="command-lane-list">
                  {lane.items.map(([title, detail]) => (
                    <div key={title}>
                      <strong>{title}</strong>
                      <p>{detail}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="command-bottom-grid">
            <article className="command-panel">
              <div className="command-section-title">
                <h2>Focus stack</h2>
                <Link href="/admin/projects">Projects</Link>
              </div>
              <div className="command-focus-list">
                {FOCUS_STACK.map(([title, detail, status]) => (
                  <div key={title}>
                    <span>{status}</span>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="command-panel">
              <div className="command-section-title">
                <h2>Review queue</h2>
                <Link href="/admin/reviews/weekly">Review</Link>
              </div>
              <div className="command-review-list">
                {reviewRows.map((item) => (
                  <div key={item.name}>
                    <strong>{item.name}</strong>
                    <span>{item.when}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>

        <aside className="command-center-rail">
          <section className="command-ai-panel">
            <p>Local AI</p>
            <h2>Private assistant</h2>
            <span>Use the bottom-right dock to ask about the visible page context. Local endpoints only.</span>
            <div>
              <small>Suggested prompt</small>
              <strong>What should I review before the next Figma-to-live slice?</strong>
            </div>
          </section>

          <section className="command-panel">
            <div className="command-section-title">
              <h2>Color map</h2>
              <span>Adaptive</span>
            </div>
            <div className="command-color-map">
              {["Goal", "Review", "Sync", "AI", "Media", "Finance"].map((item, index) => (
                <span className={`command-swatch command-swatch-${index}`} key={item}>
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="command-panel">
            <div className="command-section-title">
              <h2>Module health</h2>
              <Link href="/admin/docs">Docs</Link>
            </div>
            <div className="command-health-list">
              {MODULE_HEALTH.map(([module, status, tone]) => (
                <div className={`command-health command-tone-${tone}`} key={module}>
                  <span />
                  <strong>{module}</strong>
                  <small>{status}</small>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
      {playIntro && <span className="command-intro-flag" aria-hidden="true" />}
    </main>
  );
}
