import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import PersonalViewportToggle from "../../../components/PersonalViewportToggle";
import {
  PERSONAL_SYSTEM_DOMAINS,
  PERSONAL_SYSTEM_GUARDRAILS,
  type PersonalSystemSensitivity,
  type PersonalSystemStatus
} from "../../../lib/personal-systems";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const SENSITIVITY_LABELS: Record<PersonalSystemSensitivity, string> = {
  reference: "Reference",
  private: "Private",
  sensitive: "Sensitive"
};

const STATUS_LABELS: Record<PersonalSystemStatus, string> = {
  active: "Active",
  designing: "Designing",
  guarded: "Guarded"
};

export default async function PersonalOpsPage() {
  await requireAdminSession();

  const records = await readPersonalRecords().catch(() => []);
  const sensitiveCount = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.sensitivity === "sensitive").length;
  const activeCount = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.status === "active").length;
  const nextDomains = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.status === "active").slice(0, 3);

  return (
    <main className="shell personal-ops-shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Personal Ops"
        sidebarSummary="Native life-system database, separate from the project command center."
        sidebarItems={[
          { label: "Domains", value: String(PERSONAL_SYSTEM_DOMAINS.length) },
          { label: "Sensitive", value: String(sensitiveCount) },
          { label: "Saved notes", value: String(records.length) }
        ]}
        sidebarActions={[
          { label: "Notes", href: "/admin/personal/notes-docs" },
          { label: "People", href: "/admin/people" },
          { label: "Travel", href: "/admin/personal/travel" }
        ]}
      />
      <PersonalViewportToggle />
      <header className="topbar">
        <div>
          <p className="muted personal-ops-kicker">Founder system</p>
          <h1 style={{ margin: 0 }}>Personal Ops</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            A protected, dashboard-native database for daily systems, kept separate from the
            project command center.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Home
        </Link>
      </header>

      <section className="personal-ops-command">
        <div>
          <p className="personal-domain-eyebrow">Current build posture</p>
          <h2>Notes first, then specialize the modules around real data.</h2>
          <p>
            Personal Ops now saves native notes in Unigentamos. A note can belong to one
            domain, overlap with others, carry file references, and become the input for
            future custom views.
          </p>
        </div>
        <div className="personal-command-actions">
          <Link href="/admin/personal/travel">Open Travel</Link>
          <Link href="/admin/personal/notes-docs">Open Notes</Link>
        </div>
      </section>

      <section className="grid grid-3">
        <article className="card personal-ops-stat">
          <p className="muted" style={{ margin: 0 }}>Domains mapped</p>
          <h3>{PERSONAL_SYSTEM_DOMAINS.length}</h3>
        </article>
        <article className="card personal-ops-stat">
          <p className="muted" style={{ margin: 0 }}>Sensitive domains</p>
          <h3>{sensitiveCount}</h3>
        </article>
        <article className="card personal-ops-stat">
          <p className="muted" style={{ margin: 0 }}>Saved notes</p>
          <h3>{records.length}</h3>
        </article>
      </section>

      <section className="personal-ops-layout">
        <div className="personal-ops-main">
          <section className="personal-domain-panel">
            <div className="personal-ops-section-heading">
              <h2>Domain Map</h2>
              <span>{activeCount} active</span>
            </div>
            <div className="personal-domain-grid">
              {PERSONAL_SYSTEM_DOMAINS.map((domain) => (
                <article className="personal-domain-card" key={domain.slug}>
                  <div className="personal-domain-card-header">
                    <h3>{domain.label}</h3>
                    <div className="personal-domain-badges">
                      <span className={`personal-sensitivity personal-sensitivity-${domain.sensitivity}`}>
                        {SENSITIVITY_LABELS[domain.sensitivity]}
                      </span>
                      <span className={`personal-status personal-status-${domain.status}`}>
                        {STATUS_LABELS[domain.status]}
                      </span>
                    </div>
                  </div>
                  <p>{domain.summary}</p>
                  <dl>
                    <div>
                      <dt>Database</dt>
                      <dd>{domain.systemStatus}</dd>
                    </div>
                    <div>
                      <dt>Next</dt>
                      <dd>{domain.nextStep}</dd>
                    </div>
                  </dl>
                  <Link href={`/admin/personal/${domain.slug}`} className="personal-domain-open">
                    Open domain
                  </Link>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="personal-ops-side">
          <section className="card">
            <h2>Architecture Guardrails</h2>
            <ul className="personal-guardrail-list">
              {PERSONAL_SYSTEM_GUARDRAILS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Next Useful Modules</h2>
            <div className="personal-next-list">
              {nextDomains.map((domain) => (
                <Link href={`/admin/personal/${domain.slug}`} key={domain.slug}>
                  <strong>{domain.label}</strong>
                  <span>{domain.nextStep}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Native Database</h2>
            <p className="muted">
              Personal Ops notes are saved through the same authenticated app persistence layer as KPIs,
              reviews, and Current Goals. No Obsidian import/export path is required.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
