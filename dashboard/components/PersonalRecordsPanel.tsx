"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import type { PersonalSystemDomain } from "../lib/personal-systems";
import type {
  PersonalRecord,
  PersonalRecordClass,
  PersonalRecordIntent,
  PersonalRecordPriority,
  PersonalRecordStage,
  PersonalRecordStatus
} from "../lib/personal-records-store";

type RecordsResponse = {
  ok: boolean;
  items?: PersonalRecord[];
  error?: string;
};

const STATUS_OPTIONS: PersonalRecordStatus[] = [
  "idea",
  "draft",
  "active",
  "completed",
  "blocked",
  "inactive",
  "next"
];

const STATUS_LABELS: Record<PersonalRecordStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  blocked: "Blocked",
  inactive: "Inactive",
  next: "Next"
};

const RECORD_CLASSES: PersonalRecordClass[] = [
  "assignment",
  "interaction",
  "person",
  "resource",
  "org",
  "list",
  "daily",
  "meeting",
  "note",
  "prompt",
  "task",
  "project",
  "event",
  "file",
  "decision",
  "metric"
];

const RECORD_INTENTS: PersonalRecordIntent[] = [
  "connect",
  "create",
  "implement",
  "research",
  "retain",
  "ingest",
  "publish",
  "understand"
];

const KNOWLEDGE_SHAPES = ["", "observation", "claim", "procedure", "process", "collection", "reference"];
const RECORD_AREAS = ["AI", "Finance", "Relationships", "Career", "Personal", "Travel", "University", "Health", "Home"];
const RECORD_SUBJECTS = [
  "Beliefs",
  "Business",
  "DailyLife",
  "Data",
  "Design",
  "FoodDrink",
  "Fashion",
  "Health",
  "Investing",
  "Marketing",
  "Modeling",
  "PKM",
  "Spanish",
  "Technology",
  "VanLife",
  "Website",
  "Writing"
];
const RECORD_PROJECTS = [
  "Project Pacific",
  "Project Fremen",
  "Project Iceflake",
  "Project Blacktube",
  "Project Pint"
];

