import Link from "next/link";
import {
  PERSONAL_SYSTEM_DOMAINS,
  PERSONAL_SYSTEM_GUARDRAILS,
  type PersonalSystemSensitivity,
  type PersonalSystemStatus
} from "../../../lib/personal-systems";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const SENSITIVITY_LABELS: Record<PersonalSystemSensitivity, string> = {
  reference: "Reference",
  private: "Private",
  sensitive: "Sensitive"
};

const STATUS_LABELS: Record<PersonalSystemStatus, string> = {
  inventory: "Inventory",
  planned: "Planned",
  blocked: "Blocked"
};

export default async function PersonalOpsPage() {
  await requireAdminSession();

  const sensitiveCount = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.sensitivity === "sensitive").length;
  const plannedCount = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.status === "planned").length;
  const nextDomains = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.status !== "blocked").slice(0, 3);

  return (
    <main className="shell personal-ops-shell">
      <header className="topbar">
        <div>
          <p className="muted personal-ops-kicker">Founder system</p>
          <h1 style={{ margin: 0 }}>Personal Ops</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            A protected planning layer for Obsidian-linked daily systems, kept separate from the
            current project command center.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Home
        </Link>
      </header>

      <section className="personal-ops-command">
        <div>
          <p className="personal-domain-eyebrow">Current build posture</p>
          <h2>Inventory first, then activate the lowest-risk modules.</h2>
          <p>
            Travel, notes/docs, and university archives can become useful without account-level
            integrations. Finance and family stay blocked until privacy and storage rules are explicit.
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
          <p className="muted" style={{ margin: 0 }}>Planned modules</p>
          <h3>{plannedCount}</h3>
        </article>
      </section>

      <section className="personal-ops-layout">
        <div className="personal-ops-main">
          <section className="personal-domain-panel">
            <div className="personal-ops-section-heading">
              <h2>Domain Map</h2>
              <span>First slice</span>
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
                      <dt>Source</dt>
                      <dd>{domain.sourceStatus}</dd>
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
            <h2>Obsidian Source Inventory</h2>
            <p className="muted">
              Vault folders, sync direction, and export ownership are intentionally unconfirmed here.
              The next step is inventory, not broad ingestion.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
