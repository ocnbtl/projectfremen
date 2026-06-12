"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import type {
  PersonalRecord,
  PersonalRecordClass,
  PersonalRecordStatus
} from "../lib/personal-records-store";

type RecordsResponse = {
  ok: boolean;
  items?: PersonalRecord[];
  error?: string;
};

type PeopleWorkspaceProps = {
  initialPeople: PersonalRecord[];
  totalRecords: number;
};

type PeopleFilter = "all" | "due" | "week" | "active" | "dormant" | "orgs";

const STATUS_LABELS: Record<PersonalRecordStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  blocked: "Blocked",
  inactive: "Inactive",
  next: "Next"
};

const FILTERS: Array<{ id: PeopleFilter; label: string; tone: string }> = [
  { id: "all", label: "All", tone: "pink" },
  { id: "due", label: "Due", tone: "crimson" },
  { id: "week", label: "This week", tone: "orange" },
  { id: "active", label: "Active ties", tone: "green" },
  { id: "dormant", label: "Dormant", tone: "brown" },
  { id: "orgs", label: "Orgs", tone: "blue" }
];

const GROUP_OPTIONS = ["Family", "Collaborator", "Friend", "Vendor", "Advisor", "Community"];
const CADENCE_OPTIONS = [
  { label: "Weekly", value: "P1W" },
  { label: "Every 2 weeks", value: "P2W" },
  { label: "Monthly", value: "P1M" },
  { label: "Every 2 months", value: "P2M" },
  { label: "Quarterly", value: "P3M" }
];

