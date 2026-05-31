"use client";

import { useMemo, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import type { PersonalSystemDomain } from "../lib/personal-systems";
import type {
  PersonalRecord,
  PersonalRecordKind,
  PersonalRecordPriority,
  PersonalRecordStatus
} from "../lib/personal-records-store";

type RecordsResponse = {
  ok: boolean;
  items?: PersonalRecord[];
  error?: string;
};

const KIND_OPTIONS: Array<{ value: PersonalRecordKind; label: string }> = [
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "event", label: "Event" },
  { value: "file", label: "File" },
  { value: "decision", label: "Decision" },
  { value: "metric", label: "Metric" }
];

const STATUS_LABELS: Record<PersonalRecordStatus, string> = {
  active: "Active",
  waiting: "Waiting",
  done: "Done",
  archived: "Archived"
};

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleDateString();
}

function getVisibleRecords(records: PersonalRecord[], domain: string) {
  return records.filter((record) => record.domain === domain || record.relatedDomains.includes(domain));
}

export default function PersonalRecordsPanel({
  domain,
  domains,
  initialRecords
}: {
  domain: PersonalSystemDomain;
  domains: PersonalSystemDomain[];
  initialRecords: PersonalRecord[];
}) {
  const [records, setRecords] = useState(initialRecords);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PersonalRecordKind>("note");
  const [status, setStatus] = useState<PersonalRecordStatus>("active");
  const [priority, setPriority] = useState<PersonalRecordPriority>("P2");
  const [happensOn, setHappensOn] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [relatedDomains, setRelatedDomains] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visibleRecords = useMemo(
    () => getVisibleRecords(records, domain.slug),
    [domain.slug, records]
  );

  const otherDomains = domains.filter((item) => item.slug !== domain.slug);

  function toggleRelatedDomain(slug: string) {
    setRelatedDomains((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    );
  }

  async function submitRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/personal/records", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({
        domain: domain.slug,
        title,
        kind,
        status,
        priority,
        happensOn,
        url,
        tags: splitTags(tags),
        relatedDomains,
        body
      })
    });
    const payload = (await response
      .json()
      .catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;

    if (!response.ok || !payload.ok || !payload.items) {
      setError(payload.error || "Failed to save record");
      setSaving(false);
      return;
    }

    setRecords(payload.items);
    setTitle("");
    setKind("note");
    setStatus("active");
    setPriority("P2");
    setHappensOn("");
    setUrl("");
    setTags("");
    setBody("");
    setRelatedDomains([]);
    setSaving(false);
  }

  async function updateStatus(id: string, nextStatus: PersonalRecordStatus) {
    setError("");
    const response = await fetch("/api/personal/records", {
      method: "PATCH",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ id, status: nextStatus })
    });
    const payload = (await response
      .json()
      .catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;

    if (!response.ok || !payload.ok || !payload.items) {
      setError(payload.error || "Failed to update record");
      return;
    }
    setRecords(payload.items);
  }

  return (
    <section className="personal-record-workspace">
      <div className="personal-record-form-wrap">
        <div className="personal-ops-section-heading">
          <h2>Record Something</h2>
          <span>Saved to Unigentamos</span>
        </div>
        <form className="personal-record-form" onSubmit={submitRecord}>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`${domain.shortLabel} record`}
              required
            />
          </label>

          <div className="personal-record-form-row">
            <label>
              Type
              <select value={kind} onChange={(event) => setKind(event.target.value as PersonalRecordKind)}>
                {KIND_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as PersonalRecordStatus)}
              >
                <option value="active">Active</option>
                <option value="waiting">Waiting</option>
                <option value="done">Done</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as PersonalRecordPriority)}
              >
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </label>
          </div>

          <div className="personal-record-form-row">
            <label>
              Date
              <input
                type="date"
                value={happensOn}
                onChange={(event) => setHappensOn(event.target.value)}
              />
            </label>
            <label>
              Link or File Reference
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
          </div>

          <label>
            Body
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Record the useful context, decision, next action, or reference."
              rows={5}
            />
          </label>

          <label>
            Tags
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="comma, separated, tags"
            />
          </label>

          <fieldset className="personal-related-domains">
            <legend>Related Domains</legend>
            <div>
              {otherDomains.map((item) => (
                <label key={item.slug}>
                  <input
                    type="checkbox"
                    checked={relatedDomains.includes(item.slug)}
                    onChange={() => toggleRelatedDomain(item.slug)}
                  />
                  {item.shortLabel}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="personal-record-error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Record"}
          </button>
        </form>
      </div>

      <div className="personal-record-list-wrap">
        <div className="personal-ops-section-heading">
          <h2>Saved Records</h2>
          <span>{visibleRecords.length}</span>
        </div>
        {visibleRecords.length === 0 ? (
          <p className="muted">
            No records yet. Add the first {domain.shortLabel.toLowerCase()} item and it will be
            saved as part of the Unigentamos database.
          </p>
        ) : (
          <div className="personal-record-list">
            {visibleRecords.map((record) => (
              <article className="personal-record-card" key={record.id}>
                <div className="personal-record-card-header">
                  <div>
                    <p>{record.kind}</p>
                    <h3>{record.title}</h3>
                  </div>
                  <div className="personal-record-badges">
                    <span>{record.priority}</span>
                    <span className={`personal-record-status personal-record-status-${record.status}`}>
                      {STATUS_LABELS[record.status]}
                    </span>
                  </div>
                </div>

                {record.body && <p className="personal-record-body">{record.body}</p>}

                <div className="personal-record-meta">
                  {record.happensOn && <span>{record.happensOn}</span>}
                  <span>Updated {formatDate(record.updatedAt)}</span>
                  {record.url && (
                    <a href={record.url} target="_blank" rel="noreferrer">
                      Open reference
                    </a>
                  )}
                </div>

                {(record.tags.length > 0 || record.relatedDomains.length > 0) && (
                  <div className="personal-record-chip-row">
                    {record.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {record.relatedDomains.map((slug) => (
                      <span key={slug}>
                        {domains.find((item) => item.slug === slug)?.shortLabel || slug}
                      </span>
                    ))}
                  </div>
                )}

                <div className="personal-record-actions">
                  <button
                    type="button"
                    disabled={record.status === "done"}
                    onClick={() => updateStatus(record.id, "done")}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    disabled={record.status === "archived"}
                    onClick={() => updateStatus(record.id, "archived")}
                  >
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
