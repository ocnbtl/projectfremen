import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const fallbackNoteRows = [
  ["Garden planning note", "Note", "Personal Ops", "Missing", "Review", "Today", "crimson"],
  ["Current Goals sync", "Note", "Goal link", "Ocean", "Active", "Today", "green"],
  ["Media import queue", "Note", "Media", "Ocean", "Queued", "Today", "cyan"],
  ["GitHub source map", "Source file", "System", "Source", "Review", "Today", "brown"],
  ["AI suggested fields", "Assistive note", "Local AI", "Draft", "Review", "Today", "purple"]
];

export default async function NotesPage() {
  await requireAdminSession();
  const records = await readPersonalRecords().catch(() => []);
  const notes = records.filter((record) => record.domain === "notes-docs");
  const noteRows =
    notes.length > 0
      ? notes.slice(0, 5).map((record) => [
          record.title,
          record.className || "Note",
          record.domain || "Personal Ops",
          record.privacy === "private" ? "Ocean" : "Shared",
          record.status || "review",
          record.createdMeta.created || "Today",
          record.stage === "processed" ? "green" : "orange",
          record.id
        ])
      : fallbackNoteRows.map((row) => [...row, ""]);

  return (
    <main className="shell admin-chrome-main module-ref-shell notes-module-shell">
      <AdminChrome
        sidebarTitle="Notes"
        sidebarSummary="Dashboard-native objects grouped by properties, workflow, and review state."
        sidebarItems={[
          { label: "All notes", value: String(Math.max(records.length, 128)) },
          { label: "Needs review", value: "14" },
          { label: "Linked goals", value: "32" },
          { label: "Sources", value: "21" }
        ]}
        sidebarActions={[
          { label: "Missing owner", href: "/admin/notes" },
          { label: "Recent notes", href: "/admin/notes" },
          { label: "Media attached", href: "/admin/media" },
          { label: "Archived sources", href: "/admin/notes" },
          { label: "Create Note", href: "/admin/personal/notes-docs" },
          { label: "Personal Ops", href: "/admin/personal" }
        ]}
      />
      <header className="module-ref-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-pink">Notes</p>
          <h1>Note workspace</h1>
          <p>
            Property-based notes with category, source, owner, status, linked goals, and review
            clarity visible while creating and viewing notes.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search notes" placeholder="Search notes, properties, sources" />
          <kbd>notes</kbd>
        </label>
      </header>

      <section className="module-ref-content">
        <div className="module-ref-main">
          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Active notes</h2>
              <Link href="/admin/personal/notes-docs" className="review-back-link">
                Create Note
              </Link>
            </div>
            <div className="module-ref-chip-row">
              <span>Notes</span>
              <span>Vault</span>
              <span>Review</span>
              <span>Sources</span>
              <span>Media</span>
              <span>Filters</span>
            </div>
            <div className="module-ref-table">
              {noteRows.map(([title, type, category, owner, status, updated, tone, id]) => {
                const row = (
                  <div className={`module-ref-table-row module-ref-tone-${tone}`} key={title}>
                    <strong>{title}</strong>
                    <span>{type}</span>
                    <span>{category}</span>
                    <span>{owner}</span>
                    <span>{status}</span>
                    <span>{updated}</span>
                  </div>
                );

                return id ? (
                  <Link href={`/admin/personal/records/${id}`} key={title} style={{ textDecoration: "none" }}>
                    {row}
                  </Link>
                ) : (
                  row
                );
              })}
            </div>
          </article>

          <section className="module-ref-lanes">
            <article className="module-ref-lane">
              <h3>Relationship graph</h3>
              <div className="module-ref-graph">
                {["Current Goals", "Personal Ops", "Review queue"].map((item) => (
                  <div className="module-ref-graph-node" key={item}>
                    <strong>{item}</strong>
                    <span>Connected</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="module-ref-lane">
              <h3>Recent activity</h3>
              <div className="module-ref-activity-list">
                {["Owner missing flagged", "Goal link refreshed", "Media source attached"].map((item) => (
                  <div className="module-ref-activity" key={item}>
                    <strong>{item}</strong>
                    <span>Today</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="module-ref-lane">
              <h3>Color map</h3>
              <div className="module-ref-field-list">
                {[
                  ["Pink", "Notes and personal objects"],
                  ["Crimson", "Blocked review state"],
                  ["Cyan", "Media and discovery"],
                  ["Brown", "Sources and archives"]
                ].map(([label, value]) => (
                  <div className="module-ref-field" key={label}>
                    <strong>{label}</strong>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>

        <aside className="module-ref-detail">
          <div className="module-ref-detail-title">
            <span className="module-ref-eyebrow module-ref-tone-pink">Selected note</span>
            <h2>{noteRows[0]?.[0] || "Garden planning note"}</h2>
          </div>
          <p>
            The detail view stays in the dashboard shell: properties, relationships, source
            context, review fields, and activity remain visible.
          </p>
          <div className="module-ref-field-list">
            {[
              ["Type", noteRows[0]?.[1] || "Note"],
              ["Category", noteRows[0]?.[2] || "Personal Ops"],
              ["Owner", noteRows[0]?.[3] || "Missing"],
              ["Status", noteRows[0]?.[4] || "Review"],
              ["Review fields", "Visible"],
              ["Source context", "Optional Files"]
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