function labelize(value: string) {
  if (!value) return "None";
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

function daysUntil(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function isDue(record: PersonalRecord) {
  const days = daysUntil(record.time.nextReview);
  return days !== null && days <= 0;
}

function isThisWeek(record: PersonalRecord) {
  const days = daysUntil(record.time.nextReview);
  return days !== null && days > 0 && days <= 7;
}

function isDormant(record: PersonalRecord) {
  if (record.status === "inactive") return true;
  if (!record.time.lastReview && !record.time.nextReview) return true;
  const last = record.time.lastReview ? new Date(record.time.lastReview) : null;
  if (!last || Number.isNaN(last.getTime())) return false;
  return Date.now() - last.getTime() > 1000 * 60 * 60 * 24 * 75;
}

function getPeopleTone(record: PersonalRecord) {
  if (isDue(record) || record.status === "blocked") return "crimson";
  if (isThisWeek(record)) return "orange";
  if (record.className === "org") return "blue";
  if (record.status === "active" || record.status === "next") return "green";
  if (isDormant(record)) return "brown";
  return "pink";
}

function matchesFilter(record: PersonalRecord, filter: PeopleFilter) {
  if (filter === "all") return true;
  if (filter === "due") return isDue(record);
  if (filter === "week") return isThisWeek(record);
  if (filter === "active") return record.status === "active" || record.status === "next";
  if (filter === "dormant") return isDormant(record);
  if (filter === "orgs") return record.className === "org";
  return true;
}

function getSearchText(record: PersonalRecord) {
  return [
    record.title,
    record.body,
    record.className,
    record.status,
    record.areas.join(" "),
    record.subjects.join(" "),
    record.projects.join(" "),
    record.externalSources.join(" "),
    record.url || ""
  ]
    .join(" ")
    .toLowerCase();
}

function getPrimaryGroup(record: PersonalRecord) {
  return record.subjects[0] || record.areas[0] || (record.className === "org" ? "Organization" : "Contact");
}

function getCadenceLabel(value?: string) {
  if (!value) return "No cadence";
  return CADENCE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function displayList(values: string[], fallback = "-") {
  return values.length > 0 ? values.join(", ") : fallback;
}

export default function PeopleWorkspace({ initialPeople, totalRecords }: PeopleWorkspaceProps) {
  const [people, setPeople] = useState(initialPeople);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PeopleFilter>("all");
  const [selectedId, setSelectedId] = useState(initialPeople[0]?.id || "");
  const [name, setName] = useState("");
  const [className, setClassName] = useState<Extract<PersonalRecordClass, "person" | "org">>("person");
  const [group, setGroup] = useState("Collaborator");
  const [status, setStatus] = useState<PersonalRecordStatus>("active");
  const [body, setBody] = useState("");
  const [projects, setProjects] = useState("");
  const [lastContact, setLastContact] = useState("");
  const [nextContact, setNextContact] = useState("");
  const [cadence, setCadence] = useState("P1M");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visiblePeople = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return people.filter((record) => {
      if (!matchesFilter(record, activeFilter)) return false;
      if (!normalizedQuery) return true;
      return getSearchText(record).includes(normalizedQuery);
    });
  }, [activeFilter, people, query]);

  const selectedPerson = useMemo(() => {
    return people.find((record) => record.id === selectedId) || visiblePeople[0] || people[0];
  }, [people, selectedId, visiblePeople]);

  const stats = useMemo(() => {
    return {
      total: people.length,
      due: people.filter(isDue).length,
      week: people.filter(isThisWeek).length,
      dormant: people.filter(isDormant).length,
      strongTies: people.filter((record) => record.status === "active" || record.projects.length > 0).length
    };
  }, [people]);

  async function submitPerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/personal/records", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({
        domain: "notes-docs",
        title: name,
        className,
        status,
        body,
        privacy: "private",
        stage: "processed",
        areas: ["Relationships"],
        subjects: [group],
        projects: splitList(projects),
        intents: ["connect"],
        url: referenceUrl,
        externalSources: referenceUrl ? [referenceUrl] : [],
        time: {
          reviewCadence: cadence,
          lastReview: lastContact,
          nextReview: nextContact
        }
      })
    });

    const payload = (await response
      .json()
      .catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;

    if (!response.ok || !payload.ok || !payload.items) {
      setError(payload.error || "Failed to save person");
      setSaving(false);
      return;
    }

    const nextPeople = payload.items.filter((record) => record.className === "person" || record.className === "org");
    setPeople(nextPeople);
    setSelectedId(nextPeople[0]?.id || "");
    setName("");
    setClassName("person");
    setGroup("Collaborator");
    setStatus("active");
    setBody("");
    setProjects("");
    setLastContact("");
    setNextContact("");
    setCadence("P1M");
    setReferenceUrl("");
    setSaving(false);
  }

  async function patchPerson(id: string, patch: { status?: PersonalRecordStatus; action?: "review" }) {
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
      setError(payload.error || "Failed to update person");
      return;
    }

    const nextPeople = payload.items.filter((record) => record.className === "person" || record.className === "org");
    setPeople(nextPeople);
    setSelectedId(id);
  }

  return (
    <>
      <header className="module-ref-header people-workspace-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-pink">People</p>
          <h1>People and contact cadence</h1>
          <p>
            Track who matters, when to follow up, and the context needed to make the next contact
            useful.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input
            aria-label="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes, files, people, reviews"
          />
          <kbd>{visiblePeople.length}</kbd>
        </label>
      </header>

      <section className="people-operating-strip" aria-label="People overview">
        {[
          ["People", String(stats.total), "pink"],
          ["Due", String(stats.due), "crimson"],
          ["This week", String(stats.week), "orange"],
          ["Strong ties", String(stats.strongTies), "green"],
          ["Dormant", String(stats.dormant), "brown"]
        ].map(([label, value, tone]) => (
          <article className={`module-ref-stat module-ref-tone-${tone}`} key={label}>
            <span className="module-ref-dot" />
            <strong>{value}</strong>
            <p>{label}</p>
          </article>
        ))}
      </section>

      <section className="module-ref-content people-workspace-content">
        <div className="module-ref-main">
          <article className="module-ref-panel people-list-panel">
            <div className="module-ref-section-title">
              <h2>Contact cadence</h2>
              <span className="module-ref-regression-sentinel">CRM Starting Point</span>
            </div>
            <div className="module-ref-chip-row people-filter-row" role="list" aria-label="People filters">
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

            {visiblePeople.length > 0 ? (
              <div className="people-data-list">
                {visiblePeople.map((record) => (
                  <button
                    type="button"
                    className={`people-contact-row module-ref-tone-${getPeopleTone(record)}${selectedPerson?.id === record.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(record.id)}
                    key={record.id}
                  >
                    <strong>{record.title}</strong>
                    <span>{getPrimaryGroup(record)}</span>
                    <span>Last {formatDate(record.time.lastReview || record.updatedAt)}</span>
                    <span>Next {formatDate(record.time.nextReview)}</span>
                    <span>{getCadenceLabel(record.time.reviewCadence)}</span>
                    <span className="module-ref-open-button">Select</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="notes-empty-state">
                <h3>No people match this view</h3>
                <p>Adjust the filter or add a person with a useful follow-up cadence.</p>
              </div>
            )}
          </article>

          <section className="people-lower-grid">
            <article className="module-ref-lane">
              <h3>Quick add person</h3>
              <form className="people-capture-form" onSubmit={submitPerson}>
                <label>
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Person or organization"
                    required
                  />
                </label>
                <div className="people-capture-grid">
                  <label>
                    Type
                    <select value={className} onChange={(event) => setClassName(event.target.value as "person" | "org")}>
                      <option value="person">Person</option>
                      <option value="org">Organization</option>
                    </select>
                  </label>
                  <label>
                    Group
                    <select value={group} onChange={(event) => setGroup(event.target.value)}>
                      {GROUP_OPTIONS.map((option) => (
                        <option value={option} key={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Relationship context
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="How you know them, what matters, and what the next useful contact should be about."
                    rows={5}
                  />
                </label>
                <div className="people-capture-grid">
                  <label>
                    Status
                    <select value={status} onChange={(event) => setStatus(event.target.value as PersonalRecordStatus)}>
                      <option value="active">Active</option>
                      <option value="next">Next</option>
                      <option value="idea">Loose tie</option>
                      <option value="inactive">Dormant</option>
                    </select>
                  </label>
                  <label>
                    Cadence
                    <select value={cadence} onChange={(event) => setCadence(event.target.value)}>
                      {CADENCE_OPTIONS.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="people-capture-grid">
                  <label>
                    Last contact
                    <input type="date" value={lastContact} onChange={(event) => setLastContact(event.target.value)} />
                  </label>
                  <label>
                    Next contact
                    <input type="date" value={nextContact} onChange={(event) => setNextContact(event.target.value)} />
                  </label>
                </div>
                <div className="people-capture-grid">
                  <label>
                    Projects
                    <input value={projects} onChange={(event) => setProjects(event.target.value)} placeholder="Project Fremen" />
                  </label>
                  <label>
                    Reference URL
                    <input value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." />
                  </label>
                </div>
                {error && <p className="personal-record-error">{error}</p>}
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Person"}
                </button>
              </form>
            </article>

            <article className="module-ref-lane">
              <h3>Cadence rules</h3>
              <div className="module-ref-activity-list">
                {[
                  ["Due", "Next contact date has passed."],
                  ["This week", "Follow-up is inside the next 7 days."],
                  ["Dormant", "Inactive or no recent contact context."],
                  ["Strong ties", "Active status or linked project context."]
                ].map(([label, value]) => (
                  <div className="module-ref-activity" key={label}>
                    <strong>{label}</strong>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>

        <aside className="module-ref-rail-stack">
          <section className="module-ref-detail">
            <div className="module-ref-detail-title">
              <span className="module-ref-eyebrow module-ref-tone-pink">Selected person</span>
              <h2>{selectedPerson?.title || "No person selected"}</h2>
            </div>
            {selectedPerson ? (
              <>
                <p>{selectedPerson.body || "No relationship context recorded yet."}</p>
                <div className="module-ref-field-grid">
                  {[
                    ["Type", labelize(selectedPerson.className)],
                    ["Group", getPrimaryGroup(selectedPerson)],
                    ["Status", STATUS_LABELS[selectedPerson.status]],
                    ["Cadence", getCadenceLabel(selectedPerson.time.reviewCadence)],
                    ["Last contact", formatDate(selectedPerson.time.lastReview || selectedPerson.updatedAt)],
                    ["Next contact", formatDate(selectedPerson.time.nextReview)]
                  ].map(([label, value]) => (
                    <div className="module-ref-field" key={label}>
                      <strong>{label}</strong>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="module-ref-review-card">
                  <h3>Connected context</h3>
                  <div className="module-ref-field-list">
                    {[
                      ["Projects", displayList(selectedPerson.projects)],
                      ["Areas", displayList(selectedPerson.areas)],
                      ["Related notes", String(selectedPerson.relations.related.length)],
                      ["Sources", displayList(selectedPerson.externalSources, selectedPerson.url || "-")]
                    ].map(([label, value]) => (
                      <div className="module-ref-field" key={label}>
                        <strong>{label}</strong>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="people-detail-actions">
                  <button type="button" onClick={() => patchPerson(selectedPerson.id, { action: "review" })}>
                    Mark contacted
                  </button>
                  <button type="button" onClick={() => patchPerson(selectedPerson.id, { status: "next" })}>
                    Queue next
                  </button>
                  <button type="button" onClick={() => patchPerson(selectedPerson.id, { status: "inactive" })}>
                    Set dormant
                  </button>
                  <Link href={`/admin/personal/records/${selectedPerson.id}`}>Open profile</Link>
                </div>
              </>
            ) : (
              <p>Add a person or change filters to populate the profile rail.</p>
            )}
          </section>

          <section className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>People model</h2>
              <span>{totalRecords}</span>
            </div>
            <div className="module-ref-field-list">
              {[
                ["Storage", "Person/org records through existing Notes model"],
                ["Privacy", "Private admin workspace; avoid unnecessary sensitive detail"],
                ["Cadence", "Review fields double as contact cadence"],
                ["Relationships", "Linked notes and projects remain visible"]
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
