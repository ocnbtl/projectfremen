import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  await requireAdminSession();
  const records = await readPersonalRecords().catch(() => []);
  const notes = records.filter((record) => record.domain === "notes-docs");

  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Notes"
        sidebarSummary="Vault-style note navigation without folder lock-in."
        sidebarItems={[
          { label: "Native notes", value: String(notes.length) },
          { label: "All records", value: String(records.length) }
        ]}
        sidebarActions={[
          { label: "Record Note", href: "/admin/personal/notes-docs" },
          { label: "Personal Ops", href: "/admin/personal" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Notes</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Native vault, daily-note, and reference navigation for Unigentamos.
          </p>
        </div>
        <Link href="/admin/personal/notes-docs" className="review-back-link">
          Record Note
        </Link>
      </header>

      <section className="card">
        <h2>Vault</h2>
        {notes.length === 0 ? (
          <p className="muted">No native notes recorded yet.</p>
        ) : (
          <div className="admin-hub-list">
            {notes.slice(0, 12).map((record) => (
              <Link href={`/admin/personal/records/${record.id}`} key={record.id}>
                <strong>{record.title}</strong>
                <span>{record.createdMeta.created}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
