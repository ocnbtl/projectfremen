"use client";

import Link from "next/link";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import type { PersonalSystemDomain } from "../lib/personal-systems";
import type {
  PersonalRecord,
  PersonalRecordClass,
  PersonalRecordCreatedMeta,
  PersonalRecordGrowth,
  PersonalRecordIntent,
  PersonalRecordKnowledgeShape,
  PersonalRecordStage,
  PersonalRecordStatus,
  PersonalRecordTime
} from "../lib/personal-records-store";

type RecordsResponse = {
  ok: boolean;
  items?: PersonalRecord[];
  error?: string;
};

type PropertyItem = {
  label: string;
  value?: string | string[] | null;
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

const KNOWLEDGE_SHAPES: PersonalRecordKnowledgeShape[] = [
  "",
  "observation",
  "claim",
  "procedure",
  "process",
  "collection",
  "reference"
];
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

const WEEKDAY_NUMBER: Record<string, string> = {
  Monday: "1",
  Tuesday: "2",
  Wednesday: "3",
  Thursday: "4",
  Friday: "5",
  Saturday: "6",
  Sunday: "7"
};

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

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function getNewYorkParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    weekday: parts.weekday
  };
}

function getIsoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}

function buildClientCreatedPreview(): PersonalRecordCreatedMeta {
  const date = new Date();
  const parts = getNewYorkParts(date);
  const quarter = `Q${Math.ceil(Number(parts.month) / 3)}`;
  const isoWeek = getIsoWeek(date);
  return {
    uid: `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}${pad(date.getMilliseconds(), 3)}`,
    createdIso: date.toISOString(),
    created: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(date),
    createdDate: `${parts.year}-${parts.month}-${parts.day}`,
    createdYear: parts.year,
    createdMonth: parts.month,
    createdYearMonth: `${parts.year}-${parts.month}`,
    createdQuarter: quarter,
    createdYearQuarter: `${parts.year}-${quarter}`,
    createdWeek: `W${pad(isoWeek.week)}`,
    createdYearWeek: `${isoWeek.year}-W${pad(isoWeek.week)}`,
    createdWeekdayName: parts.weekday,
    createdWeekdayNumber: WEEKDAY_NUMBER[parts.weekday] || "-"
  };
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months, 1);
  const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, maxDay));
  return next;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function calculateNextReview(lastReview: string, cadence: string): string | undefined {
  const match = cadence.trim().toUpperCase().match(/^P(\d+)([DWMY])$/);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  const base = new Date(lastReview);
  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(base.getTime())) {
    return undefined;
  }
  if (match[2] === "D") return dateOnly(new Date(base.getTime() + amount * 86400000));
  if (match[2] === "W") return dateOnly(new Date(base.getTime() + amount * 7 * 86400000));
  if (match[2] === "M") return dateOnly(addMonths(base, amount));
  return dateOnly(addMonths(base, amount * 12));
}

function calculateGrowthPreview(body: string, relationCount: number): PersonalRecordGrowth {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (relationCount >= 18 || wordCount >= 5000) return "jungle";
  if (relationCount >= 10 || wordCount >= 2500) return "forest";
  if (wordCount >= 900) return "tree";
  if (wordCount >= 180) return "plant";
  return "seed";
}

function getVisibleRecords(records: PersonalRecord[], domain: string) {
  return records.filter((record) => record.domain === domain);
}

function optionRecords(records: PersonalRecord[]) {
  return records.slice(0, 50);
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="personal-info-tip" title={text} aria-label={text}>
      ?
    </span>
  );
}

function displayValue(value?: string | string[] | null) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "-";
  }
  return value || "-";
}

