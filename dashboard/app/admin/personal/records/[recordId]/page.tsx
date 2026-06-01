import Link from "next/link";
import { notFound } from "next/navigation";
import AdminChrome from "../../../../../components/AdminChrome";
import PersonalViewportToggle from "../../../../../components/PersonalViewportToggle";
import { getPersonalSystemDomain } from "../../../../../lib/personal-systems";
import {
  readPersonalRecords,
  type PersonalRecord,
  type PersonalRecordStatus
} from "../../../../../lib/personal-records-store";
import { requireAdminSession } from "../../../../../lib/require-admin";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<PersonalRecordStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  blocked: "Blocked",
  inactive: "Inactive",
  next: "Next"
};

type PropertyItem = {
  label: string;
  value?: string | string[] | null;
};

function labelize(value: string) {
  if (!value) {
    return "None";
  }
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayValue(value?: string | string[] | null) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "-";
  }
  return value || "-";
}

function formatRelation(ids: string[], recordById: Map<string, PersonalRecord>) {
  return ids.map((id) => recordById.get(id)?.title || id);
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

function recordPropertyGroups(record: PersonalRecord, recordById: Map<string, PersonalRecord>) {
  return [
    {
      title: "Core",
      items: [
        { label: "UID", value: record.createdMeta.uid },
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
      title: "Relationships and Sources",
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
      items: [
        { label: "Created_ISO", value: record.createdMeta.createdIso },
        { label: "Created", value: record.createdMeta.created },
        { label: "Created_Date", value: record.createdMeta.createdDate },
        { label: "Created_Year", value: record.createdMeta.createdYear },
        { label: "Created_Month", value: record.createdMeta.createdMonth },
        { label: "Created_YearMonth", value: record.createdMeta.createdYearMonth },
        { label: "Created_Quarter", value: record.createdMeta.createdQuarter },
        { label: "Created_YearQuarter", value: record.createdMeta.createdYearQuarter },
        { label: "Created_Week", value: record.createdMeta.createdWeek },
        { label: "Created_YearWeek", value: record.createdMeta.createdYearWeek },
        { label: "Created_WeekdayName", value: record.createdMeta.createdWeekdayName },
        { label: "Created_WeekdayNumber", value: record.createdMeta.createdWeekdayNumber }
      ]
    }
  ];
}

export default async function PersonalRecordPage({
  params
}: {
  params: Promise<{ recordId: string }>;
}) {
  await requireAdminSession();
  const { recordId } = await params;
  const records = await readPersonalRecords().catch(() => []);
  const record = records.find((item) => item.id === recordId);

  if (!record) {
    notFound();
  }

  const domain = getPersonalSystemDomain(record.domain);
  const recordById = new Map(records.map((item) => [item.id, item]));

  return (
    <main className="shell personal-ops-shell personal-record-detail-shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Note"
        sidebarSummary={record.title}
        sidebarItems={[
          { label: "Class", value: labelize(record.className) },
          { label: "Status", value: STATUS_LABELS[record.status] },
          { label: "Growth", value: labelize(record.growth) },
          { label: "Review", value: record.time.nextReview || "None" }
        ]}
        sidebarActions={[
          { label: `Back to ${domain?.shortLabel || "Domain"}`, href: `/admin/personal/${record.domain}` },
          { label: "All Notes", href: "/admin/notes" }
        ]}
      />
      <PersonalViewportToggle />
      <header className="topbar personal-domain-topbar">
        <div>
          <p className="muted personal-ops-kicker">Personal note</p>
          <h1 style={{ margin: 0 }}>{record.title}</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {domain?.label || record.domain} / {labelize(record.className)} / {STATUS_LABELS[record.status]}
          </p>
        </div>
        <Link href={`/admin/personal/${record.domain}`} className="review-back-link">
          Back to {domain?.shortLabel || "Domain"}
        </Link>
      </header>

      <section className="personal-record-detail-layout">
        <article className="personal-record-detail-main personal-panel">
          <div className="personal-ops-section-heading">
            <h2>Note Body</h2>
            <span>{labelize(record.growth)}</span>
          </div>
          {record.body ? (
            <p className="personal-record-detail-body">{record.body}</p>
          ) : (
            <p className="muted">No body content recorded yet.</p>
          )}
          {record.url && (
            <p>
              <a href={record.url} target="_blank" rel="noreferrer">
                Open linked reference
              </a>
            </p>
          )}
        </article>

        <aside className="personal-record-detail-side personal-panel">
          <h2>Preview</h2>
          <PropertyGrid
            items={[
              { label: "UID", value: record.createdMeta.uid },
              { label: "Created", value: record.createdMeta.created },
              { label: "Next_Review", value: record.time.nextReview },
              { label: "Areas", value: record.areas },
              { label: "Projects", value: record.projects }
            ]}
          />
        </aside>
      </section>

      <section className="personal-panel">
        <div className="personal-ops-section-heading">
          <h2>All Properties</h2>
          <span>Complete model</span>
        </div>
        <div className="personal-record-property-groups">
          {recordPropertyGroups(record, recordById).map((group) => (
            <section className="personal-record-property-section" key={group.title}>
              <h3>{group.title}</h3>
              <PropertyGrid items={group.items} />
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
