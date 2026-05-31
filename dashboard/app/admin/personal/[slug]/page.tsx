import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPersonalSystemDomain,
  PERSONAL_SYSTEM_DOMAINS,
  type PersonalSystemSensitivity,
  type PersonalSystemStatus
} from "../../../../lib/personal-systems";
import { requireAdminSession } from "../../../../lib/require-admin";

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

const SOURCE_STATUS_LABELS = {
  candidate: "Candidate",
  "needs-inventory": "Needs inventory",
  blocked: "Blocked"
};

export default async function PersonalDomainPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdminSession();
  const { slug } = await params;
  const domain = getPersonalSystemDomain(slug);

  if (!domain) {
    notFound();
  }

  return (
    <main className="shell personal-ops-shell">
      <header className="topbar personal-domain-topbar">
        <div>
          <p className="muted personal-ops-kicker">Personal Ops domain</p>
          <h1 style={{ margin: 0 }}>{domain.label}</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {domain.summary}
          </p>
        </div>
        <Link href="/admin/personal" className="review-back-link">
          Back to Personal Ops
        </Link>
      </header>

      <section className="personal-domain-hero">
        <div>
          <p className="personal-domain-eyebrow">Operating surface</p>
          <h2>{domain.operatingView}</h2>
        </div>
        <div className="personal-domain-status-stack">
          <span className={`personal-sensitivity personal-sensitivity-${domain.sensitivity}`}>
            {SENSITIVITY_LABELS[domain.sensitivity]}
          </span>
          <span className={`personal-status personal-status-${domain.status}`}>
            {STATUS_LABELS[domain.status]}
          </span>
        </div>
      </section>

      <section className="grid grid-3 personal-domain-stat-grid">
        <article className="personal-metric">
          <p>Workflows</p>
          <strong>{domain.workflows.length}</strong>
        </article>
        <article className="personal-metric">
          <p>Sources</p>
          <strong>{domain.sources.length}</strong>
        </article>
        <article className="personal-metric">
          <p>Ingestion</p>
          <strong>0</strong>
        </article>
      </section>

      <section className="personal-domain-detail-layout">
        <div className="personal-domain-detail-main">
          <section className="personal-panel">
            <div className="personal-ops-section-heading">
              <h2>Workflow Lanes</h2>
              <span>Design target</span>
            </div>
            <div className="personal-lane-list">
              {domain.workflows.map((workflow, index) => (
                <article className="personal-lane" key={workflow}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{workflow}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="personal-panel">
            <div className="personal-ops-section-heading">
              <h2>Source Inventory</h2>
              <span>Read-only plan</span>
            </div>
            <div className="personal-source-list">
              {domain.sources.map((source) => (
                <article className="personal-source-row" key={source.label}>
                  <div>
                    <h3>{source.label}</h3>
                    <p>{source.detail}</p>
                  </div>
                  <span className={`personal-source-status personal-source-status-${source.status}`}>
                    {SOURCE_STATUS_LABELS[source.status]}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="personal-domain-detail-side">
          <section className="personal-panel">
            <h2>Next Build Step</h2>
            <p>{domain.nextStep}</p>
          </section>

          <section className="personal-panel personal-privacy-panel">
            <h2>Privacy Boundary</h2>
            <p>{domain.privacyBoundary}</p>
          </section>

          <section className="personal-panel">
            <h2>Blocked Until</h2>
            <p>{domain.blockedUntil}</p>
          </section>
        </aside>
      </section>

      <section className="personal-domain-switcher" aria-label="Personal Ops domains">
        {PERSONAL_SYSTEM_DOMAINS.map((item) => (
          <Link
            href={`/admin/personal/${item.slug}`}
            className={item.slug === domain.slug ? "is-active" : ""}
            key={item.slug}
          >
            {item.shortLabel}
          </Link>
        ))}
      </section>
    </main>
  );
}
