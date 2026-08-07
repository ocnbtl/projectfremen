import Link from "next/link";
import AdminChrome from "../../components/AdminChrome";
import CurrentGoalsPanel, { type HomeGoalItem } from "../../components/CurrentGoalsPanel";
import { readEntityGoals } from "../../lib/entity-goals-store";
import { ENTITY_HUBS } from "../../lib/entity-hub";
import { readFinanceState } from "../../lib/modules/finance/store";
import { readPersonalOpsState } from "../../lib/modules/personal-ops/store";
import { readProjectsState } from "../../lib/modules/projects/store";
import { readReviewsState } from "../../lib/modules/reviews/store";
import { readPersonalRecords } from "../../lib/personal-records-store";
import { requireAdminSession } from "../../lib/require-admin";
import { daysUntil, formatMonthDay, getNextFirstSunday, getNextFriday, getNextSunday } from "../../lib/review-schedule";

export const dynamic = "force-dynamic";

const ENTITY_THEME_BY_SLUG: Record<string, "fremen" | "iceflake" | "pint"> = {
  unigentamos: "fremen",
  pngwn: "iceflake",
  "diyesu-decor": "pint"
};

type ReviewRow = { name: string; when: string; href: string };
type AttentionItem = { title: string; detail: string; href: string; tone: string };
type ActivityItem = { label: string; detail: string; href: string; at: string };

