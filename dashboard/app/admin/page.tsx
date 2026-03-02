import Link from "next/link";
import { ACTION_ITEMS } from "../../lib/seed-data";
import KpiManager from "../../components/KpiManager";
import DocsIndexPanel from "../../components/DocsIndexPanel";
import ObsidianExportPanel from "../../components/ObsidianExportPanel";
import AdminWelcomeIntro from "../../components/AdminWelcomeIntro";
import UpcomingReviewSummary from "../../components/UpcomingReviewSummary";

const ENTITIES = [
  {
    name: "Unigentamos",
    type: "Holding / umbrella",
    status: "Active planning",
    theme: "fremen",
    slug: "unigentamos"
  },
  {
    name: "pngwn",
    type: "Brand project (Project Iceflake)",
    status: "Website build",
    theme: "iceflake",
    slug: "pngwn"
  },
  {
    name: "Diyesu Decor",
    type: "Brand project (Project Pint)",
    status: "Content ops build",
    theme: "pint",
    slug: "diyesu-decor"
  }
];

const ENTITY_THEME_BY_NAME: Record<string, "fremen" | "iceflake" | "pint"> = {
  Unigentamos: "fremen",
  pngwn: "iceflake",
  "Diyesu Decor": "pint"
};

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const params = await searchParams;
  const playIntro = params.welcome === "1";

  return (
    <main className="admin-shell">
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

      <section className="admin-overview-grid">
        <div className="admin-overview-left">
          <AdminWelcomeIntro playIntro={playIntro} />

          <article className="card admin-slate-card">
            <h2>Due Now and Upcoming</h2>
            <table className="admin-compact-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Entity</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ACTION_ITEMS.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <span className={`pill entity-pill entity-pill-${ENTITY_THEME_BY_NAME[item.entity]}`}>
                        {item.entity}
                      </span>
                    </td>
                    <td>{item.due}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <UpcomingReviewSummary />
        </div>

        <aside className="card admin-quick-nav-card">
          <p className="admin-quick-nav-kicker">Quick Navigation</p>
          <a href="#kpi-tracker" className="admin-quick-nav-link">
            KPI Tracker
          </a>
          <a href="#obsidian-export" className="admin-quick-nav-link">
            Obsidian Export
          </a>
          <a href="#github-sync" className="admin-quick-nav-link">
            GitHub Sync
          </a>
        </aside>
      </section>

      <section id="kpi-tracker" className="admin-anchor-section">
        <KpiManager />
      </section>

      <section id="obsidian-export" className="admin-anchor-section">
        <ObsidianExportPanel />
      </section>

      <section id="github-sync" className="admin-anchor-section">
        <DocsIndexPanel />
      </section>

    </main>
  );
}
