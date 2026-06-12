import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const cadenceRows = [
  ["Maya Chen", "Apr 12", "Jun 12", "Every 2 months", "crimson"],
  ["Ari Patel", "May 20", "Jun 03", "Every 2 weeks", "orange"],
  ["Jordan Lee", "May 30", "Jul 01", "Monthly", "green"]
];

const contactGroups = [
  ["Ocean", "Primary owner"],
  ["Maya", "Check in"],
  ["Ari", "Design feedback"],
  ["Sam", "Waiting reply"]
];

export default async function PeoplePage() {
  await requireAdminSession();
  const records = await readPersonalRecords().catch(() => []);
  const people = records.filter((record) => record.className === "person" || record.className === "org");

  return (
    <main className="shell admin-chrome-main module-ref-shell people-module-shell">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="People"
        sidebarSummary="Contacts, cadence, follow-ups, relationships, and profile context."
        sidebarItems={[
          { label: "Due", value: "6" },
          { label: "This week", value: "12" },
          { label: "Strong ties", value: "18" },
          { label: "Dormant", value: "9" },
          { label: "Native people/org notes", value: String(people.length) }
        ]}
        sidebarActions={[
          { label: "Contact cadence", href: "/admin/people" },
          { label: "People list", href: "/admin/people" },
          { label: "Relationship map", href: "/admin/personal/family" },
          { label: "Birthdays & dates", href: "/admin/people" },
          { label: "Family Domain", href: "/admin/personal/family" },
          { label: "Create Person Note", href: "/admin/personal/notes-docs" }
        ]}
      />
      <header className="module-ref-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-pink">People</p>
          <h1>People and contact cadence</h1>
          <p>
            A practical CRM workspace: who to reach out to, when you last talked, and what is
            connected to them.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search people" placeholder="Search notes, files, people, reviews" />
          <kbd>people</kbd>
        </label>
      </header>

      <section className="module-ref-content">
        <div className="module-ref-main">
          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Contact cadence</h2>
              <span className="module-ref-regression-sentinel">CRM Starting Point</span>
            </div>
            <div className="module-ref-row-list">
              {cadenceRows.map(([name, last, next, cadence, tone]) => (
                <div className={`module-ref-row module-ref-tone-${tone}`} key={name}>
                  <strong>{name}</strong>
                  <span>Last talked {last}</span>
                  <span>Next {next}</span>
                  <span>{cadence}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Contacts</h2>
              <Link href="/admin/personal/family" className="review-back-link">
                Family Domain
              </Link>
            </div>
            <div className="module-ref-chip-row">
              <span className="module-ref-tone-pink">Family</span>
              <span className="module-ref-tone-blue">Collaborators</span>
              <span className="module-ref-tone-green">Friends</span>
              <span className="module-ref-tone-orange">Vendors</span>
            </div>
            <div className="module-ref-list">
              {contactGroups.map(([name, state], index) => (
                <div
                  className={`module-ref-list-item module-ref-tone-${["pink", "blue", "green", "orange"][index]}`}
                  key={name}
                >
                  <div>
                    <strong>{name}</strong>
                    <span>{state}</span>
                  </div>
                  <span>Open profile</span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="module-ref-detail">
          <div className="module-ref-detail-title">
            <span className="module-ref-eyebrow module-ref-tone-pink">Selected person</span>
            <h2>Maya Chen</h2>
          </div>
          <p>
            Contact info, cadence, relationship notes, files, connected projects, and follow-up
            history stay in one dashboard-native profile.
          </p>
          <div className="module-ref-field-grid">
            {[
              ["Last talked", "Apr 12"],
              ["Next contact", "Jun 12"],
              ["Cadence", "Every 2 months"],
              ["Relationship", "Design collaborator"],
              ["Open follow-ups", "2"],
              ["Connected notes", "14"]
            ].map(([label, value]) => (
              <div className="module-ref-field" key={label}>
                <strong>{label}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
          <div className="module-ref-list">
            {["Sent portfolio draft", "Mentioned July travel", "Waiting on feedback"].map((item) => (
              <div className="module-ref-list-item module-ref-tone-blue" key={item}>
                <div>
                  <strong>{item}</strong>
                  <span>Recent note</span>
                </div>
                <span>View</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