function PropertyGrid({ items }: { items: PropertyItem[] }) {
  return (
    <dl className="personal-property-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{displayValue(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatRelation(ids: string[], recordById: Map<string, PersonalRecord>) {
  return ids.map((id) => recordById.get(id)?.title || id);
}

function createdPropertyItems(meta: PersonalRecordCreatedMeta): PropertyItem[] {
  return [
    { label: "UID", value: meta.uid },
    { label: "Created_ISO", value: meta.createdIso },
    { label: "Created", value: meta.created },
    { label: "Created_Date", value: meta.createdDate },
    { label: "Created_Year", value: meta.createdYear },
    { label: "Created_Month", value: meta.createdMonth },
    { label: "Created_YearMonth", value: meta.createdYearMonth },
    { label: "Created_Quarter", value: meta.createdQuarter },
    { label: "Created_YearQuarter", value: meta.createdYearQuarter },
    { label: "Created_Week", value: meta.createdWeek },
    { label: "Created_YearWeek", value: meta.createdYearWeek },
    { label: "Created_WeekdayName", value: meta.createdWeekdayName },
    { label: "Created_WeekdayNumber", value: meta.createdWeekdayNumber }
  ];
}

function recordPropertyItems(
  record: PersonalRecord,
  recordById: Map<string, PersonalRecord>
): { title: string; items: PropertyItem[] }[] {
  return [
    {
      title: "Core",
      items: [
        { label: "Name", value: record.title },
        { label: "Privacy", value: labelize(record.privacy) },
        { label: "Class", value: labelize(record.className) },
        { label: "Kind", value: labelize(record.knowledgeShape) },
        { label: "Stage", value: labelize(record.stage) },
        { label: "Status", value: STATUS_LABELS[record.status] },
        { label: "Growth", value: labelize(record.growth) },
        { label: "Intent", value: record.intents.map(labelize) }
      ]
    },
    {
      title: "Organization",
      items: [
        { label: "Areas", value: record.areas },
        { label: "Subjects", value: record.subjects },
        { label: "Projects", value: record.projects },
        { label: "Related", value: formatRelation(record.relations.related, recordById) }
      ]
    },
    {
      title: "Relationships",
      items: [
        { label: "North", value: formatRelation(record.relations.north, recordById) },
        { label: "South", value: formatRelation(record.relations.south, recordById) },
        { label: "East", value: formatRelation(record.relations.east, recordById) },
        { label: "West", value: formatRelation(record.relations.west, recordById) },
        { label: "Stakeholders", value: formatRelation(record.relations.stakeholders, recordById) },
        { label: "Stakeholdings", value: formatRelation(record.relations.stakeholdings, recordById) },
        { label: "Internal_Source", value: formatRelation(record.relations.internalSources, recordById) },
        { label: "External_Source", value: record.externalSources }
      ]
    },
    {
      title: "Time and Review",
      items: [
        { label: "Start_Date", value: record.time.startDate },
        { label: "Start_Time", value: record.time.startTime },
        { label: "Due_Date", value: record.time.dueDate },
        { label: "Due_Time", value: record.time.dueTime },
        { label: "Review_Cadence", value: record.time.reviewCadence },
        { label: "Next_Review", value: record.time.nextReview },
        { label: "Last_Review", value: record.time.lastReview },
        { label: "Processed_On", value: record.time.processedOn }
      ]
    },
    {
      title: "Created Metadata",
      items: createdPropertyItems(record.createdMeta)
    }
  ];
}

export default function PersonalRecordsPanel({
  domain,
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
  const [body, setBody] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "shared">("private");
  const [stage, setStage] = useState<PersonalRecordStage>("processed");
  const [knowledgeShape, setKnowledgeShape] = useState<PersonalRecordKnowledgeShape>("");
  const [areas, setAreas] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [intents, setIntents] = useState<PersonalRecordIntent[]>([]);
  const [url, setUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reviewCadence, setReviewCadence] = useState("");
  const [nextReview, setNextReview] = useState("");
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
  const [createdPreview] = useState(() => buildClientCreatedPreview());

  const visibleRecords = useMemo(
    () => getVisibleRecords(records, domain.slug),
    [domain.slug, records]
  );
  const relationOptions = useMemo(() => optionRecords(records), [records]);
  const recordById = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const relationCount = north.length + south.length + east.length + west.length + internalSources.length + related.length;
  const growthPreview = calculateGrowthPreview(body, relationCount);
  const previewTime: PersonalRecordTime = {
    startDate: startDate || undefined,
    startTime: startTime || undefined,
    dueDate: dueDate || undefined,
    dueTime: dueTime || undefined,
    reviewCadence: reviewCadence.trim().toUpperCase() || undefined,
    nextReview: nextReview || calculateNextReview(createdPreview.createdIso, reviewCadence) || undefined,
    lastReview: createdPreview.createdIso,
    processedOn: stage === "processed" ? createdPreview.createdDate : undefined
  };

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
        body,
        privacy,
        stage,
        knowledgeShape,
        url,
        areas,
        subjects,
        projects,
        intents,
        externalSources: splitList(externalSources),
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
    setBody("");
    setPrivacy("private");
    setStage("processed");
    setKnowledgeShape("");
    setAreas([]);
    setSubjects([]);
    setProjects([]);
    setIntents([]);
    setUrl("");
    setStartDate("");
    setStartTime("");
    setDueDate("");
    setDueTime("");
    setReviewCadence("");
    setNextReview("");
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
              <InfoTip text="Name is manual. Class defaults to Note. Status defaults to Idea. Growth is calculated automatically from note size and relationship density." />
            </div>
            <div className="personal-record-form-row personal-record-form-row-compact">
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
            </div>
          </div>

          <label>
            Body
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Record the useful context, decision, next action, citation, or reference."
              rows={7}
            />
          </label>

          <div className="personal-property-group">
            <div className="personal-property-heading">
              <h3>Organization</h3>
              <InfoTip text="Areas are broad lanes. Subjects are narrower themes. Projects connect notes to active bodies of work. Notes are not folder-bound; overlap should come through relationships and these properties." />
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
                Start_Date
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label>
                Start_Time
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </label>
              <label>
                Due_Date
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            </div>
            <div className="personal-record-form-row">
              <label>
                Due_Time
                <input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
              </label>
              <label>
                Review_Cadence
                <input value={reviewCadence} onChange={(event) => setReviewCadence(event.target.value)} placeholder="P1W" />
              </label>
              <label>
                Next_Review
                <input type="date" value={nextReview} onChange={(event) => setNextReview(event.target.value)} />
              </label>
            </div>
          </div>

          <details className="personal-property-group">
            <summary>
              Hidden and Auto Properties
              <InfoTip text="Hidden defaults include UID, privacy, processing stage, kind, created time slices, source links, and generated review metadata. This group exposes every stored property before save." />
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
                Kind
                <select
                  value={knowledgeShape}
                  onChange={(event) => setKnowledgeShape(event.target.value as PersonalRecordKnowledgeShape)}
                >
                  {KNOWLEDGE_SHAPES.map((option) => (
                    <option value={option} key={option || "blank"}>
                      {labelize(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Link or File Reference
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
            </label>
            <label>
              External_Source
              <input
                value={externalSources}
                onChange={(event) => setExternalSources(event.target.value)}
                placeholder="https://article.example, https://paper.example"
              />
            </label>
            <PropertyGrid
              items={[
                { label: "Growth", value: labelize(growthPreview) },
                { label: "Stakeholdings", value: "Generated reciprocally after save" },
                { label: "Last_Review", value: previewTime.lastReview },
                { label: "Next_Review", value: previewTime.nextReview },
                { label: "Processed_On", value: previewTime.processedOn },
                ...createdPropertyItems(createdPreview)
              ]}
            />
          </details>

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
              ["Internal_Source", internalSources, setInternalSources],
              ["Related", related, setRelated]
            ].map(([label, values, setter]) => (
              <fieldset className="personal-related-domains" key={label as string}>
                <legend>{label as string}</legend>
                <div>
                  {relationOptions.length > 0 ? (
                    relationOptions.map((record) => (
                      <label key={record.id}>
                        <input
                          type="checkbox"
                          checked={(values as string[]).includes(record.id)}
                          onChange={() => toggleRecordRelation(record.id, setter as Dispatch<SetStateAction<string[]>>)}
                        />
                        {record.title}
                      </label>
                    ))
                  ) : (
                    <span className="personal-empty-property">No saved notes available yet</span>
                  )}
                </div>
              </fieldset>
            ))}
          </details>

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
                    <h3>
                      <Link href={`/admin/personal/records/${record.id}`}>{record.title}</Link>
                    </h3>
                  </div>
                  <div className="personal-record-badges">
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
                  record.intents.length > 0) && (
                  <div className="personal-record-chip-row">
                    {[...record.areas, ...record.subjects, ...record.projects, ...record.intents].map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}

                <details className="personal-record-details">
                  <summary>All Properties</summary>
                  {recordPropertyItems(record, recordById).map((group) => (
                    <section className="personal-record-property-section" key={group.title}>
                      <h4>{group.title}</h4>
                      <PropertyGrid items={group.items} />
                    </section>
                  ))}
                </details>

                <div className="personal-record-actions">
                  <Link href={`/admin/personal/records/${record.id}`}>Open note</Link>
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