function getReviewRows(now: Date): ReviewRow[] {
  const rows = [
    { name: "Weekly Review", date: getNextSunday(now), day: "Sunday", href: "/admin/reviews/weekly" },
    { name: "Monthly Review", date: getNextFirstSunday(now), day: "Sunday", href: "/admin/reviews/monthly" },
    { name: "KPI Refresh", date: getNextFriday(now), day: "Friday", href: "/admin/reviews/weekly" }
  ];
  return rows.map((item) => {
    const days = daysUntil(item.date, now);
    return { name: item.name, href: item.href, when: `${formatMonthDay(item.date)} (${item.day} in ${days} day${days === 1 ? "" : "s"})` };
  });
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const playIntro = params.welcome === "1";
  const reviewRows = getReviewRows(new Date());

  const [personalRecordsResult, personalOpsResult, projectsResult, reviewsResult, financeResult] = await Promise.allSettled([
    readPersonalRecords(),
    readPersonalOpsState(),
    readProjectsState(),
    readReviewsState(),
    readFinanceState()
  ] as const);

  const personalRecords = personalRecordsResult.status === "fulfilled" ? personalRecordsResult.value : [];
  const personalOps = personalOpsResult.status === "fulfilled" ? personalOpsResult.value : null;
  const projects = projectsResult.status === "fulfilled" ? projectsResult.value : null;
  const reviews = reviewsResult.status === "fulfilled" ? reviewsResult.value : null;
  const finance = financeResult.status === "fulfilled" ? financeResult.value : null;

  const goalItems: HomeGoalItem[] = await Promise.all(ENTITY_HUBS.map(async (hub) => ({
    slug: hub.slug,
    entity: hub.entity,
    theme: ENTITY_THEME_BY_SLUG[hub.slug] || "fremen",
    goals: await readEntityGoals(hub.slug, hub.defaultGoals).catch(() => [])
  })));

  const activeGoals = goalItems.reduce((total, item) => total + item.goals.filter((goal) => !goal.done).length, 0);
  const activeProjects = projects?.projects.filter((item) => !item.archivedAt && item.lifecycle === "active") || [];
  const openProjectBlockers = projects?.blockers.filter((item) => !item.archivedAt && item.state === "open") || [];
  const openDecisions = personalOps?.decisions.filter((item) => item.lifecycle !== "archived" && item.decisionState === "open") || [];
  const openObligations = personalOps?.obligations.filter((item) => item.lifecycle !== "archived" && item.obligationState !== "complete") || [];
  const openFollowUps = personalOps?.followUps.filter((item) => item.lifecycle !== "archived" && !["complete", "carried_forward"].includes(item.followUpState)) || [];
  const currentReviews = reviews?.runs.filter((item) => !item.archivedAt && item.current && !["completed", "canceled"].includes(item.lifecycle)) || [];
  const activeAccounts = finance?.accounts.filter((item) => !item.archivedAt) || [];
  const pendingTransactions = finance?.transactions.filter((item) => !item.archivedAt && (item.status === "pending" || !item.reviewed)) || [];
  const dueBills = finance?.bills.filter((item) => !item.archivedAt && ["due", "overdue"].includes(item.status)) || [];
  const currentClose = finance?.closePeriods.filter((item) => !item.archivedAt).sort((left, right) => right.period.localeCompare(left.period))[0];
  const openCloseChecks = currentClose?.checks.filter((item) => item.required && item.resolution === "open") || [];

  const attention: AttentionItem[] = [
    ...(openProjectBlockers.length ? [{ title: `${openProjectBlockers.length} open project blocker${openProjectBlockers.length === 1 ? "" : "s"}`, detail: "Owned by Projects; resolution state is unchanged here.", href: "/admin/projects/blockers", tone: "crimson" }] : []),
    ...(openDecisions.length ? [{ title: `${openDecisions.length} open decision${openDecisions.length === 1 ? "" : "s"}`, detail: "Canonical decisions remain in Personal Ops.", href: "/admin/personal/decisions", tone: "violet" }] : []),
    ...(openObligations.length ? [{ title: `${openObligations.length} open obligation${openObligations.length === 1 ? "" : "s"}`, detail: "Evidence and completion criteria stay with their owner records.", href: "/admin/personal/obligations", tone: "orange" }] : []),
    ...(pendingTransactions.length ? [{ title: `${pendingTransactions.length} Finance transaction${pendingTransactions.length === 1 ? "" : "s"} need review`, detail: "Pending or unreconciled ledger facts.", href: "/admin/finance/transactions?filter=unreviewed", tone: "yellow" }] : []),
    ...(dueBills.length ? [{ title: `${dueBills.length} bill${dueBills.length === 1 ? "" : "s"} due or overdue`, detail: "Payment state requires evidence or an explicit exception.", href: "/admin/finance/bills", tone: "crimson" }] : []),
    ...(openCloseChecks.length ? [{ title: `${openCloseChecks.length} monthly close check${openCloseChecks.length === 1 ? "" : "s"} open`, detail: `${currentClose?.period} remains open until every named check resolves.`, href: "/admin/finance/monthly-review", tone: "blue" }] : []),
    ...(currentReviews.length ? [{ title: `${currentReviews.length} current review run${currentReviews.length === 1 ? "" : "s"}`, detail: "Review completion remains gated in Reviews.", href: "/admin/reviews/weekly", tone: "green" }] : [])
  ];

  const modules = [
    { name: "Projects", href: "/admin/projects", available: Boolean(projects), value: projects ? `${activeProjects.length} active · ${openProjectBlockers.length} blockers` : "Unavailable", tone: "blue" },
    { name: "Personal Ops", href: "/admin/personal", available: Boolean(personalOps), value: personalOps ? `${openDecisions.length} decisions · ${openFollowUps.length} follow-ups` : "Unavailable", tone: "violet" },
    { name: "Notes", href: "/admin/notes", available: personalRecordsResult.status === "fulfilled", value: personalRecordsResult.status === "fulfilled" ? `${personalRecords.filter((item) => item.className === "note").length} records` : "Unavailable", tone: "green" },
    { name: "People", href: "/admin/people", available: personalRecordsResult.status === "fulfilled", value: personalRecordsResult.status === "fulfilled" ? `${personalRecords.filter((item) => item.className === "person").length} records` : "Unavailable", tone: "cyan" },
    { name: "Resources", href: "/admin/resources", available: personalRecordsResult.status === "fulfilled", value: personalRecordsResult.status === "fulfilled" ? `${personalRecords.filter((item) => item.className === "resource").length} records` : "Unavailable", tone: "orange" },
    { name: "Media", href: "/admin/media", available: personalRecordsResult.status === "fulfilled", value: personalRecordsResult.status === "fulfilled" ? `${personalRecords.filter((item) => item.className === "file").length} records` : "Unavailable", tone: "cyan" },
    { name: "Finance", href: "/admin/finance", available: Boolean(finance), value: finance ? `${activeAccounts.length} accounts · ${pendingTransactions.length} pending` : "Unavailable", tone: "orange" },
    { name: "Reviews", href: "/admin/reviews/weekly", available: Boolean(reviews), value: reviews ? `${currentReviews.length} current runs` : "Unavailable", tone: "crimson" }
  ];

  const recentActivity: ActivityItem[] = [
    ...(projects?.projects.filter((item) => !item.archivedAt).map((item) => ({ label: item.name, detail: "Project updated", href: `/admin/projects/${encodeURIComponent(item.id)}`, at: item.updatedAt })) || []),
    ...(personalRecords.slice(0, 30).map((item) => ({
      label: item.title,
      detail: `${item.className} updated`,
      href: item.className === "person" ? `/admin/people/${encodeURIComponent(item.id)}`
        : item.className === "resource" ? `/admin/resources/${encodeURIComponent(item.id)}`
          : item.className === "file" ? `/admin/media/${encodeURIComponent(item.id)}`
            : item.className === "note" ? `/admin/notes/${encodeURIComponent(item.id)}` : "/admin/personal",
      at: item.updatedAt
    })) || []),
    ...(reviews?.runs.filter((item) => !item.archivedAt).map((item) => ({ label: item.title, detail: "Review run updated", href: `/admin/reviews/${item.cadence}?run=${encodeURIComponent(item.id)}`, at: item.updatedAt })) || []),
    ...(finance?.auditEvents.slice(-30).map((item) => ({ label: item.action.replaceAll("_", " ").replaceAll(".", " · "), detail: `${item.objectType} audit event`, href: "/admin/finance", at: item.occurredAt })) || [])
  ].filter((item) => !Number.isNaN(Date.parse(item.at))).sort((left, right) => right.at.localeCompare(left.at)).slice(0, 6);

  const unavailableCount = modules.filter((item) => !item.available).length;
  const metrics = [
    { label: "Active goals", value: String(activeGoals), detail: "Saved Current Goals", tone: "green" },
    { label: "Needs attention", value: String(attention.length), detail: "Derived owner queues", tone: "crimson" },
    { label: "Active projects", value: projects ? String(activeProjects.length) : "—", detail: projects ? `${openProjectBlockers.length} open blockers` : "Source unavailable", tone: "blue" },
    { label: "Finance review", value: finance ? String(pendingTransactions.length + dueBills.length + openCloseChecks.length) : "—", detail: finance ? "Pending facts and checks" : "Source unavailable", tone: "orange" },
    { label: "Unavailable sources", value: String(unavailableCount), detail: "Never inferred or backfilled", tone: "violet" }
  ];

  return (
    <main className="admin-shell admin-home-shell admin-chrome-main">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="Command Center"
        sidebarSummary="A read-through of canonical module state. Changes belong in each owner module."
        sidebarItems={[
          { label: "Active goals", value: String(activeGoals) },
          { label: "Attention", value: String(attention.length) },
          { label: "Unavailable", value: String(unavailableCount) }
        ]}
        sidebarActions={[
          { label: "Projects", href: "/admin/projects" },
          { label: "Personal Ops", href: "/admin/personal" },
          { label: "Finance", href: "/admin/finance" },
          { label: "Reviews", href: "/admin/reviews/weekly" }
        ]}
        sidebarChildren={<>
          <CurrentGoalsPanel initialItems={goalItems} />
          <section className="admin-plain-section">
            <div className="admin-section-heading"><h2>Upcoming Reviews</h2></div>
            <ul className="admin-plain-list admin-review-list">{reviewRows.map((item) => <li key={item.name}><Link href={item.href}>{item.name}</Link><span className="admin-review-when">{item.when}</span></li>)}</ul>
          </section>
        </>}
      />

      <section className="command-center-grid" aria-label="Command Center">
        <div className="command-center-primary">
          <section className="command-hero">
            <div><p className="command-kicker">Command Center</p><h1>What needs attention</h1><p>Counts are derived from current owner records. This page routes work; it does not duplicate or silently change module state.</p></div>
            <div className="command-hero-actions" aria-label="Primary command actions"><Link href="/admin/projects">Open Projects</Link><Link href="/admin/personal">Open Personal Ops</Link></div>
          </section>

          <section className="command-metric-grid" aria-label="Command metrics">{metrics.map((metric, index) => <article className={`command-metric command-tone-${metric.tone}`} key={metric.label}><span>{index + 1}</span><strong>{metric.value}</strong><p>{metric.label}</p><small>{metric.detail}</small></article>)}</section>

          <section className="command-panel command-attention-panel" aria-label="Current attention">
            <div className="command-section-title"><h2>Current attention</h2><span>{attention.length} derived</span></div>
            {attention.length ? <div className="command-focus-list">{attention.map((item) => <Link href={item.href} className={`command-attention-link command-tone-${item.tone}`} key={`${item.href}:${item.title}`}><span>Owner route</span><strong>{item.title}</strong><p>{item.detail}</p></Link>)}</div> : <div className="command-empty-state"><strong>No current attention items</strong><p>Every connected queue currently resolves to zero. Open a module to create or review work.</p></div>}
          </section>

          <section className="command-lanes" aria-label="Module source state">{modules.map((module) => <article className={`command-lane command-tone-${module.tone}`} key={module.name}><div className="command-section-title"><h2>{module.name}</h2><span>{module.available ? "Connected" : "Unavailable"}</span></div><div className="command-lane-list"><Link href={module.href}><strong>{module.value}</strong><p>{module.available ? "Open the canonical owner module" : "No values inferred while this source is unavailable"}</p></Link></div></article>)}</section>

          <section className="command-bottom-grid">
            <article className="command-panel"><div className="command-section-title"><h2>Recent canonical activity</h2><span>{recentActivity.length}</span></div>{recentActivity.length ? <div className="command-review-list">{recentActivity.map((item) => <Link href={item.href} key={`${item.at}:${item.label}`}><strong>{item.label}</strong><span>{item.detail} · {formatActivityTime(item.at)}</span></Link>)}</div> : <div className="command-empty-state"><strong>No recent activity available</strong><p>Connected sources returned no timestamped owner records.</p></div>}</article>
            <article className="command-panel"><div className="command-section-title"><h2>Review schedule</h2><Link href="/admin/reviews/weekly">Open Reviews</Link></div><div className="command-review-list">{reviewRows.map((item) => <Link href={item.href} key={item.name}><strong>{item.name}</strong><span>{item.when}</span></Link>)}</div></article>
          </section>
        </div>

        <aside className="command-center-rail">
          <section className="command-ai-panel"><p>Private AI dock</p><h2>Visible-context help</h2><span>The assistant can explain the current page and suggest next steps. It does not silently mutate owner records.</span><div><small>Boundary</small><strong>No queued suggestion count is invented here.</strong></div></section>
          <section className="command-panel"><div className="command-section-title"><h2>Ownership</h2><span>Native</span></div><div className="command-color-map"><span className="command-swatch command-swatch-0">Goals</span><span className="command-swatch command-swatch-1">Reviews</span><span className="command-swatch command-swatch-2">Projects</span><span className="command-swatch command-swatch-3">Personal Ops</span><span className="command-swatch command-swatch-4">Records</span><span className="command-swatch command-swatch-5">Finance</span></div></section>
          <section className="command-panel"><div className="command-section-title"><h2>Module sources</h2><span>{modules.length - unavailableCount}/{modules.length}</span></div><div className="command-health-list">{modules.map((module) => <Link className={`command-health command-tone-${module.tone}`} href={module.href} key={module.name}><span /><strong>{module.name}</strong><small>{module.available ? "Connected" : "Unavailable"}</small></Link>)}</div></section>
        </aside>
      </section>
      {playIntro && <span className="command-intro-flag" aria-hidden="true" />}
    </main>
  );
}
