"use client";

import Link from "next/link";
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
    setPeople(nextPeople);
    setSelectedId(nextPeople[0]?.id || "");
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

  return (
    <>
      <header className="module-ref-header people-workspace-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-pink">People</p>
          <h1>People and contact cadence</h1>
          <p>
            A richer contact system for identity, communication, career, place, relationships,
            cadence, memories, and linked operating context.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input
            aria-label="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, emails, places, context"
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
          ["Complete profiles", String(stats.completeProfiles), "blue"],
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
                {visiblePeople.map((record) => {
                  const profile = getProfile(record);
                  const summary = profileSummary(record);
                  return (
                    <button
                      type="button"
                      className={`people-contact-row module-ref-tone-${getPeopleTone(record)}${selectedPerson?.id === record.id ? " is-selected" : ""}`}
                      onClick={() => setSelectedId(record.id)}
                      key={record.id}
                    >
                      <strong>{record.title}</strong>
                      <span>{getPrimaryGroup(record)}</span>
                      <span>{summary[0] || labelize(record.className)}</span>
                      <span>{profile.primaryEmail || profile.phoneNumber || "No contact method"}</span>
                      <span>Next {formatDate(record.time.nextReview)}</span>
                      <span>{countProfileFields(record)} fields</span>
                      <span className="module-ref-open-button">Select</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="notes-empty-state">
                <h3>No people match this view</h3>
                <p>Adjust the filter or add a person with a useful follow-up cadence.</p>
              </div>
            )}
          </article>

          <section className="people-lower-grid">
            <article className="module-ref-lane people-capture-panel">
              <h3>Quick add contact</h3>
              <form className="people-capture-form" onSubmit={submitPerson}>
                <label>
                  Full name
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
                <div className="people-capture-grid">
                  <label>
                    Primary email
                    <input type="email" value={quickEmail} onChange={(event) => setQuickEmail(event.target.value)} />
                  </label>
                  <label>
                    Phone
                    <input type="tel" value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} />
                  </label>
                </div>
                <div className="people-capture-grid">
                  <label>
                    Occupation
                    <input value={quickOccupation} onChange={(event) => setQuickOccupation(event.target.value)} />
                  </label>
                  <label>
                    Employer
                    <input value={quickEmployer} onChange={(event) => setQuickEmployer(event.target.value)} />
                  </label>
                </div>
                <label>
                  Relationship context
                  <textarea
                    value={quickContext}
                    onChange={(event) => setQuickContext(event.target.value)}
                    placeholder="How you know them, what matters, and what the next useful contact should be about."
                    rows={4}
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
                    Lives in
                    <input value={quickLocation} onChange={(event) => setQuickLocation(event.target.value)} />
                  </label>
                  <label>
                    Projects
                    <input value={quickProjects} onChange={(event) => setQuickProjects(event.target.value)} placeholder="Project Fremen" />
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
                <label>
                  Website or profile
                  <input value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." />
                </label>
                {error && <p className="personal-record-error">{error}</p>}
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Contact"}
                </button>
              </form>
            </article>

            <article className="module-ref-lane people-profile-editor">
              <div className="module-ref-section-title">
                <h3>Profile properties</h3>
                <span>{selectedPerson ? countProfileFields(selectedPerson) : 0} filled</span>
              </div>
              {selectedPerson ? (
                <form className="people-profile-form" onSubmit={saveProfile}>
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
                  <button type="submit" disabled={profileSaving}>
                    {profileSaving ? "Saving profile..." : "Save Profile Properties"}
                  </button>
                </form>
              ) : (
                <p>Add or select a person to edit their full profile properties.</p>
              )}
            </article>
          </section>
        </div>

        <aside className="module-ref-rail-stack people-profile-rail">
          <section className="module-ref-detail people-contact-card">
            <div className="people-avatar" aria-hidden="true">
              {(selectedPerson?.title || "P").slice(0, 1).toUpperCase()}
            </div>
            <div className="module-ref-detail-title">
              <span className="module-ref-eyebrow module-ref-tone-pink">Selected profile</span>
              <h2>{selectedPerson?.title || "No person selected"}</h2>
            </div>
            {selectedPerson ? (
              <>
                <p>{getProfile(selectedPerson).context || "No relationship context recorded yet."}</p>
                <div className="people-contact-methods">
                  {[
                    ["Email", getProfile(selectedPerson).primaryEmail || getProfile(selectedPerson).workEmail],
                    ["Phone", getProfile(selectedPerson).phoneNumber],
                    ["Lives in", getProfile(selectedPerson).livesIn],
                    ["Work", [getProfile(selectedPerson).primaryOccupation, getProfile(selectedPerson).primaryEmployer].filter(Boolean).join(" at ")]
                  ].map(([label, value]) => (
                    <div className="module-ref-field" key={label}>
                      <strong>{label}</strong>
                      <span>{value || "-"}</span>
                    </div>
                  ))}
                </div>
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
                <div className="module-ref-review-card people-memory-card">
                  <h3>Memory prompts</h3>
                  <div className="module-ref-field-list">
                    {[
                      ["Interesting fact", getProfile(selectedPerson).interestingFact || "-"],
                      ["Life dream", getProfile(selectedPerson).lifeDream || "-"],
                      ["Partner", getProfile(selectedPerson).partner || "-"],
                      ["Children", getProfile(selectedPerson).children || "-"],
                      ["Memories", getProfile(selectedPerson).memories || "-"]
                    ].map(([label, value]) => (
                      <div className="module-ref-field" key={label}>
                        <strong>{label}</strong>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="module-ref-review-card">
                  <h3>Connected context</h3>
                  <div className="module-ref-field-list">
                    {[
                      ["Projects", displayList(selectedPerson.projects)],
                      ["Areas", displayList(selectedPerson.areas)],
                      ["Associated people", getProfile(selectedPerson).associatedPeople || "-"],
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
              <h2>Profile model</h2>
              <span>{totalRecords}</span>
            </div>
            <div className="module-ref-field-list">
              {[
                ["Identity", "Names, nickname, birthday, relationship context"],
                ["Communication", "Phone, primary/work/university email, LinkedIn, website"],
                ["Career", "Current, secondary, past, and university affiliation"],
                ["Relationships", "Associated people, partner, children, interactions, memories"],
                ["Cadence", "Last/next contact and contact cadence stay filterable"]
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
