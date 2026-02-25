import { ACTION_ITEMS } from "../../lib/seed-data";
import RotatingWelcome from "../../components/RotatingWelcome";
import KpiManager from "../../components/KpiManager";
import DocsIndexPanel from "../../components/DocsIndexPanel";

const UPCOMING_REVIEWS = [
  { label: "Weekly Review", due: "Monday 9:00 AM" },
  { label: "Monthly Review", due: "1st business day 10:00 AM" },
  { label: "KPI Refresh", due: "Friday 4:00 PM" }
];

const ENTITIES = [
  {
    name: "Unigentamos",
    type: "Holding / umbrella",
    status: "Active planning",
    theme: "fremen"
  },
  {
    name: "pngwn",
    type: "Brand project (Project Iceflake)",
    status: "Website build",
    theme: "iceflake"
  },
  {
    name: "Diyesu Decor",
    type: "Brand project (Project Pint)",
    status: "Content ops build",
    theme: "pint"
  }
];

const ENTITY_THEME_BY_NAME: Record<string, "fremen" | "iceflake" | "pint"> = {
  Unigentamos: "fremen",
  pngwn: "iceflake",
  "Diyesu Decor": "pint"
};

export default function AdminPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Action Center</h1>
          <RotatingWelcome />
        </div>
        <div className="pill">MVP Mode: Founder-only</div>
      </header>

      <section className="grid grid-3">
        {ENTITIES.map((entity) => (
          <article className={`card entity-card entity-card-${entity.theme}`} key={entity.name}>
            <h3>{entity.name}</h3>
            <p className="muted">{entity.type}</p>
            <p>
              <span className={`pill entity-pill entity-pill-${entity.theme}`}>{entity.status}</span>
            </p>
          </article>
        ))}
      </section>

      <section className="grid grid-2" style={{ marginTop: 12 }}>
        <article className="card">
          <h2>Due Now and Upcoming</h2>
          <table>
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

        <article className="card">
          <h2>Upcoming Reviews</h2>
          <table>
            <thead>
              <tr>
                <th>Review</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {UPCOMING_REVIEWS.map((review) => (
                <tr key={review.label}>
                  <td>{review.label}</td>
                  <td>{review.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>

      <KpiManager />

      <DocsIndexPanel />

      <section className="card" style={{ marginTop: 12 }}>
        <h2>MVP Notes</h2>
        <ul>
          <li>Obsidian relationship semantics are preserved.</li>
          <li>Project hierarchy is operational in app data, not note lineage.</li>
          <li>Docs index and KPI persistence are now available in admin panels.</li>
        </ul>
      </section>
    </main>
  );
}
