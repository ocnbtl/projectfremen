import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import {
  PERSONAL_SYSTEM_DOMAINS,
  PERSONAL_SYSTEM_GUARDRAILS,
  type PersonalSystemDomain,
  type PersonalSystemSensitivity,
  type PersonalSystemStatus
} from "../../../lib/personal-systems";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
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

type NotePreview = Omit<Pick<
  PersonalRecord,
  | "id"
  | "title"
  | "domain"
  | "body"
  | "status"
  | "stage"
  | "className"
  | "updatedAt"
  | "areas"
  | "subjects"
  | "projects"
  | "intents"
  | "externalSources"
>, "id"> & { id?: string };

const DEFAULT_NOTES: NotePreview[] = [
  {
    title: "Personal Ops transfer pass",
    domain: "notes-docs",
    body: "Move the Figma dashboard-native notes workspace into the live app while keeping properties visible.",
    status: "active",
    stage: "processed",
    className: "note",
    updatedAt: new Date().toISOString(),
    areas: ["Personal", "AI"],
    subjects: ["Design", "Technology"],
    projects: ["Project Fremen"],
    intents: ["implement"],
    externalSources: []
  },
  {
    title: "Resources boundary",
    domain: "notes-docs",
    body: "Keep external articles, podcasts, posts, and references in Resources instead of authored Notes.",
    status: "next",
    stage: "processed",
    className: "decision",
    updatedAt: new Date().toISOString(),
    areas: ["Personal"],
    subjects: ["PKM"],
    projects: ["Project Fremen"],
    intents: ["retain"],
    externalSources: ["Figma implementation notes"]
  },
  {
    title: "Finance review guardrail",
    domain: "finance",
    body: "Use manual summaries and review prep until detailed account and transaction rules exist.",
    status: "idea",
    stage: "unprocessed",
    className: "metric",
    updatedAt: new Date().toISOString(),
    areas: ["Finance"],
    subjects: ["Investing"],
    projects: ["Project Fremen"],
    intents: ["research"],
    externalSources: []
  }
];

