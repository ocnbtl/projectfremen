import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const resourceRows = [
  ["Podcast: local systems", "Podcast", "Listen", "orange"],
  ["Article: dashboard design", "Article", "Read", "blue"],
  ["Social post: garden layout", "Social post", "Save idea", "pink"],
  ["Image: travel map", "Image", "Link to trip", "cyan"],
  ["Paper: AI memory", "Paper", "Summarize", "purple"]
];

export default async function ResourcesPage() {
  await requireAdminSession();

  return (
    <main className="shell admin-chrome-main module-ref-shell resource-module-shell">
      <AdminChrome
        sidebarTitle="Resources"
        sidebarSummary="Podcasts, articles, posts, images, references, and saved ideas."
        sidebarItems={[
          { label: "Inbox", value: "37" },
          { label: "To read", value: "18" },
          { label: "To process", value: "9" },
          { label: "Evergreen", value: "64" }
        ]}
        sidebarActions={[
          { label: "Inbox", href: "/admin/resources" },
          { label: "Articles", href: "/admin/resources" },
          { label: "Podcasts", href: "/admin/resources" },
          { label: "Social posts", href: "/admin/resources" },
          { label: "Media files", href: "/admin/media" },
          { label: "Notes", href: "/admin/notes" }
        ]}
      />
      <header className="module-ref-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-orange">Resources</p>
          <h1>Resource library</h1>
          <p>
            Capture articles, podcasts, pictures, social posts, references, and ideas without
            mixing them into authored Notes or uploaded Files.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search resources" placeholder="Search resources, topics, sources" />
          <kbd>refs</kbd>
        </label>
      </header>

      <section className="module-ref-content">
        <div className="module-ref-main">
          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Intake</h2>
              <Link href="/admin/notes" className="review-back-link">
                Open Notes
              </Link>
            </div>
            <div className="module-ref-chip-row">
              <span>Article</span>
              <span>Podcast</span>
              <span>Image</span>
              <span>Social post</span>
              <span>Quote</span>
            </div>
            <p>
              Save item, classify source type, add topic tags, connect to notes/projects, and mark
              reading, summarizing, or follow-up status.
            </p>
          </article>

          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Saved resources</h2>
              <span>Queue</span>
            </div>
            <div className="module-ref-row-list">
              {resourceRows.map(([title, type, action, tone]) => (
                <div className={`module-ref-row module-ref-tone-${tone}`} key={title}>
                  <strong>{title}</strong>
                  <span>{type}</span>
                  <span>{action}</span>
                  <span>Reference</span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="module-ref-detail">
          <div className="module-ref-detail-title">
            <span className="module-ref-eyebrow module-ref-tone-blue">Selected resource</span>
            <h2>Article: dashboard design</h2>
          </div>
          <p>
            Resources are saved external material. They can become notes later, but the boundary
            stays explicit so reference material does not crowd authored dashboard objects.
          </p>
          <div className="module-ref-field-list">
            {[
              ["Source", "Web article"],
              ["Status", "To read"],
              ["Topics", "design system, admin UI"],
              ["Related note", "Command Center"],
              ["Action", "Summarize key ideas"],
              ["Saved", "June 1"]
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
