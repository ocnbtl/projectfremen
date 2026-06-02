import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const resourceTypes = [
  { label: "Articles", value: "12", tone: "blue" },
  { label: "Podcasts", value: "5", tone: "green" },
  { label: "Posts", value: "18", tone: "pink" },
  { label: "Images", value: "9", tone: "cyan" }
];

const resourceRows = [
  ["Architecture essay", "Article", "Needs summary"],
  ["Local AI notes", "Podcast", "Queued"],
  ["Design reference", "Image", "Linked"],
  ["Review prompt", "Social post", "Needs owner"]
];

export default async function ResourcesPage() {
  await requireAdminSession();

  return (
    <main className="shell admin-chrome-main resource-module-shell">
      <AdminChrome
        sidebarTitle="Resources"
        sidebarSummary="Saved articles, podcasts, social posts, pictures, quotes, and references."
        sidebarItems={[
          { label: "Inbox", value: "44" },
          { label: "Needs review", value: "9" },
          { label: "Linked", value: "27" }
        ]}
        sidebarActions={[
          { label: "All resources", href: "/admin/resources" },
          { label: "Media files", href: "/admin/media" },
          { label: "Notes", href: "/admin/notes" }
        ]}
      />
      <header className="topbar">
        <div>
          <p className="muted personal-ops-kicker">Resources</p>
          <h1 style={{ margin: 0 }}>Resource library</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            External references stay distinct from authored notes and uploaded files.
          </p>
        </div>
        <Link href="/admin/notes" className="review-back-link">
          Open Notes
        </Link>
      </header>

      <section className="grid grid-4 module-stat-grid">
        {resourceTypes.map((item) => (
          <article className={`module-stat module-stat-${item.tone}`} key={item.label}>
            <span />
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="module-layout">
        <article className="card module-main-panel">
          <div className="personal-ops-section-heading">
            <h2>Saved resources</h2>
            <span>First pass</span>
          </div>
          <div className="module-table">
            {resourceRows.map(([title, type, status]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{type}</span>
                <span>{status}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="card module-side-panel">
          <h2>Boundary</h2>
          <p className="muted">
            Resources are saved external material. Authored dashboard objects remain Notes;
            uploaded/source attachments remain Files.
          </p>
        </aside>
      </section>
    </main>
  );
}
