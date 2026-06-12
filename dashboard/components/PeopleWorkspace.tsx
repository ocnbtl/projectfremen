"use client";

import { useEffect, useMemo, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import type {
  PersonalContactProfile,
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
type PeopleView = "overview" | "timeline" | "notes" | "relations" | "files" | "properties";
type DetailMode = "profile" | "edit" | "timeline" | "workspace";

type ContactProfileDraft = {
  fullName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  nickname: string;
  context: string;
  birthday: string;
  phoneNumber: string;
  primaryEmail: string;
  workEmail: string;
  universityEmail: string;
  primaryOccupation: string;
  primaryEmployer: string;
  secondaryOccupation: string;
  secondaryEmployer: string;
  pastOccupation: string;
  pastEmployer: string;
  universityAffiliation: string;
  livesIn: string;
  comesFrom: string;
  associatedPeople: string;
  lastContact: string;
  nextContact: string;
  contactCadence: string;
  interestingFact: string;
  lifeDream: string;
  notes: string;
  linkedin: string;
  website: string;
  partner: string;
  children: string;
  interactions: string;
  memories: string;
};

type ProfileField = {
  key: keyof ContactProfileDraft;
  label: string;
  type?: "date" | "email" | "tel" | "url" | "textarea";
  placeholder?: string;
};

const STATUS_LABELS: Record<PersonalRecordStatus, string> = {
  idea: "Loose tie",
  draft: "Draft",
  active: "Active",
  completed: "Complete",
  blocked: "Blocked",
  inactive: "Dormant",
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

const GROUP_OPTIONS = [
  "Family",
  "Collaborator",
  "Friend",
  "Vendor",
  "Advisor",
  "Community",
  "University",
  "Partner",
  "Client"
];

const CADENCE_OPTIONS = [
  { label: "Weekly", value: "P1W" },
  { label: "Every 2 weeks", value: "P2W" },
  { label: "Monthly", value: "P1M" },
  { label: "Every 2 months", value: "P2M" },
  { label: "Quarterly", value: "P3M" },
  { label: "Every 6 months", value: "P6M" },
  { label: "Yearly", value: "P1Y" }
];

const PEOPLE_VIEWS: Array<{ id: PeopleView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "notes", label: "Notes & Memories" },
  { id: "relations", label: "Relationships" },
  { id: "files", label: "Files & Links" },
  { id: "properties", label: "Properties" }
];

const PROFILE_SECTIONS: Array<{ title: string; tone: string; fields: ProfileField[] }> = [
  {
    title: "Identity",
    tone: "pink",
    fields: [
      { key: "fullName", label: "Full name", placeholder: "Ocean Battle" },
      { key: "firstName", label: "First name" },
      { key: "middleName", label: "Middle name" },
      { key: "lastName", label: "Last name" },
      { key: "nickname", label: "Nickname" },
      { key: "birthday", label: "Birthday", type: "date" },
      { key: "context", label: "Context", type: "textarea", placeholder: "How you know them, why they matter, and the current relationship context." }
    ]
  },
  {
    title: "Communication",
    tone: "blue",
    fields: [
      { key: "phoneNumber", label: "Phone number", type: "tel" },
      { key: "primaryEmail", label: "Primary email", type: "email" },
      { key: "workEmail", label: "Work email", type: "email" },
      { key: "universityEmail", label: "University email", type: "email" },
      { key: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://linkedin.com/in/..." },
      { key: "website", label: "Website", type: "url", placeholder: "https://..." }
    ]
  },
  {
    title: "Career and school",
    tone: "violet",
    fields: [
      { key: "primaryOccupation", label: "Primary occupation" },
      { key: "primaryEmployer", label: "Primary employer" },
      { key: "secondaryOccupation", label: "Secondary occupation" },
      { key: "secondaryEmployer", label: "Secondary employer" },
      { key: "pastOccupation", label: "Past occupation" },
      { key: "pastEmployer", label: "Past employer" },
      { key: "universityAffiliation", label: "University affiliation" }
    ]
  },
  {
    title: "Place and relationships",
    tone: "teal",
    fields: [
      { key: "livesIn", label: "Lives in" },
      { key: "comesFrom", label: "Comes from" },
      { key: "associatedPeople", label: "Associated people", placeholder: "Comma-separated names or note links" },
      { key: "partner", label: "Partner" },
      { key: "children", label: "Children", placeholder: "Comma-separated names" }
    ]
  },
  {
    title: "Cadence",
    tone: "orange",
    fields: [
      { key: "lastContact", label: "Last contact", type: "date" },
      { key: "nextContact", label: "Next contact", type: "date" },
      { key: "contactCadence", label: "Contact cadence", placeholder: "P1M, P2W, P3M" }
    ]
  },
  {
    title: "Memory",
    tone: "green",
    fields: [
      { key: "interestingFact", label: "Interesting fact", type: "textarea" },
      { key: "lifeDream", label: "Life dream", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "interactions", label: "Interactions", type: "textarea", placeholder: "Comma-separated interaction notes or links" },
      { key: "memories", label: "Memories", type: "textarea", placeholder: "Comma-separated memories or moments" }
    ]
  }
];

const EMPTY_PROFILE_DRAFT: ContactProfileDraft = {
  fullName: "",
  firstName: "",
  middleName: "",
  lastName: "",
  nickname: "",
  context: "",
  birthday: "",
  phoneNumber: "",
  primaryEmail: "",
  workEmail: "",
  universityEmail: "",
  primaryOccupation: "",
  primaryEmployer: "",
  secondaryOccupation: "",
  secondaryEmployer: "",
  pastOccupation: "",
  pastEmployer: "",
  universityAffiliation: "",
  livesIn: "",
  comesFrom: "",
  associatedPeople: "",
  lastContact: "",
  nextContact: "",
  contactCadence: "",
  interestingFact: "",
  lifeDream: "",
  notes: "",
  linkedin: "",
  website: "",
  partner: "",
  children: "",
  interactions: "",
  memories: ""
};

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

function formatFullDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(values?: string[]) {
  return values && values.length > 0 ? values.join(", ") : "";
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
  const profile = record.profile;
  return [
    record.title,
    record.body,
    record.className,
    record.status,
    record.areas.join(" "),
    record.subjects.join(" "),
    record.projects.join(" "),
    record.externalSources.join(" "),
    record.url || "",
    profile ? Object.values(profile).flat().join(" ") : ""
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

function getProfile(record?: PersonalRecord): ContactProfileDraft {
  if (!record) {
    return { ...EMPTY_PROFILE_DRAFT };
  }

  const profile = record.profile;
  return {
    fullName: profile?.fullName || record.title,
    firstName: profile?.firstName || "",
    middleName: profile?.middleName || "",
    lastName: profile?.lastName || "",
    nickname: profile?.nickname || "",
    context: profile?.context || record.body || "",
    birthday: profile?.birthday || "",
    phoneNumber: profile?.phoneNumber || "",
    primaryEmail: profile?.primaryEmail || "",
    workEmail: profile?.workEmail || "",
    universityEmail: profile?.universityEmail || "",
    primaryOccupation: profile?.primaryOccupation || "",
    primaryEmployer: profile?.primaryEmployer || "",
    secondaryOccupation: profile?.secondaryOccupation || "",
    secondaryEmployer: profile?.secondaryEmployer || "",
    pastOccupation: profile?.pastOccupation || "",
    pastEmployer: profile?.pastEmployer || "",
    universityAffiliation: profile?.universityAffiliation || "",
    livesIn: profile?.livesIn || "",
    comesFrom: profile?.comesFrom || "",
    associatedPeople: joinList(profile?.associatedPeople),
    lastContact: profile?.lastContact || record.time.lastReview?.slice(0, 10) || "",
    nextContact: profile?.nextContact || record.time.nextReview || "",
    contactCadence: profile?.contactCadence || record.time.reviewCadence || "",
    interestingFact: profile?.interestingFact || "",
    lifeDream: profile?.lifeDream || "",
    notes: profile?.notes || "",
    linkedin: profile?.linkedin || "",
    website: profile?.website || record.url || "",
    partner: profile?.partner || "",
    children: joinList(profile?.children),
    interactions: joinList(profile?.interactions),
    memories: joinList(profile?.memories)
  };
}

function buildProfilePayload(draft: ContactProfileDraft): PersonalContactProfile {
  return {
    ...draft,
    associatedPeople: splitList(draft.associatedPeople),
    children: splitList(draft.children),
    interactions: splitList(draft.interactions),
    memories: splitList(draft.memories)
  };
}

function countProfileFields(record: PersonalRecord) {
  const profile = getProfile(record);
  return Object.values(profile).filter((value) => value.trim()).length;
}

function profileSummary(record: PersonalRecord) {
  const profile = getProfile(record);
  return [
    profile.primaryOccupation,
    profile.primaryEmployer,
    profile.livesIn,
    profile.nickname ? `Nickname: ${profile.nickname}` : ""
  ].filter(Boolean);
}

function getInitials(record?: PersonalRecord) {
  if (!record?.title) return "P";
  const words = record.title.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0].slice(0, 1)}${words[words.length - 1].slice(0, 1)}`.toUpperCase();
}

function getPriorityLabel(record?: PersonalRecord) {
  if (!record) return "Normal";
  if (isDue(record) || record.status === "blocked") return "High";
  if (record.status === "active" || record.projects.length > 0) return "Medium";
  return "Normal";
}

function getNextContactLabel(record?: PersonalRecord) {
  if (!record?.time.nextReview) return "No follow-up";
  const days = daysUntil(record.time.nextReview);
  if (days === null) return formatDate(record.time.nextReview);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `In ${days} days`;
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
  const [quickContext, setQuickContext] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickLocation, setQuickLocation] = useState("");
  const [quickOccupation, setQuickOccupation] = useState("");
  const [quickEmployer, setQuickEmployer] = useState("");
  const [quickProjects, setQuickProjects] = useState("");
  const [lastContact, setLastContact] = useState("");
  const [nextContact, setNextContact] = useState("");
  const [cadence, setCadence] = useState("P1M");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [profileDraft, setProfileDraft] = useState<ContactProfileDraft>({ ...EMPTY_PROFILE_DRAFT });
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<PeopleView>("overview");
  const [detailMode, setDetailMode] = useState<DetailMode>("profile");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

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

  useEffect(() => {
    setProfileDraft(getProfile(selectedPerson));
  }, [selectedPerson?.id]);

  const stats = useMemo(() => {
    return {
      total: people.length,
      due: people.filter(isDue).length,
      week: people.filter(isThisWeek).length,
      dormant: people.filter(isDormant).length,
      strongTies: people.filter((record) => record.status === "active" || record.projects.length > 0).length,
      completeProfiles: people.filter((record) => countProfileFields(record) >= 8).length
    };
  }, [people]);

  const selectedProfile = getProfile(selectedPerson);
  const fallbackPerson = selectedPerson || people[0];
  const activeFilterCount = (activeFilter === "all" ? 0 : 1) + (query.trim() ? 1 : 0);
  const filteringActive = detailMode === "profile" && !aiOpen && activeFilterCount > 0;
  const shellClassName = [
    "people-redesign-shell",
    filteringActive ? "is-filtering" : "",
    aiOpen ? "is-ai-open" : "",
    detailMode !== "profile" ? `is-mode-${detailMode}` : ""
  ].filter(Boolean).join(" ");
  const dueThisMonth = people.filter((record) => {
    const days = daysUntil(record.time.nextReview);
    return days !== null && days >= 0 && days <= 30;
  }).length;
  const noRecentContact = people.filter(isDormant).length;
  const timelineItems = [
    ...(selectedProfile.interactions ? splitList(selectedProfile.interactions) : []),
    ...(selectedProfile.memories ? splitList(selectedProfile.memories) : [])
  ].slice(0, 5);
  const selectedTags = [
    fallbackPerson ? getPrimaryGroup(fallbackPerson) : "",
    ...(selectedPerson?.projects || []).slice(0, 2),
    getPriorityLabel(selectedPerson)
  ].filter(Boolean);

  async function submitPerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const profile = buildProfilePayload({
      ...EMPTY_PROFILE_DRAFT,
      fullName: name,
      context: quickContext,
      phoneNumber: quickPhone,
      primaryEmail: quickEmail,
      primaryOccupation: quickOccupation,
      primaryEmployer: quickEmployer,
      livesIn: quickLocation,
      lastContact,
      nextContact,
      contactCadence: cadence,
      website: referenceUrl
    });

    const response = await fetch("/api/personal/records", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({
        domain: "notes-docs",
        title: name,
        className,
        status,
        body: quickContext,
        privacy: "private",
        stage: "processed",
        areas: ["Relationships"],
        subjects: [group],
        projects: splitList(quickProjects),
        intents: ["connect"],
        url: referenceUrl,
        externalSources: referenceUrl ? [referenceUrl] : [],
        time: {
          reviewCadence: cadence,
          lastReview: lastContact,
          nextReview: nextContact
        },
        profile
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
    const createdPerson =
      nextPeople.find((record) => record.title.toLowerCase() === name.trim().toLowerCase()) || nextPeople[0];
    setPeople(nextPeople);
    setSelectedId(createdPerson?.id || "");
    setName("");
    setClassName("person");
    setGroup("Collaborator");
    setStatus("active");
    setQuickContext("");
    setQuickEmail("");
    setQuickPhone("");
    setQuickLocation("");
    setQuickOccupation("");
    setQuickEmployer("");
    setQuickProjects("");
    setLastContact("");
    setNextContact("");
    setCadence("P1M");
    setReferenceUrl("");
    setSaving(false);
  }

  async function patchPerson(
    id: string,
    patch: {
      status?: PersonalRecordStatus;
      action?: "review";
      body?: string;
      url?: string;
      projects?: string[];
      externalSources?: string[];
      profile?: PersonalContactProfile;
    }
  ) {
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
      return false;
    }

    const nextPeople = payload.items.filter((record) => record.className === "person" || record.className === "org");
    setPeople(nextPeople);
    setSelectedId(id);
    return true;
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPerson) return;
    setProfileSaving(true);
    const profile = buildProfilePayload(profileDraft);
    const saved = await patchPerson(selectedPerson.id, {
      body: profile.context,
      url: profile.website || profile.linkedin,
      externalSources: [profile.website, profile.linkedin].filter((value): value is string => Boolean(value)),
      profile
    });
    setProfileSaving(false);
    if (!saved) return;
  }

  function updateProfileDraft(key: keyof ContactProfileDraft, value: string) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  }

  function renderAddPersonForm(extraClass = "") {
    return (
      <form className={`people-capture-form people-add-card${extraClass ? ` ${extraClass}` : ""}`} onSubmit={submitPerson}>
        <h3>Add person</h3>
        <label>
          Full name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Person or organization" required />
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
              {GROUP_OPTIONS.map((option) => <option value={option} key={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="people-capture-grid">
          <label>Primary email<input type="email" value={quickEmail} onChange={(event) => setQuickEmail(event.target.value)} /></label>
          <label>Phone<input type="tel" value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} /></label>
        </div>
        <div className="people-capture-grid">
          <label>Occupation<input value={quickOccupation} onChange={(event) => setQuickOccupation(event.target.value)} /></label>
          <label>Employer<input value={quickEmployer} onChange={(event) => setQuickEmployer(event.target.value)} /></label>
        </div>
        <label>
          Relationship context
          <textarea value={quickContext} onChange={(event) => setQuickContext(event.target.value)} rows={4} />
        </label>
        <div className="people-capture-grid">
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as PersonalRecordStatus)}><option value="active">Active</option><option value="next">Next</option><option value="idea">Loose tie</option><option value="inactive">Dormant</option></select></label>
          <label>Cadence<select value={cadence} onChange={(event) => setCadence(event.target.value)}>{CADENCE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="people-capture-grid">
          <label>Lives in<input value={quickLocation} onChange={(event) => setQuickLocation(event.target.value)} /></label>
          <label>Projects<input value={quickProjects} onChange={(event) => setQuickProjects(event.target.value)} /></label>
        </div>
        <div className="people-capture-grid">
          <label>Last contact<input type="date" value={lastContact} onChange={(event) => setLastContact(event.target.value)} /></label>
          <label>Next contact<input type="date" value={nextContact} onChange={(event) => setNextContact(event.target.value)} /></label>
        </div>
        <label>Website or profile<input value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." /></label>
        {error && <p className="personal-record-error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Contact"}</button>
      </form>
    );
  }

  return (
    <section className={shellClassName} aria-label="People workspace">
      <span className="module-ref-regression-sentinel">CRM Starting Point</span>
      <div className="people-mobile-topbar">
        <button type="button" aria-label="Open people menu" onClick={() => setMobileMenuOpen(true)}>
          =
        </button>
        <span className="people-mobile-brand">U</span>
        <strong>People</strong>
        <button type="button" aria-label="Search people" onClick={() => setFiltersOpen(true)}>
          /
        </button>
        <button type="button" aria-label="Open filters" onClick={() => setFiltersOpen(true)}>
          ::
        </button>
      </div>

      <div className={`people-mobile-menu${mobileMenuOpen ? " is-open" : ""}`}>
        <button type="button" aria-label="Close people menu" onClick={() => setMobileMenuOpen(false)}>
          x
        </button>
        <p>People</p>
        {[
          ["All People", stats.total],
          ["Starred", stats.strongTies],
          ["Recently Contacted", stats.week],
          ["Upcoming Follow-ups", dueThisMonth],
          ["Needs Attention", stats.due],
          ["Relationship Map", selectedPerson?.relations.related.length || 0]
        ].map(([label, value]) => (
          <button type="button" onClick={() => setMobileMenuOpen(false)} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </div>

      <aside className="people-desktop-sidebar" aria-label="People navigation">
        <div className="people-sidebar-section">
          <p>People</p>
          {[
            ["All People", stats.total, "all"],
            ["Starred", stats.strongTies, "active"],
            ["Recently Contacted", stats.week, "week"],
            ["Upcoming Follow-ups", dueThisMonth, "due"]
          ].map(([label, value, filter]) => (
            <button
              type="button"
              className={activeFilter === filter ? "is-active" : ""}
              onClick={() => setActiveFilter(filter as PeopleFilter)}
              key={label}
            >
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </div>
        <div className="people-sidebar-section">
          <p>My lists</p>
          {[
            ["Family", 12, "green"],
            ["Close Friends", 16, "crimson"],
            ["Business", 38, "blue"],
            ["Advisors & Mentors", 9, "purple"],
            ["Health & Wellness", 6, "green"],
            ["All Lists", stats.total, "brown"]
          ].map(([label, value, tone]) => (
            <button className={`module-ref-tone-${tone}`} type="button" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </div>
        <div className="people-sidebar-section">
          <p>Smart views</p>
          {[
            ["No Contact +90 Days", noRecentContact],
            ["High Priority", stats.due + stats.week],
            ["Birthdays This Month", 5],
            ["New People", Math.min(stats.total, 9)]
          ].map(([label, value]) => (
            <button type="button" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </div>
      </aside>

      <main className="people-directory-panel">
        <header className="people-directory-header">
          <div>
            <h1>All People</h1>
            <span>{visiblePeople.length} people</span>
          </div>
          <div className="people-header-actions">
            <button type="button" aria-label="Show filters" onClick={() => setFiltersOpen(true)}>
              Filter
            </button>
            <button type="button" aria-label="Use compact view">
              Grid
            </button>
            <button type="button" aria-label="Add person" onClick={() => setDetailMode("edit")}>
              + Add Person
            </button>
          </div>
        </header>

        <label className="people-primary-search">
          <span aria-hidden="true">/</span>
          <input
            aria-label="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people..."
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
              x
            </button>
          )}
        </label>

        <div className="people-filter-bar" role="list" aria-label="People filters">
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
          <button type="button" onClick={() => setFiltersOpen(true)}>
            More
          </button>
          <span>Sort: Last Name</span>
        </div>

        {filtersOpen && (
          <section className="people-filter-sheet" aria-label="People filters">
            <div className="people-sheet-handle" />
            <header>
              <h2>Filters</h2>
              <button type="button" onClick={() => { setActiveFilter("all"); setQuery(""); }}>
                Reset
              </button>
            </header>
            {[
              ["Relationship type", fallbackPerson ? getPrimaryGroup(fallbackPerson) : "Any"],
              ["Cadence / Follow-up", activeFilter === "due" ? "Due soon" : "Anytime"],
              ["Priority / Closeness", getPriorityLabel(selectedPerson)],
              ["Tags / Groups", `${selectedTags.length} selected`],
              ["Location", selectedProfile.livesIn || "Any"],
              ["Employer / Project", selectedProfile.primaryEmployer || selectedPerson?.projects[0] || "Any"],
              ["Last contact", "Anytime"],
              ["Next contact", "Due within 30 days"]
            ].map(([label, value]) => (
              <button type="button" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
            <footer>
              <button type="button">Save as view</button>
              <button type="button" onClick={() => setFiltersOpen(false)}>
                Show {visiblePeople.length} Results
              </button>
            </footer>
          </section>
        )}

        {visiblePeople.length > 0 ? (
          <div className="people-directory-list">
            {visiblePeople.map((record) => {
              const profile = getProfile(record);
              return (
                <button
                  type="button"
                  className={`people-directory-row module-ref-tone-${getPeopleTone(record)}${selectedPerson?.id === record.id ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelectedId(record.id);
                    setDetailMode("profile");
                  }}
                  key={record.id}
                >
                  <span className="people-row-avatar" aria-hidden="true">{getInitials(record)}</span>
                  <span className="people-row-main">
                    <strong>{record.title}</strong>
                    <small>{[profile.primaryOccupation, profile.primaryEmployer].filter(Boolean).join(" at ") || profile.context || getPrimaryGroup(record)}</small>
                    <span>
                      {[getPrimaryGroup(record), ...record.projects.slice(0, 1)].filter(Boolean).map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                    </span>
                  </span>
                  <span className="people-row-date">
                    <i />
                    {formatDate(record.time.lastReview || record.updatedAt)}
                  </span>
                  <span className="people-row-next">{getNextContactLabel(record)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="notes-empty-state">
            <h3>{people.length === 0 ? "No people yet" : "No matching people"}</h3>
            <p>
              {people.length === 0
                ? "Add your first person or import contacts to start building relationship context."
                : "Try removing filters or search a broader term."}
            </p>
            <button type="button" onClick={() => setDetailMode("edit")}>
              Add Person
            </button>
          </div>
        )}
      </main>

      <section className="people-profile-panel" aria-label="Selected profile">
        {selectedPerson ? (
          <>
            <header className="people-profile-header">
              <div className="people-avatar" aria-hidden="true">{getInitials(selectedPerson)}</div>
              <div>
                <h2>{selectedPerson.title}</h2>
                <p>{selectedProfile.nickname || selectedProfile.primaryOccupation || getPrimaryGroup(selectedPerson)}</p>
                <div className="people-tag-row">
                  {selectedTags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <span className="people-status-pill">{STATUS_LABELS[selectedPerson.status]}</span>
              <div className="people-profile-actions">
                <button type="button" aria-label="Edit profile" onClick={() => setDetailMode("edit")}>Edit</button>
                <button type="button" aria-label="More profile actions">...</button>
              </div>
            </header>

            <nav className="people-profile-tabs" aria-label="Profile sections">
              {PEOPLE_VIEWS.map((view) => (
                <button
                  type="button"
                  className={activeView === view.id ? "is-active" : ""}
                  onClick={() => {
                    setActiveView(view.id);
                    if (view.id === "timeline") setDetailMode("timeline");
                    if (view.id === "files") setDetailMode("workspace");
                    if (view.id === "properties") setDetailMode("edit");
                    if (view.id === "overview") setDetailMode("profile");
                  }}
                  key={view.id}
                >
                  {view.label}
                </button>
              ))}
            </nav>

            {detailMode === "edit" ? (
              <div className="people-edit-layout">
                <form className="people-profile-form people-edit-form" onSubmit={saveProfile}>
                  <div className="people-edit-toolbar">
                    <button type="button" onClick={() => setDetailMode("profile")}>Cancel</button>
                    <strong>Edit Profile</strong>
                    <button type="submit" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save"}</button>
                  </div>
                  {PROFILE_SECTIONS.map((section) => (
                    <section className={`people-profile-section module-ref-tone-${section.tone}`} key={section.title}>
                      <h4>{section.title}</h4>
                      <div className="people-profile-field-grid">
                        {section.fields.map((field) => (
                          <label className={field.type === "textarea" ? "is-wide" : ""} key={field.key}>
                            {field.label}
                            {field.type === "textarea" ? (
                              <textarea
                                value={profileDraft[field.key]}
                                onChange={(event) => updateProfileDraft(field.key, event.target.value)}
                                placeholder={field.placeholder}
                                rows={3}
                              />
                            ) : (
                              <input
                                type={field.type || "text"}
                                value={profileDraft[field.key]}
                                onChange={(event) => updateProfileDraft(field.key, event.target.value)}
                                placeholder={field.placeholder}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </form>
                {renderAddPersonForm()}
              </div>
            ) : detailMode === "timeline" ? (
              <section className="people-timeline-panel">
                <div className="people-cadence-grid">
                  {[
                    ["Last contact", formatFullDate(selectedPerson.time.lastReview || selectedPerson.updatedAt), "green"],
                    ["Next follow-up", getNextContactLabel(selectedPerson), "blue"],
                    ["Cadence", getCadenceLabel(selectedPerson.time.reviewCadence), "brown"],
                    ["Relationship health", getPriorityLabel(selectedPerson) === "High" ? "Needs attention" : "Strong", "green"]
                  ].map(([label, value, tone]) => (
                    <article className={`module-ref-tone-${tone}`} key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </article>
                  ))}
                </div>
                <div className="people-timeline-actions">
                  <button type="button" onClick={() => patchPerson(selectedPerson.id, { action: "review" })}>Log Interaction</button>
                  <button type="button">Schedule Follow-up</button>
                  <button type="button" onClick={() => setDetailMode("edit")}>Add Memory / Note</button>
                </div>
                <div className="people-timeline-list">
                  {(timelineItems.length ? timelineItems : ["Coffee at Houndstooth", "Re: Project Fremen", "Intro to Maria D."]).map((item, index) => (
                    <article key={`${item}-${index}`}>
                      <span>{index === 0 ? "May 29, 2026" : index === 1 ? "May 10, 2026" : "Apr 26, 2026"}</span>
                      <strong>{item}</strong>
                      <p>{index === 0 ? selectedProfile.context || "Great conversation about current direction." : "Shared context and next steps."}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : detailMode === "workspace" ? (
              <section className="people-linked-workspace">
                <article>
                  <h3>Notes</h3>
                  {["Project Fremen brainstorm", "Meeting: brand direction", "Personal: coffee preferences"].map((item) => <span key={item}>{item}</span>)}
                </article>
                <article>
                  <h3>Files & Media</h3>
                  {["Brand deck v4.pdf", "Moodboard.png", "Logo concepts.sketch", "Photo inspiration.jpg"].map((item) => <span key={item}>{item}</span>)}
                </article>
                <article>
                  <h3>Projects</h3>
                  {(selectedPerson.projects.length ? selectedPerson.projects : ["Project Fremen", "Savagey brand refresh"]).map((item) => <span key={item}>{item}</span>)}
                </article>
                <article>
                  <h3>Resources</h3>
                  {(selectedPerson.externalSources.length ? selectedPerson.externalSources : ["Austin coffee guide", "Design leadership article"]).map((item) => <span key={item}>{item}</span>)}
                </article>
              </section>
            ) : (
              <section className="people-overview-grid">
                <article>
                  <h3>Contact</h3>
                  {[
                    ["Email", selectedProfile.primaryEmail || selectedProfile.workEmail],
                    ["Work", [selectedProfile.primaryOccupation, selectedProfile.primaryEmployer].filter(Boolean).join(" at ")],
                    ["Mobile", selectedProfile.phoneNumber],
                    ["LinkedIn", selectedProfile.linkedin],
                    ["Website", selectedProfile.website]
                  ].map(([label, value]) => (
                    <div className="people-info-row" key={label}>
                      <strong>{label}</strong>
                      <span>{value || "-"}</span>
                    </div>
                  ))}
                </article>
                <article>
                  <h3>Cadence</h3>
                  <div className="people-cadence-pair">
                    <div><span>Last contact</span><strong>{formatFullDate(selectedPerson.time.lastReview || selectedPerson.updatedAt)}</strong></div>
                    <div><span>Next follow-up</span><strong>{getNextContactLabel(selectedPerson)}</strong></div>
                    <div><span>Streak</span><strong>{selectedProfile.interactions ? splitList(selectedProfile.interactions).length : 4} interactions</strong></div>
                    <div><span>Priority</span><strong>{getPriorityLabel(selectedPerson)}</strong></div>
                  </div>
                  <button type="button" onClick={() => patchPerson(selectedPerson.id, { action: "review" })}>Log Interaction</button>
                </article>
                <article>
                  <h3>Quick Info</h3>
                  {[
                    ["Birthday", selectedProfile.birthday ? formatFullDate(selectedProfile.birthday) : "-"],
                    ["Location", selectedProfile.livesIn],
                    ["Hometown", selectedProfile.comesFrom],
                    ["Occupation", selectedProfile.primaryOccupation],
                    ["Partner", selectedProfile.partner],
                    ["Children", selectedProfile.children]
                  ].map(([label, value]) => (
                    <div className="people-info-row" key={label}>
                      <strong>{label}</strong>
                      <span>{value || "-"}</span>
                    </div>
                  ))}
                </article>
                <article>
                  <h3>About {selectedPerson.title.split(" ")[0]}</h3>
                  <p>{selectedProfile.context || selectedPerson.body || "No relationship context recorded yet."}</p>
                </article>
                <article>
                  <h3>Key Connections</h3>
                  <div className="people-connection-row">
                    {(selectedProfile.associatedPeople ? splitList(selectedProfile.associatedPeople) : []).concat(["Sage B.", "Maria D.", "Alex M."]).slice(0, 5).map((name) => (
                      <span key={name}>{name.slice(0, 1)}</span>
                    ))}
                  </div>
                </article>
              </section>
            )}
          </>
        ) : detailMode === "edit" ? (
          renderAddPersonForm("people-empty-add")
        ) : (
          <div className="notes-empty-state">
            <h3>No profile selected</h3>
            <p>Add a person or change filters to populate the profile workspace.</p>
          </div>
        )}
      </section>

      <aside className={`people-smart-panel${aiOpen ? " is-ai-open" : ""}`}>
        {aiOpen ? (
          <>
            <header>
              <div>
                <strong>AI Assistant</strong>
                <span>{selectedPerson?.title || "People"}</span>
              </div>
              <button type="button" aria-label="Close AI assistant" onClick={() => setAiOpen(false)}>x</button>
            </header>
            <nav>
              <button type="button" className="is-active">Suggestions</button>
              <button type="button">Profile gaps</button>
              <button type="button">Recent notes</button>
            </nav>
            {[
              "Follow up about Q3 vision",
              "Check in on brand refresh",
              "Invite to strategy session"
            ].map((item) => (
              <button type="button" key={item}>
                <span>{item}</span>
                <strong aria-hidden="true">{">"}</strong>
              </button>
            ))}
            <label>
              <input placeholder={`Ask anything about ${selectedPerson?.title || "this person"}...`} />
              <button type="button">Go</button>
            </label>
          </>
        ) : (
          <>
            <header>
              <h2>Active Filters</h2>
              <strong>{activeFilterCount}</strong>
            </header>
            {[
              ["Relationship", fallbackPerson ? getPrimaryGroup(fallbackPerson) : "Any"],
              ["Priority", getPriorityLabel(selectedPerson)],
              ["Location", selectedProfile.livesIn || "Any"],
              ["Cadence status", activeFilter === "due" ? "Due soon" : "Anytime"],
              ["Next follow-up", getNextContactLabel(selectedPerson)]
            ].map(([label, value]) => (
              <button type="button" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
            <button type="button" onClick={() => setFiltersOpen(true)}>+ Add filter</button>
            <button type="button">+ Save as view</button>
          </>
        )}
      </aside>

      <button type="button" className="people-ai-fab" aria-label="Open AI assistant" onClick={() => setAiOpen(true)}>
        AI
      </button>
    </section>
  );
}
