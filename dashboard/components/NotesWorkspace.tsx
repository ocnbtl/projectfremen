"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import type { PersonalRecord, PersonalRecordStatus } from "../lib/personal-records-store";

type RecordsResponse = {
  ok: boolean;
  items?: PersonalRecord[];
  error?: string;
};

type NotesWorkspaceProps = {
  initialNotes: PersonalRecord[];
  totalRecords: number;
};

type NoteFilter = "all" | "review" | "active" | "sources" | "media" | "missing-owner";

const STATUS_LABELS: Record<PersonalRecordStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  blocked: "Blocked",
  inactive: "Inactive",
  next: "Next"
};

const STATUS_OPTIONS: PersonalRecordStatus[] = [
  "idea",
  "draft",
  "active",
  "next",
  "blocked",
  "completed",
  "inactive"
];

const FILTERS: Array<{ id: NoteFilter; label: string; tone: string }> = [
  { id: "all", label: "All", tone: "pink" },
  { id: "review", label: "Needs review", tone: "crimson" },
  { id: "active", label: "Active", tone: "green" },
  { id: "sources", label: "Sources", tone: "brown" },
  { id: "media", label: "Media", tone: "cyan" },
  { id: "missing-owner", label: "Missing owner", tone: "blue" }
];

const STARTER_PROMPTS = [
  "Capture a decision and connect it to an active goal.",
  "Save a source URL with the note that explains why it matters.",
  "Add review cadence for anything that should resurface later."
];

