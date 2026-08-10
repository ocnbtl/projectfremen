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
type AttentionPriority = "now" | "next" | "watch";
type AttentionItem = { id: string; title: string; detail: string; owner: string; when: string; action: string; href: string; tone: string; priority: AttentionPriority; sortAt: string };
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

function dueLabel(value: string | undefined, now: Date): string {
  if (!value) return "No due date";
  const due = new Date(value.length === 10 ? value + "T23:59:59" : value);
  if (Number.isNaN(due.getTime())) return "Date needs review";
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "Overdue by " + Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s");
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return "Due " + new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(due);
}

function priorityForDate(value: string | undefined, now: Date, fallback: AttentionPriority): AttentionPriority {
  if (!value) return fallback;
  const due = new Date(value.length === 10 ? value + "T23:59:59" : value);
  if (Number.isNaN(due.getTime())) return fallback;
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  return days <= 1 ? "now" : days <= 7 ? "next" : fallback;
}

function shortDetail(value: string | undefined, fallback: string): string {
  const normalized = (value || "").trim();
  return normalized ? normalized.slice(0, 220) : fallback;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(value));
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

  const now = new Date();
  const projectNames = new Map((projects?.projects || []).map((item) => [item.id, item.name]));
  const attentionCandidates: AttentionItem[] = [
    ...openProjectBlockers.map((item) => ({
      id: "project-blocker:" + item.id,
      title: item.title,
      detail: shortDetail(item.condition, "This blocker needs a resolution or carry-forward decision."),
      owner: "Projects · " + (projectNames.get(item.projectId) || "Project"),
      when: dueLabel(item.dueAt, now),
      action: "Resolve blocker",
      href: "/admin/projects/blockers",
      tone: "crimson",
      priority: item.severity === "critical" || item.severity === "high" ? "now" : priorityForDate(item.dueAt, now, item.severity === "medium" ? "next" : "watch"),
      sortAt: item.dueAt || item.updatedAt
    } as AttentionItem)),
    ...openDecisions.map((item) => ({
      id: "decision:" + item.id,
      title: item.title,
      detail: shortDetail(item.question, "This decision is still open."),
      owner: "Personal Ops · Decisions",
      when: dueLabel(item.revisitAt || item.dueAt, now),
      action: "Make or defer decision",
      href: "/admin/personal/decisions",
      tone: "violet",
      priority: item.risk === "critical" || item.risk === "high" ? "now" : priorityForDate(item.revisitAt || item.dueAt, now, "next"),
      sortAt: item.revisitAt || item.dueAt || item.updatedAt
    } as AttentionItem)),
    ...openObligations.map((item) => ({
      id: "obligation:" + item.id,
      title: item.title,
      detail: shortDetail(item.consequence, "This commitment still needs completion evidence."),
      owner: "Personal Ops · Obligations",
      when: dueLabel(item.dueAt, now),
      action: "Review commitment",
      href: "/admin/personal/obligations",
      tone: "orange",
      priority: item.obligationState === "blocked" || item.priority === "critical" ? "now" : priorityForDate(item.dueAt, now, item.priority === "high" ? "next" : "watch"),
      sortAt: item.dueAt || item.updatedAt
    } as AttentionItem)),
    ...openFollowUps.map((item) => ({
      id: "follow-up:" + item.id,
      title: item.title,
      detail: shortDetail(item.context, "This follow-up is still open."),
      owner: "Personal Ops · Follow-ups",
      when: dueLabel(item.deferredUntil || item.dueAt, now),
      action: "Open follow-up",
      href: "/admin/personal/follow-ups",
      tone: "green",
      priority: priorityForDate(item.deferredUntil || item.dueAt, now, item.priority === "critical" || item.priority === "high" ? "next" : "watch"),
      sortAt: item.deferredUntil || item.dueAt || item.updatedAt
    } as AttentionItem)),
    ...pendingTransactions.map((item) => ({
      id: "finance-transaction:" + item.id,
      title: item.merchant || "Unlabeled transaction",
      detail: money(item.amount) + " · " + item.category + (item.status === "pending" ? " · pending" : " · ready for review"),
      owner: "Finance · Transactions",
      when: "Recorded " + item.occurredOn,
      action: "Review ledger entry",
      href: "/admin/finance/transactions?filter=unreviewed",
      tone: "yellow",
      priority: item.status === "pending" ? "next" : "watch",
      sortAt: item.occurredOn
    } as AttentionItem)),
    ...dueBills.map((item) => ({
      id: "finance-bill:" + item.id,
      title: item.name,
      detail: money(item.amount) + " · " + item.category + (item.autopay ? " · autopay recorded" : ""),
      owner: "Finance · Bills",
      when: dueLabel(item.dueDate, now),
      action: "Review bill status",
      href: "/admin/finance/bills",
      tone: "crimson",
      priority: item.status === "overdue" ? "now" : priorityForDate(item.dueDate, now, "next"),
      sortAt: item.dueDate
    } as AttentionItem)),
    ...openCloseChecks.map((item) => ({
      id: "finance-close:" + currentClose?.id + ":" + item.id,
      title: item.label,
      detail: "Required for the " + (currentClose?.period || "current") + " Finance close.",
      owner: "Finance · Monthly close",
      when: "Before close can finish",
      action: "Resolve close check",
      href: "/admin/finance/monthly-review",
      tone: "blue",
      priority: "next",
      sortAt: currentClose?.updatedAt || ""
    } as AttentionItem)),
    ...currentReviews.map((item) => {
      const openRequired = item.checklist.filter((check) => check.required && !["complete", "waived", "carried_forward"].includes(check.state)).length;
      return {
        id: "review:" + item.id,
        title: item.title,
        detail: openRequired ? openRequired + " required check" + (openRequired === 1 ? " remains." : "s remain.") : "Ready for final review and completion.",
        owner: "Reviews · " + item.cadence,
        when: dueLabel(item.dueAt, now),
        action: "Continue review",
        href: "/admin/reviews/" + encodeURIComponent(item.cadence) + "?run=" + encodeURIComponent(item.id),
        tone: "green",
        priority: priorityForDate(item.dueAt, now, openRequired ? "next" : "watch"),
        sortAt: item.dueAt || item.updatedAt
      } as AttentionItem;
    })
  ];
  const priorityOrder: Record<AttentionPriority, number> = { now: 0, next: 1, watch: 2 };
  const attentionTotal = attentionCandidates.length;
  const attention = attentionCandidates
    .sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority] || left.sortAt.localeCompare(right.sortAt))
    .slice(0, 36);
  const attentionGroups: Array<{ key: AttentionPriority; label: string; note: string }> = [
    { key: "now", label: "Now", note: "Overdue, blocked, or high-risk" },
    { key: "next", label: "Next", note: "Due soon or awaiting review" },
    { key: "watch", label: "Watch", note: "Open, but not urgent yet" }
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
  const attentionCounts = Object.fromEntries(attentionGroups.map((group) => [group.key, attentionCandidates.filter((item) => item.priority === group.key).length])) as Record<AttentionPriority, number>;

  return (
    <main className="admin-shell admin-home-shell admin-chrome-main">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="Command Center"
        sidebarSummary="A read-through of canonical module state. Changes belong in each owner module."
        sidebarItems={[
          { label: "Active goals", value: String(activeGoals) },
          { label: "Attention", value: String(attentionTotal) },
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
            <div><p className="command-kicker">Command Center</p><h1>What needs attention</h1><p>Your live operating desk, built from the same records used in every module. Nothing is copied here: each item opens its owner record so work stays consistent online, offline, and across devices.</p></div>
            <div className="command-hero-actions" aria-label="Primary command actions"><Link href="/vault">Open Vault</Link><Link href="/admin/finance">Open Finance</Link><Link href="/admin/projects">Open Projects</Link></div>
          </section>

          <section className="command-attention-summary" aria-label="Attention horizon">
            <div><span>Attention horizon</span><strong>{attentionTotal}</strong><small>live owner records</small></div>
            {attentionGroups.map((group) => <div className={"command-priority-" + group.key} key={group.key}><span>{group.label}</span><strong>{attentionCounts[group.key]}</strong><small>{group.note}</small></div>)}
          </section>

          <section className="command-panel command-attention-panel" aria-label="Current attention">
            <div className="command-section-title"><div><p className="command-kicker-small">Live worklist</p><h2>Current attention</h2></div><span>{attentionTotal} records</span></div>
            {attention.length ? <div className="command-horizon">
              {attentionGroups.map((group) => {
                const items = attention.filter((item) => item.priority === group.key);
                return items.length ? <section className="command-horizon-group" key={group.key} aria-labelledby={"attention-" + group.key}>
                  <header><div><span className={"command-priority-dot command-priority-" + group.key} /><h3 id={"attention-" + group.key}>{group.label}</h3></div><p>{group.note}</p><strong>{attentionCounts[group.key]}</strong></header>
                  <div className="command-attention-list">{items.map((item) => <Link href={item.href} className={"command-attention-row command-priority-" + item.priority + " command-tone-" + item.tone} key={item.id}>
                    <div className="command-attention-meta"><span>{item.owner}</span><time>{item.when}</time></div>
                    <strong>{item.title}</strong><p>{item.detail}</p><small>{item.action} →</small>
                  </Link>)}</div>
                </section> : null;
              })}
              {attentionTotal > attention.length && <p className="command-overflow-note">Showing the first {attention.length} items. Open the owner modules for the full queues.</p>}
            </div> : <div className="command-empty-state"><strong>Nothing needs attention right now</strong><p>Connected owner queues are clear. New work will appear here automatically.</p></div>}
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
