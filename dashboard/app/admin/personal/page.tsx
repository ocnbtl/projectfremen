import Link from "next/link";
import {
  PERSONAL_SYSTEM_DOMAINS,
  PERSONAL_SYSTEM_GUARDRAILS
} from "../../../lib/personal-systems";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const SENSITIVITY_LABELS = {
  reference: "Reference",
  private: "Private",
  sensitive: "Sensitive"
};

export default async function PersonalOpsPage() {
  await requireAdminSession();

  const sensitiveCount = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.sensitivity === "sensitive").length;

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
          <p className="muted" style={{ margin: 0 }}>Data ingestion</p>
          <h3>0</h3>
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
                    <span className={`personal-sensitivity personal-sensitivity-${domain.sensitivity}`}>
                      {SENSITIVITY_LABELS[domain.sensitivity]}
                    </span>
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
