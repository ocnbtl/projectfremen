import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  await requireAdminSession();
  const records = await readPersonalRecords().catch(() => []);
  const people = records.filter((record) => record.className === "person" || record.className === "org");

  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="People"
        sidebarSummary="Personal CRM shell for people, organizations, reminders, and relationship context."
        sidebarItems={[
          { label: "People/org notes", value: String(people.length) },
          { label: "Privacy", value: "Minimized" }
        ]}
        sidebarActions={[
          { label: "Family Domain", href: "/admin/personal/family" },
          { label: "Create Person Note", href: "/admin/personal/notes-docs" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>People</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            A future CRM module for people in your life, with relationship notes and reminders.
          </p>
        </div>
        <Link href="/admin/personal/family" className="review-back-link">
          Family Domain
        </Link>
      </header>

      <section className="card">
        <h2>CRM Starting Point</h2>
        <p className="muted">
          People and organization notes already work through the note class system. The next
          slice can add profile views, reminders, important dates, and relationship timelines.
        </p>
      </section>
    </main>
  );
}
