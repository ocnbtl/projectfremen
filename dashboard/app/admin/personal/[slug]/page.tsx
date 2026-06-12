import Link from "next/link";
import { notFound } from "next/navigation";
import AdminChrome from "../../../../components/AdminChrome";
import PersonalRecordsPanel from "../../../../components/PersonalRecordsPanel";
import {
  getPersonalSystemDomain,
  PERSONAL_SYSTEM_DOMAINS,
  type PersonalSystemSensitivity,
  type PersonalSystemStatus
} from "../../../../lib/personal-systems";
import { getRecordsForDomain, readPersonalRecords } from "../../../../lib/personal-records-store";
import { requireAdminSession } from "../../../../lib/require-admin";

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

const FIELD_STATUS_LABELS = {
  ready: "Ready",
  planned: "Planned",
  guarded: "Guarded"
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

  const allRecords = await readPersonalRecords().catch(() => []);
  const domainRecords = getRecordsForDomain(allRecords, domain.slug);

  return (
    <main className="shell personal-ops-shell admin-chrome-main">
      <AdminChrome
        sidebarTitle={domain.shortLabel}
        sidebarSummary={domain.nextStep}
        sidebarItems={[
          { label: "Workflows", value: String(domain.workflows.length) },
          { label: "Fields", value: String(domain.fields.length) },
          { label: "Notes", value: String(domainRecords.length) },
          { label: "Status", value: STATUS_LABELS[domain.status] }
        ]}
        sidebarActions={[
          { label: "All Personal Ops", href: "/admin/personal" },
          { label: "Notes", href: "/admin/personal/notes-docs" },
          { label: "Reviews", href: "/admin/reviews/weekly" }
        ]}
      />
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
          <p>Fields</p>
          <strong>{domain.fields.length}</strong>
        </article>
        <article className="personal-metric">
          <p>Notes</p>
          <strong>{domainRecords.length}</strong>
        </article>
      </section>

      <PersonalRecordsPanel
        domain={domain}
        domains={PERSONAL_SYSTEM_DOMAINS}
        initialRecords={allRecords}
      />

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
              <h2>Database Fields</h2>
              <span>Native model</span>
            </div>
            <div className="personal-source-list">
              {domain.fields.map((field) => (
                <article className="personal-source-row" key={field.label}>
                  <div>
                    <h3>{field.label}</h3>
                    <p>{field.detail}</p>
                  </div>
                  <span className={`personal-source-status personal-source-status-${field.status}`}>
                    {FIELD_STATUS_LABELS[field.status]}
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
            <h2>Data Boundary</h2>
            <p>{domain.dataBoundary}</p>
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
