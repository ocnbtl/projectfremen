import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTION_ITEMS } from "../../../../lib/seed-data";
import { readDocsIndex } from "../../../../lib/docs-sync";
import { getEntityHubBySlug, filterDocsForEntity, sortEntityKpis } from "../../../../lib/entity-hub";
import EntityGoalsPanel from "../../../../components/EntityGoalsPanel";
import { readEntityGoals } from "../../../../lib/entity-goals-store";
import { readKpis } from "../../../../lib/kpis-store";

function parseTrend(value: string): { direction: "up" | "down" | "flat"; percent: string } | null {
  const arrowMatch = value.match(/([↑↓↔])\s*([0-9]+(?:\.[0-9]+)?%)/);
  if (arrowMatch) {
    const symbol = arrowMatch[1];
    const percent = arrowMatch[2];
    if (symbol === "↑") {
      return { direction: "up", percent };
    }
    if (symbol === "↓") {
      return { direction: "down", percent };
    }
    return { direction: "flat", percent };
  }

  const signMatch = value.match(/([+-])\s*([0-9]+(?:\.[0-9]+)?%)/);
  if (signMatch) {
    return {
      direction: signMatch[1] === "+" ? "up" : "down",
      percent: signMatch[2]
    };
  }

  return null;
}

function parseRatio(value: string): { current: number; target: number; percent: number } | null {
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const current = Number(match[1]);
  const target = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return null;
  }

  const percent = Math.min(100, Math.max(0, (current / target) * 100));
  return { current, target, percent };
}

function buildInsights(kpis: Array<{ name: string; value: string }>, openTasks: number): string[] {
  const insights: string[] = [];

  for (const kpi of kpis) {
    const ratio = parseRatio(kpi.value);
    if (ratio) {
      insights.push(`${kpi.name}: ${ratio.current}/${ratio.target} complete (${Math.round(ratio.percent)}%).`);
      continue;
    }

    const trend = parseTrend(kpi.value);
    if (trend) {
      if (trend.direction === "up") {
        insights.push(`${kpi.name} is up ${trend.percent} versus prior period.`);
      } else if (trend.direction === "down") {
        insights.push(`${kpi.name} is down ${trend.percent} versus prior period.`);
      } else {
        insights.push(`${kpi.name} is flat (${trend.percent}) versus prior period.`);
      }
      continue;
    }

    insights.push(`${kpi.name}: current value is ${kpi.value}.`);
  }

  insights.push(`Open action items in dashboard: ${openTasks}.`);
  return insights.slice(0, 6);
}

export default async function EntityHubPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = getEntityHubBySlug(slug);

  if (!config) {
    notFound();
  }

  const [allKpis, docsState, goals] = await Promise.all([
    readKpis(),
    readDocsIndex(),
    readEntityGoals(config.slug, config.defaultGoals)
  ]);

  const kpis = sortEntityKpis(
    allKpis.filter((item) => item.entity === config.entity),
    config
  );

  const entityTasks = ACTION_ITEMS.filter((item) => item.entity === config.entity);
  const docs = filterDocsForEntity(docsState.items, config);

  const repoDocCounts = config.repos.map((repo) => ({
    repo,
    count: docs.filter((item) => item.repo === repo).length
  }));

  const insights = buildInsights(kpis, entityTasks.length);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>{config.heading}</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {config.shortDescription} Source project: {config.projectLabel}.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Dashboard
        </Link>
      </header>

      <section className="grid grid-3">
        <article className="card entity-hub-stat">
          <p className="muted" style={{ margin: 0 }}>Tracked KPIs</p>
          <h3>{kpis.length}</h3>
        </article>
        <article className="card entity-hub-stat">
          <p className="muted" style={{ margin: 0 }}>Linked Documents</p>
          <h3>{docs.length}</h3>
        </article>
        <article className="card entity-hub-stat">
          <p className="muted" style={{ margin: 0 }}>Open Action Items</p>
          <h3>{entityTasks.length}</h3>
        </article>
      </section>

      <section className="grid grid-2" style={{ marginTop: 12 }}>
        <article className="card">
          <h2>Important Insights</h2>
          <ul>
            {insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </article>

        <EntityGoalsPanel slug={config.slug} initialGoals={goals} />
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h2>KPI Board</h2>
        {kpis.length === 0 ? (
          <p className="muted">No KPIs found for this entity yet.</p>
        ) : (
          <div className="entity-hub-kpi-grid">
            {kpis.map((kpi) => (
              <article className="entity-hub-kpi-card" key={kpi.id}>
                <p className="entity-hub-kpi-name">{kpi.name}</p>
                <p className="entity-hub-kpi-value">{kpi.value}</p>
                <p className="muted" style={{ margin: "0 0 6px" }}>
                  Updated {new Date(kpi.updatedAt).toLocaleString()}
                </p>
                {kpi.link && (
                  <a href={kpi.link} target="_blank" rel="noreferrer" className="review-open-link">
                    Open source
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-2" style={{ marginTop: 12 }}>
        <article className="card">
          <h2>Repositories</h2>
          <table>
            <thead>
              <tr>
                <th>Repo</th>
                <th>Docs Found</th>
              </tr>
            </thead>
            <tbody>
              {repoDocCounts.map((row) => (
                <tr key={row.repo}>
                  <td>
                    <a href={`https://github.com/${row.repo}`} target="_blank" rel="noreferrer">
                      {row.repo}
                    </a>
                  </td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card">
          <h2>Current Tasks</h2>
          {entityTasks.length === 0 ? (
            <p className="muted">No action items mapped yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entityTasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{task.due}</td>
                    <td>{task.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Connected Documents</h2>
        {docs.length === 0 ? (
          <p className="muted">No docs connected yet. Run Sync From GitHub and check metadata.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Repo</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {docs.slice(0, 20).map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <a href={doc.url} target="_blank" rel="noreferrer">
                      {doc.title}
                    </a>
                  </td>
                  <td>{doc.repo}</td>
                  <td>{doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