function labelize(value: string) {
  if (!value) {
    return "None";
  }
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function splitList(value: string): string[] {
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

function optionRecords(records: PersonalRecord[], currentDomain: string) {
  return records
    .filter((record) => record.domain === currentDomain || record.relatedDomains.includes(currentDomain))
    .slice(0, 30);
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="personal-info-tip" title={text} aria-label={text}>
      ?
    </span>
  );
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
  const [className, setClassName] = useState<PersonalRecordClass>("note");
  const [status, setStatus] = useState<PersonalRecordStatus>("idea");
  const [priority, setPriority] = useState<PersonalRecordPriority>("P2");
  const [body, setBody] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "shared">("private");
  const [stage, setStage] = useState<PersonalRecordStage>("processed");
  const [knowledgeShape, setKnowledgeShape] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [intents, setIntents] = useState<PersonalRecordIntent[]>([]);
  const [tags, setTags] = useState("");
  const [url, setUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reviewCadence, setReviewCadence] = useState("");
  const [nextReview, setNextReview] = useState("");
  const [relatedDomains, setRelatedDomains] = useState<string[]>([]);
  const [related, setRelated] = useState<string[]>([]);
  const [north, setNorth] = useState<string[]>([]);
  const [south, setSouth] = useState<string[]>([]);
  const [east, setEast] = useState<string[]>([]);
  const [west, setWest] = useState<string[]>([]);
  const [stakeholders, setStakeholders] = useState<string[]>([]);
  const [internalSources, setInternalSources] = useState<string[]>([]);
  const [externalSources, setExternalSources] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visibleRecords = useMemo(
    () => getVisibleRecords(records, domain.slug),
    [domain.slug, records]
  );
  const relationOptions = useMemo(() => optionRecords(records, domain.slug), [domain.slug, records]);
  const otherDomains = domains.filter((item) => item.slug !== domain.slug);

  function toggleValue<T extends string>(value: T, setter: Dispatch<SetStateAction<T[]>>) {
    setter((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  function toggleRecordRelation(value: string, setter: Dispatch<SetStateAction<string[]>>) {
    setter((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
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
        className,
        status,
        priority,
        body,
        privacy,
        stage,
        knowledgeShape,
        url,
        tags: splitList(tags),
        areas,
        subjects,
        projects,
        intents,
        externalSources: splitList(externalSources),
        relatedDomains,
        relations: {
          north,
          south,
          east,
          west,
          stakeholders,
          internalSources,
          related
        },
        time: {
          startDate,
          startTime,
          dueDate,
          dueTime,
          reviewCadence,
          nextReview
        }
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
    setClassName("note");
    setStatus("idea");
    setPriority("P2");
    setBody("");
    setPrivacy("private");
    setStage("processed");
    setKnowledgeShape("");
    setAreas([]);
    setSubjects([]);
    setProjects([]);
    setIntents([]);
    setTags("");
    setUrl("");
    setStartDate("");
    setStartTime("");
    setDueDate("");
    setDueTime("");
    setReviewCadence("");
    setNextReview("");
    setRelatedDomains([]);
    setRelated([]);
    setNorth([]);
    setSouth([]);
    setEast([]);
    setWest([]);
    setStakeholders([]);
    setInternalSources([]);
    setExternalSources("");
    setSaving(false);
  }

  async function patchRecord(id: string, patch: Record<string, string>) {
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
      setError(payload.error || "Failed to update record");
      return;
    }
    setRecords(payload.items);
  }

  return (
    <section className="personal-record-workspace">
      <div className="personal-record-form-wrap">
        <div className="personal-ops-section-heading">
          <h2>Record Note</h2>
          <span>Saved to Unigentamos</span>
        </div>
        <form className="personal-record-form" onSubmit={submitRecord}>
          <label>
            Name
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`${domain.shortLabel} note`}
              required
            />
          </label>

          <div className="personal-property-group">
            <div className="personal-property-heading">
              <h3>Core Properties</h3>
              <InfoTip text="Name is manual. Class defaults to Note. Status defaults to Idea. Growth is calculated automatically from note size and relationships." />
            </div>
            <div className="personal-record-form-row">
              <label>
                Class
                <select
                  value={className}
                  onChange={(event) => setClassName(event.target.value as PersonalRecordClass)}
                >
                  {RECORD_CLASSES.map((option) => (
                    <option value={option} key={option}>
                      {labelize(option)}
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
                  {STATUS_OPTIONS.map((option) => (
                    <option value={option} key={option}>
                      {STATUS_LABELS[option]}
                    </option>
                  ))}
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
          </div>

          <label>
            Body
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Record the useful context, decision, next action, citation, or reference."
              rows={6}
            />
          </label>

          <div className="personal-property-group">
            <div className="personal-property-heading">
              <h3>Organization</h3>
              <InfoTip text="Areas are broad lanes. Subjects are narrower themes. Projects connect notes to active bodies of work. Related domains make a note appear in other Personal Ops modules." />
            </div>
            <fieldset className="personal-related-domains">
              <legend>Areas</legend>
              <div>
                {RECORD_AREAS.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={areas.includes(item)}
                      onChange={() => toggleValue(item, setAreas)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="personal-related-domains">
              <legend>Subjects</legend>
              <div>
                {RECORD_SUBJECTS.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={subjects.includes(item)}
                      onChange={() => toggleValue(item, setSubjects)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="personal-related-domains">
              <legend>Projects</legend>
              <div>
                {RECORD_PROJECTS.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={projects.includes(item)}
                      onChange={() => toggleValue(item, setProjects)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="personal-related-domains">
              <legend>Related Domains</legend>
              <div>
                {otherDomains.map((item) => (
                  <label key={item.slug}>
                    <input
                      type="checkbox"
                      checked={relatedDomains.includes(item.slug)}
                      onChange={() => toggleValue(item.slug, setRelatedDomains)}
                    />
                    {item.shortLabel}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="personal-property-group">
            <div className="personal-property-heading">
              <h3>Intent</h3>
              <InfoTip text="Intent is multi-select. Use it to say what you plan to do with the note: connect, create, implement, research, retain, ingest, publish, or understand." />
            </div>
            <fieldset className="personal-related-domains">
              <legend>Intent</legend>
              <div>
                {RECORD_INTENTS.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={intents.includes(item)}
                      onChange={() => toggleValue(item, setIntents)}
                    />
                    {labelize(item)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="personal-property-group">
            <div className="personal-property-heading">
              <h3>Time and Review</h3>
              <InfoTip text="Start and due fields are manual. Review cadence uses ISO duration strings such as P1W or P1M. Last review is auto-created and can be refreshed from each saved record." />
            </div>
            <div className="personal-record-form-row">
              <label>
                Start Date
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label>
                Start Time
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </label>
              <label>
                Due Date
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            </div>
            <div className="personal-record-form-row">
              <label>
                Due Time
                <input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
              </label>
              <label>
                Review Cadence
                <input value={reviewCadence} onChange={(event) => setReviewCadence(event.target.value)} placeholder="P1W" />
              </label>
              <label>
                Next Review
                <input type="date" value={nextReview} onChange={(event) => setNextReview(event.target.value)} />
              </label>
            </div>
          </div>

          <details className="personal-property-group">
            <summary>
              Hidden Properties
              <InfoTip text="Hidden defaults include UID, privacy, processing stage, created time slices, directional relationships, sources, and citation-style links." />
            </summary>
            <div className="personal-record-form-row">
              <label>
                Privacy
                <select value={privacy} onChange={(event) => setPrivacy(event.target.value as "private" | "shared")}>
                  <option value="private">Private</option>
                  <option value="shared">Shared</option>
                </select>
              </label>
              <label>
                Stage
                <select value={stage} onChange={(event) => setStage(event.target.value as PersonalRecordStage)}>
                  <option value="processed">Processed</option>
                  <option value="unprocessed">Unprocessed</option>
                </select>
              </label>
              <label>
                Knowledge Shape
                <select value={knowledgeShape} onChange={(event) => setKnowledgeShape(event.target.value)}>
                  {KNOWLEDGE_SHAPES.map((option) => (
                    <option value={option} key={option || "blank"}>
                      {labelize(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Tags
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="comma, separated, tags" />
            </label>
            <label>
              Link or File Reference
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
            </label>
            <label>
              External Sources
              <input
                value={externalSources}
                onChange={(event) => setExternalSources(event.target.value)}
                placeholder="https://article.example, https://paper.example"
              />
            </label>
          </details>

          {relationOptions.length > 0 && (
            <details className="personal-property-group">
              <summary>
                Relationships
                <InfoTip text="North/South are parent-child. East/West are sequence links. Setting one direction automatically writes the reciprocal direction on the linked record. Stakeholders write stakeholdings back to the selected person or org record." />
              </summary>
              {[
                ["North", north, setNorth],
                ["South", south, setSouth],
                ["West", west, setWest],
                ["East", east, setEast],
                ["Stakeholders", stakeholders, setStakeholders],
                ["Internal Sources", internalSources, setInternalSources],
                ["Related", related, setRelated]
              ].map(([label, values, setter]) => (
                <fieldset className="personal-related-domains" key={label as string}>
                  <legend>{label as string}</legend>
                  <div>
                    {relationOptions.map((record) => (
                      <label key={record.id}>
                        <input
                          type="checkbox"
                          checked={(values as string[]).includes(record.id)}
                          onChange={() => toggleRecordRelation(record.id, setter as Dispatch<SetStateAction<string[]>>)}
                        />
                        {record.title}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </details>
          )}

          {error && <p className="personal-record-error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Note"}
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
            No records yet. Add the first {domain.shortLabel.toLowerCase()} note and it will be
            saved as part of the Unigentamos database.
          </p>
        ) : (
          <div className="personal-record-list">
            {visibleRecords.map((record) => (
              <article className="personal-record-card" key={record.id}>
                <div className="personal-record-card-header">
                  <div>
                    <p>{record.className} / {record.growth}</p>
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
                  <span>{record.createdMeta.created}</span>
                  {record.time.nextReview && <span>Review {record.time.nextReview}</span>}
                  {record.time.dueDate && <span>Due {record.time.dueDate}</span>}
                  <span>Updated {formatDate(record.updatedAt)}</span>
                  {record.url && (
                    <a href={record.url} target="_blank" rel="noreferrer">
                      Open reference
                    </a>
                  )}
                </div>

                {(record.areas.length > 0 ||
                  record.subjects.length > 0 ||
                  record.projects.length > 0 ||
                  record.intents.length > 0 ||
                  record.tags.length > 0 ||
                  record.relatedDomains.length > 0) && (
                  <div className="personal-record-chip-row">
                    {[...record.areas, ...record.subjects, ...record.projects, ...record.intents, ...record.tags].map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {record.relatedDomains.map((slug) => (
                      <span key={slug}>
                        {domains.find((item) => item.slug === slug)?.shortLabel || slug}
                      </span>
                    ))}
                  </div>
                )}

                <details className="personal-record-details">
                  <summary>Properties</summary>
                  <dl>
                    <div><dt>UID</dt><dd>{record.createdMeta.uid}</dd></div>
                    <div><dt>Privacy</dt><dd>{labelize(record.privacy)}</dd></div>
                    <div><dt>Stage</dt><dd>{labelize(record.stage)}</dd></div>
                    <div><dt>Created ISO</dt><dd>{record.createdMeta.createdIso}</dd></div>
                    <div><dt>Created YearMonth</dt><dd>{record.createdMeta.createdYearMonth}</dd></div>
                    <div><dt>Created YearWeek</dt><dd>{record.createdMeta.createdYearWeek}</dd></div>
                    <div><dt>Last Review</dt><dd>{record.time.lastReview || "-"}</dd></div>
                    <div><dt>Processed On</dt><dd>{record.time.processedOn || "-"}</dd></div>
                  </dl>
                </details>

                <div className="personal-record-actions">
                  <button type="button" onClick={() => patchRecord(record.id, { action: "review" })}>
                    Reviewed
                  </button>
                  <button
                    type="button"
                    disabled={record.status === "completed"}
                    onClick={() => patchRecord(record.id, { status: "completed" })}
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    disabled={record.status === "inactive"}
                    onClick={() => patchRecord(record.id, { status: "inactive" })}
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