function labelize(value: string) {
  if (!value) {
    return "None";
  }
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNoteTone(record: PersonalRecord) {
  if (record.status === "blocked") return "crimson";
  if (record.status === "active" || record.status === "completed") return "green";
  if (record.className === "file") return "cyan";
  if (record.externalSources.length > 0 || record.url) return "brown";
  if (record.status === "next") return "blue";
  if (record.status === "draft") return "purple";
  return "pink";
}

function hasReviewDue(record: PersonalRecord) {
  if (!record.time.nextReview) {
    return record.status === "idea" || record.status === "draft" || record.status === "blocked";
  }
  const reviewDate = new Date(record.time.nextReview);
  if (Number.isNaN(reviewDate.getTime())) {
    return false;
  }
  return reviewDate.getTime() <= Date.now() + 1000 * 60 * 60 * 24 * 7;
}

function matchesFilter(record: PersonalRecord, filter: NoteFilter) {
  if (filter === "all") return true;
  if (filter === "review") return hasReviewDue(record);
  if (filter === "active") return record.status === "active" || record.status === "next";
  if (filter === "sources") return record.externalSources.length > 0 || Boolean(record.url);
  if (filter === "media") return record.className === "file" || record.subjects.some((item) => /media|image|screenshot/i.test(item));
  if (filter === "missing-owner") return record.privacy === "private" && record.relations.stakeholders.length === 0;
  return true;
}

function getSearchText(record: PersonalRecord) {
  return [
    record.title,
    record.body,
    record.className,
    record.status,
    record.growth,
    record.areas.join(" "),
    record.subjects.join(" "),
    record.projects.join(" "),
    record.intents.join(" "),
    record.externalSources.join(" "),
    record.url || ""
  ]
    .join(" ")
    .toLowerCase();
}

function displayList(values: string[], fallback = "-") {
  return values.length > 0 ? values.join(", ") : fallback;
}

export default function NotesWorkspace({ initialNotes, totalRecords }: NotesWorkspaceProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<NoteFilter>("all");
  const [selectedId, setSelectedId] = useState(initialNotes[0]?.id || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<PersonalRecordStatus>("idea");
  const [projectText, setProjectText] = useState("");
  const [areaText, setAreaText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [reviewCadence, setReviewCadence] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return notes.filter((record) => {
      if (!matchesFilter(record, activeFilter)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return getSearchText(record).includes(normalizedQuery);
    });
  }, [activeFilter, notes, query]);

  const selectedNote = useMemo(() => {
    return notes.find((record) => record.id === selectedId) || visibleNotes[0] || notes[0];
  }, [notes, selectedId, visibleNotes]);

  const stats = useMemo(() => {
    return {
      total: notes.length,
      review: notes.filter(hasReviewDue).length,
      sources: notes.filter((record) => record.externalSources.length > 0 || record.url).length,
      linkedGoals: notes.filter((record) => record.projects.length > 0 || record.relations.north.length > 0).length
    };
  }, [notes]);

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/personal/records", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({
        domain: "notes-docs",
        title,
        className: "note",
        status,
        body,
        privacy: "private",
        stage: "processed",
        projects: splitList(projectText),
        areas: splitList(areaText),
        url: sourceUrl,
        externalSources: sourceUrl ? [sourceUrl] : [],
        time: {
          reviewCadence
        }
      })
    });

    const payload = (await response
      .json()
      .catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;

    if (!response.ok || !payload.ok || !payload.items) {
      setError(payload.error || "Failed to save note");
      setSaving(false);
      return;
    }

    const nextNotes = payload.items.filter((record) => record.domain === "notes-docs");
    setNotes(nextNotes);
    setSelectedId(nextNotes[0]?.id || "");
    setTitle("");
    setBody("");
    setStatus("idea");
    setProjectText("");
    setAreaText("");
    setSourceUrl("");
    setReviewCadence("");
    setSaving(false);
  }

  async function patchNote(id: string, patch: { status?: PersonalRecordStatus; action?: "review" }) {
    setError("");
    const response = await fetch("/api/personal/records", {
      method: "PATCH",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ id, ...patch })
    });

    const payload = (await response
      .json()
      .catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;

    if (!response.ok || !payload.ok || !payload.items) {
      setError(payload.error || "Failed to update note");
      return;
    }

    const nextNotes = payload.items.filter((record) => record.domain === "notes-docs");
    setNotes(nextNotes);
    setSelectedId(id);
  }

  return (
    <>
      <header className="module-ref-header notes-workspace-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-pink">Notes</p>
          <h1>Note workspace</h1>
          <p>
            Capture, filter, review, and connect dashboard-native notes without leaving the admin
            shell or hiding the useful properties.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input
            aria-label="Search notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes, goals, modules"
          />
          <kbd>{visibleNotes.length}</kbd>
        </label>
      </header>

      <section className="notes-operating-strip" aria-label="Notes overview">
        {[
          ["Notes", String(stats.total), "pink"],
          ["Needs review", String(stats.review), "crimson"],
          ["Linked goals", String(stats.linkedGoals), "green"],
          ["Sources", String(stats.sources), "brown"]
        ].map(([label, value, tone]) => (
          <article className={`module-ref-stat module-ref-tone-${tone}`} key={label}>
            <span className="module-ref-dot" />
            <strong>{value}</strong>
            <p>{label}</p>
          </article>
        ))}
      </section>

      <section className="module-ref-content notes-workspace-content">
        <div className="module-ref-main">
          <article className="module-ref-panel notes-list-panel">
            <div className="module-ref-section-title">
              <h2>Active notes</h2>
              <Link href="/admin/personal/notes-docs" className="review-back-link">
                Advanced create
              </Link>
            </div>
            <div className="module-ref-chip-row notes-filter-row" role="list" aria-label="Note filters">
              <span className="module-ref-regression-sentinel">Vault</span>
              {FILTERS.map((filter) => (
                <button
                  type="button"
                  className={`module-ref-pill module-ref-tone-${filter.tone}${activeFilter === filter.id ? " is-active" : ""}`}
                  onClick={() => setActiveFilter(filter.id)}
                  key={filter.id}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {visibleNotes.length > 0 ? (
              <div className="module-ref-table notes-data-table">
                {visibleNotes.map((record) => (
                  <button
                    type="button"
                    className={`module-ref-table-row module-ref-tone-${getNoteTone(record)}${selectedNote?.id === record.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(record.id)}
                    key={record.id}
                  >
                    <strong>{record.title}</strong>
                    <span>{labelize(record.className)}</span>
                    <span>{record.projects[0] || record.areas[0] || "Personal Ops"}</span>
                    <span>{record.privacy === "private" ? "Ocean" : "Shared"}</span>
                    <span>{STATUS_LABELS[record.status]}</span>
                    <span>{formatDate(record.updatedAt)}</span>
                    <span className="module-ref-open-button">Select</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="notes-empty-state">
                <h3>No notes match this view</h3>
                <p>Adjust the search or capture the first note for this lane.</p>
              </div>
            )}
          </article>

          <section className="notes-lower-grid">
            <article className="module-ref-lane">
              <h3>Quick capture</h3>
              <form className="notes-capture-form" onSubmit={submitNote}>
                <label>
                  Title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Decision, idea, source, or working note"
                    required
                  />
                </label>
                <label>
                  Body
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Capture the useful context and the next action."
                    rows={5}
                  />
                </label>
                <div className="notes-capture-grid">
                  <label>
                    Status
                    <select value={status} onChange={(event) => setStatus(event.target.value as PersonalRecordStatus)}>
                      {STATUS_OPTIONS.map((option) => (
                        <option value={option} key={option}>
                          {STATUS_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review
                    <input value={reviewCadence} onChange={(event) => setReviewCadence(event.target.value)} placeholder="P1W" />
                  </label>
                </div>
                <div className="notes-capture-grid">
                  <label>
                    Projects
                    <input value={projectText} onChange={(event) => setProjectText(event.target.value)} placeholder="Project Fremen" />
                  </label>
                  <label>
                    Areas
                    <input value={areaText} onChange={(event) => setAreaText(event.target.value)} placeholder="AI, Personal" />
                  </label>
                </div>
                <label>
                  Source URL
                  <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
                </label>
                {error && <p className="personal-record-error">{error}</p>}
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Note"}
                </button>
              </form>
            </article>

            <article className="module-ref-lane">
              <h3>Operating prompts</h3>
              <div className="module-ref-activity-list">
                {STARTER_PROMPTS.map((item) => (
                  <div className="module-ref-activity" key={item}>
                    <strong>{item}</strong>
                    <span>Suggested workflow</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>

        <aside className="module-ref-rail-stack">
          <section className="module-ref-detail">
            <div className="module-ref-detail-title">
              <span className="module-ref-eyebrow module-ref-tone-pink">Selected note</span>
              <h2>{selectedNote?.title || "No note selected"}</h2>
            </div>
            {selectedNote ? (
              <>
                <p>{selectedNote.body || "No body content recorded yet."}</p>
                <div className="module-ref-field-grid">
                  {[
                    ["Type", labelize(selectedNote.className)],
                    ["Status", STATUS_LABELS[selectedNote.status]],
                    ["Growth", labelize(selectedNote.growth)],
                    ["Updated", formatDate(selectedNote.updatedAt)]
                  ].map(([label, value]) => (
                    <div className="module-ref-field" key={label}>
                      <strong>{label}</strong>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="module-ref-review-card">
                  <h3>Review and relationships</h3>
                  <div className="module-ref-field-list">
                    {[
                      ["Next review", selectedNote.time.nextReview || "Unset"],
                      ["Last review", selectedNote.time.lastReview ? formatDate(selectedNote.time.lastReview) : "Unset"],
                      ["Projects", displayList(selectedNote.projects)],
                      ["Sources", displayList(selectedNote.externalSources, selectedNote.url || "-")]
                    ].map(([label, value]) => (
                      <div className="module-ref-field" key={label}>
                        <strong>{label}</strong>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="notes-detail-actions">
                  <button type="button" onClick={() => patchNote(selectedNote.id, { action: "review" })}>
                    Mark reviewed
                  </button>
                  <button type="button" onClick={() => patchNote(selectedNote.id, { status: "active" })}>
                    Set active
                  </button>
                  <button type="button" onClick={() => patchNote(selectedNote.id, { status: "completed" })}>
                    Complete
                  </button>
                  <Link href={`/admin/personal/records/${selectedNote.id}`}>Open full note</Link>
                </div>
              </>
            ) : (
              <p>Capture a note or change filters to populate the detail rail.</p>
            )}
          </section>

          <section className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>System context</h2>
              <span>{totalRecords}</span>
            </div>
            <div className="module-ref-field-list">
              {[
                ["Model", "Notes are stored through existing records API"],
                ["Boundary", "CSRF-protected admin session"],
                ["Files", "Use source URL/reference until upload flow lands"],
                ["Resources", "External material stays separate from authored notes"]
              ].map(([label, value]) => (
                <div className="module-ref-field" key={label}>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}
