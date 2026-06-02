import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const mediaTiles = [
  ["Garden reference", "Needs metadata", "green"],
  ["Invoice PDF", "Linked / reviewed", "blue"],
  ["Review screenshot", "Needs metadata", "crimson"],
  ["Trip map", "Linked / reviewed", "cyan"],
  ["Podcast cover", "Needs metadata", "orange"],
  ["Planting diagram", "Linked / reviewed", "purple"]
];

export default async function MediaPage() {
  await requireAdminSession();

  return (
    <main className="shell admin-chrome-main module-ref-shell media-module-shell">
      <AdminChrome
        sidebarTitle="Media & files"
        sidebarSummary="Images, files, screenshots, maps, references, and source attachments."
        sidebarItems={[
          { label: "Inbox", value: "23" },
          { label: "Needs alt", value: "8" },
          { label: "Unlinked", value: "11" },
          { label: "Archived", value: "96" }
        ]}
        sidebarActions={[
          { label: "All media", href: "/admin/media" },
          { label: "Files", href: "/admin/media" },
          { label: "Needs review", href: "/admin/media" },
          { label: "Maps & diagrams", href: "/admin/media" },
          { label: "Notes", href: "/admin/notes" },
          { label: "Personal Ops", href: "/admin/personal" }
        ]}
      />
      <header className="module-ref-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-cyan">Media</p>
          <h1>Media and files</h1>
          <p>
            A complete place for files, images, screenshots, maps, source PDFs, and attachment
            metadata without mixing uploaded Files into authored Notes.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search media" placeholder="Search files, sources, tags" />
          <kbd>files</kbd>
        </label>
      </header>

      <section className="module-ref-content">
        <div className="module-ref-main">
          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Media Boundary</h2>
              <Link href="/admin/notes" className="review-back-link">
                Open Notes
              </Link>
            </div>
            <div className="module-ref-chip-row">
              <span>Images</span>
              <span>Files</span>
              <span>Screenshots</span>
              <span>Maps</span>
              <span>Needs alt</span>
            </div>
            <p>
              Filter by type, linked note, source, rights, date added, review state, and
              AI-suggested tags.
            </p>
          </article>

          <div className="module-ref-tile-grid">
            {mediaTiles.map(([title, state, tone]) => (
              <figure className="module-ref-tile" key={title}>
                <div className={`module-ref-thumb module-ref-tone-${tone}`} />
                <figcaption>
                  <strong>{title}</strong>
                  <span>{state}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <aside className="module-ref-detail">
          <div className="module-ref-detail-title">
            <span className="module-ref-eyebrow module-ref-tone-cyan">Selected file</span>
            <h2>Review screenshot</h2>
          </div>
          <p>
            Preview, alt text, source, linked notes, rights, tags, and review status stay visible
            before a file becomes part of a note workflow.
          </p>
          <div className="module-ref-field-list">
            {[
              ["Alt text", "Needs update"],
              ["Linked note", "Weekly review"],
              ["Source", "Desktop capture"],
              ["Rights", "Personal use"],
              ["Tags", "review, UI, current goals"],
              ["AI suggestion", "Crop and summarize"]
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
