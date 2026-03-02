import Link from "next/link";
import AdminWelcomeIntro from "../../components/AdminWelcomeIntro";
import CurrentGoalsPanel, { type HomeGoalItem } from "../../components/CurrentGoalsPanel";
import DashboardClockHero from "../../components/DashboardClockHero";
import { readEntityGoals } from "../../lib/entity-goals-store";
import { ENTITY_HUBS } from "../../lib/entity-hub";
import { requireAdminSession } from "../../lib/require-admin";
import {
  daysUntil,
  formatMonthDay,
  getNextFirstSunday,
  getNextFriday,
  getNextSunday
} from "../../lib/review-schedule";

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
  const goalItems: HomeGoalItem[] = await Promise.all(
    ENTITY_HUBS.map(async (hub) => ({
      slug: hub.slug,
      entity: hub.entity,
      theme: ENTITY_THEME_BY_SLUG[hub.slug] || "fremen",
      goals: await readEntityGoals(hub.slug, hub.defaultGoals)
    }))
  );

  return (
    <main className="admin-shell admin-home-shell">
      <header className="admin-floating-nav">
        <nav className="admin-entity-nav" aria-label="Entity navigation">
          {ENTITIES.map((entity) => (
            <Link
              href={`/admin/entities/${entity.slug}`}
              className={`admin-entity-link admin-entity-link-${entity.theme}`}
              key={entity.name}
            >
              <span>{entity.name}</span>
            </Link>
          ))}
        </nav>
      </header>

      <section className="admin-home-grid">
        <div className="admin-home-left">
          <AdminWelcomeIntro playIntro={playIntro} />
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
        </div>

        <div className="admin-home-center">
          <DashboardClockHero />
        </div>

        <aside className="admin-quick-links">
          <Link href="/admin/kpis" className="admin-quick-link">
            KPI Tracker
          </Link>
          <Link href="/admin/obsidian" className="admin-quick-link">
            Obsidian Export
          </Link>
          <Link href="/admin/docs" className="admin-quick-link">
            GitHub Sync
          </Link>
        </aside>
      </section>
    </main>
  );
}