function labelize(value?: string) {
  return (value || "-")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function domainForNote(note: NotePreview): PersonalSystemDomain | undefined {
  return PERSONAL_SYSTEM_DOMAINS.find((domain) => domain.slug === note.domain);
}

function valueList(values: string[]) {
  return values.length ? values.join(", ") : "-";
}

function noteHref(note: NotePreview) {
  return note.id ? `/admin/personal/records/${note.id}` : `/admin/personal/${note.domain}`;
}

export default async function PersonalOpsPage() {
  await requireAdminSession();

  const records = await readPersonalRecords().catch(() => []);
  const activeCount = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.status === "active").length;
  const sensitiveCount = PERSONAL_SYSTEM_DOMAINS.filter((item) => item.sensitivity === "sensitive").length;
  const noteCards: NotePreview[] = records.length ? records.slice(0, 6) : DEFAULT_NOTES;
  const selectedNote = noteCards[0];
  const selectedDomain = domainForNote(selectedNote);
  const activeProjects = new Set(records.flatMap((record) => record.projects)).size || 3;
  const nextReview = records[0]?.time.nextReview;
  const domainQueue = PERSONAL_SYSTEM_DOMAINS.slice(0, 6);

  return (
    <main className="shell personal-ops-shell admin-chrome-main">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="Personal Ops"
        sidebarSummary="Dashboard-native notes, relationships, review metadata, and source context."
        sidebarItems={[
          { label: "Active projects", value: String(activeProjects) },
          { label: "Goal lanes", value: String(activeCount) },
          { label: "Next review", value: nextReview || "Sunday" }
        ]}
        sidebarActions={[
          { label: "Notes", href: "/admin/personal/notes-docs" },
          { label: "Goals", href: "/admin" },
          { label: "Travel", href: "/admin/personal/travel" },
          { label: "Reviews", href: "/admin/reviews/weekly" },
          { label: "Sources", href: "/admin/resources" }
        ]}
        sidebarChildren={
          <section className="personal-sidebar-card">
            <p>Current Goals</p>
            <strong>Keep active goals visible while notes and reviews expand.</strong>
            <Link href="/admin">Open command center</Link>
            <Link href="/admin/personal/travel">Open Travel</Link>
          </section>
        }
      />

      <header className="ops-header">
        <div>
          <p className="ops-kicker">Personal Ops</p>
          <h1>Personal Ops notes</h1>
          <p>
            Native notes with visible properties, relationships, source context, review cadence,
            and page-specific actions in the left sidebar.
          </p>
        </div>
        <div className="ops-header-search" role="search" aria-label="Search Personal Ops notes">
          <span aria-hidden="true">/</span>
          <input aria-label="Search Personal Ops notes" placeholder="Search notes, people, files, resources" />
          <kbd>cmd k</kbd>
        </div>
      </header>

      <nav className="ops-tabs" aria-label="Personal Ops views">
        <Link href="/admin/personal/notes-docs" className="is-active">Notes</Link>
        <Link href="/admin">Goals</Link>
        <Link href="/admin/reviews/weekly">Reviews</Link>
        <Link href="/admin/resources">Sources</Link>
      </nav>

      <section className="ops-stats" aria-label="Personal Ops metrics">
        <article>
          <span>Notes</span>
          <strong>{records.length}</strong>
          <p>Saved in the protected native workspace</p>
        </article>
        <article>
          <span>Domains</span>
          <strong>{PERSONAL_SYSTEM_DOMAINS.length}</strong>
          <p>{activeCount} active, {sensitiveCount} sensitive</p>
        </article>
        <article>
          <span>Relationships</span>
          <strong>{records.reduce((count, record) => count + record.relations.related.length, 0)}</strong>
          <p>Note links, people context, and sources</p>
        </article>
      </section>

      <section className="ops-workspace" aria-label="Personal Ops note workspace">
        <div className="ops-note-list">
          <div className="ops-section-title">
            <h2>Note queue</h2>
            <Link href="/admin/personal/notes-docs">Create note</Link>
          </div>
          {noteCards.map((note) => {
            const domain = domainForNote(note);
            return (
              <Link className="ops-note-card" href={noteHref(note)} key={note.id || `${note.domain}-${note.title}`}>
                <div>
                  <span className={`ops-status ops-status-${note.status}`}>{labelize(note.status)}</span>
                  <span className="ops-domain">{domain?.shortLabel || labelize(note.domain)}</span>
                </div>
                <h3>{note.title}</h3>
                <p>{note.body || "No body text yet."}</p>
                <footer>
                  <span>{labelize(note.className)}</span>
                  <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                </footer>
              </Link>
            );
          })}
        </div>

        <article className="ops-detail-panel">
          <div className="ops-section-title">
            <h2>Selected note</h2>
            <Link href={noteHref(selectedNote)}>Open</Link>
          </div>
          <p className="ops-detail-eyebrow">{selectedDomain?.label || labelize(selectedNote.domain)}</p>
          <h3>{selectedNote.title}</h3>
          <p>{selectedNote.body || "No body text yet."}</p>
          <div className="ops-chip-row">
            {[...selectedNote.areas, ...selectedNote.subjects].slice(0, 6).map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
          <div className="ops-activity">
            <h4>Activity</h4>
            <div>
              <strong>Review metadata visible</strong>
              <span>Properties stay available while creating and viewing notes.</span>
            </div>
            <div>
              <strong>Resources separated</strong>
              <span>Files and external references are linked without becoming the note itself.</span>
            </div>
          </div>
        </article>

        <aside className="ops-property-rail">
          <section className="ops-ai-card">
            <p>Local AI</p>
            <h2>Ask about this note</h2>
            <span>The persistent dock can read visible page context and call localhost-only models.</span>
          </section>

          <section className="ops-property-card">
            <h2>Review metadata</h2>
            <div className="ops-property-group">
              <h3>Identity</h3>
              <dl>
                <div><dt>Domain</dt><dd>{selectedDomain?.label || labelize(selectedNote.domain)}</dd></div>
                <div><dt>Class</dt><dd>{labelize(selectedNote.className)}</dd></div>
                <div><dt>Projects</dt><dd>{valueList(selectedNote.projects)}</dd></div>
              </dl>
            </div>
            <div className="ops-property-group">
              <h3>Status</h3>
              <dl>
                <div><dt>Status</dt><dd>{labelize(selectedNote.status)}</dd></div>
                <div><dt>Stage</dt><dd>{labelize(selectedNote.stage)}</dd></div>
                <div><dt>Intent</dt><dd>{valueList(selectedNote.intents)}</dd></div>
              </dl>
            </div>
            <div className="ops-property-group">
              <h3>Relationships</h3>
              <dl>
                <div><dt>Areas</dt><dd>{valueList(selectedNote.areas)}</dd></div>
                <div><dt>Subjects</dt><dd>{valueList(selectedNote.subjects)}</dd></div>
                <div><dt>Sources</dt><dd>{valueList(selectedNote.externalSources)}</dd></div>
              </dl>
            </div>
          </section>

          <section className="ops-domain-health">
            <div className="ops-section-title">
              <h2>Domain health</h2>
              <Link href="/admin/personal/notes-docs">All</Link>
            </div>
            {domainQueue.map((domain) => (
              <Link href={`/admin/personal/${domain.slug}`} key={domain.slug}>
                <span className={`personal-status personal-status-${domain.status}`}>{STATUS_LABELS[domain.status]}</span>
                <strong>{domain.label}</strong>
                <small>{SENSITIVITY_LABELS[domain.sensitivity]}</small>
              </Link>
            ))}
          </section>

          <section className="ops-property-card">
            <h2>Architecture Guardrails</h2>
            <ul className="ops-guardrail-list">
              {PERSONAL_SYSTEM_GUARDRAILS.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="ops-property-card">
            <h2>Native Database</h2>
            <p className="ops-property-note">
              Notes save through the authenticated Personal Ops persistence layer while the UI keeps
              authored Notes, uploaded Files, and external Resources distinct.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
