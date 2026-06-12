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
type PeopleSidebarView =
  | "all"
  | "starred"
  | "recent"
  | "upcoming"
  | "attention"
  | "relationship-map"
  | "family"
  | "close-friends"
  | "business"
  | "advisors-mentors"
  | "neighbors"
  | "health-wellness"
  | "all-lists"
  | "no-contact-90"
  | "high-priority"
  | "birthdays-month"
  | "new-people"
  | "profile-gaps"
  | "dormant"
  | "import-export"
  | "duplicates"
  | "recently-deleted"
  | "customize";
type PeopleSortMode = "last-name" | "recent-contact" | "next-follow-up" | "priority";
type PeopleListMode = "list" | "compact" | "grid";
type PeopleAiTab = "glance" | "suggestions" | "gaps" | "notes";

type MemoryCategory =
  | "personal_context"
  | "preferences"
  | "important_dates"
  | "shared_history"
  | "work_context"
  | "family_context"
  | "follow_up_notes"
  | "open_loops"
  | "gifts_ideas"
  | "sensitive_private";

type SidebarItemConfig = {
  id: PeopleSidebarView;
  label: string;
  tone?: string;
  surface?: "list" | "profile" | "utility";
};

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

const MEMORY_CATEGORIES: Array<{ id: MemoryCategory; label: string; tone: string }> = [
  { id: "personal_context", label: "Personal context", tone: "green" },
  { id: "preferences", label: "Preferences", tone: "cyan" },
  { id: "important_dates", label: "Important dates", tone: "orange" },
  { id: "shared_history", label: "Shared history", tone: "purple" },
  { id: "work_context", label: "Work context", tone: "blue" },
  { id: "family_context", label: "Family/context", tone: "pink" },
  { id: "follow_up_notes", label: "Follow-up notes", tone: "orange" },
  { id: "open_loops", label: "Open loops", tone: "crimson" },
  { id: "gifts_ideas", label: "Gifts/ideas", tone: "green" },
  { id: "sensitive_private", label: "Sensitive/private", tone: "brown" }
];

const PEOPLE_SIDEBAR_SECTIONS: Array<{ title: string; items: SidebarItemConfig[] }> = [
  {
    title: "People",
    items: [
      { id: "all", label: "All People" },
      { id: "starred", label: "Starred", tone: "pink" },
      { id: "recent", label: "Recently Contacted", tone: "green" },
      { id: "upcoming", label: "Upcoming Follow-ups", tone: "orange" },
      { id: "attention", label: "Needs Attention", tone: "crimson" },
      { id: "relationship-map", label: "Relationship Map", tone: "purple", surface: "profile" }
    ]
  },
  {
    title: "My lists",
    items: [
      { id: "family", label: "Family", tone: "green" },
      { id: "close-friends", label: "Close Friends", tone: "pink" },
      { id: "business", label: "Business", tone: "blue" },
      { id: "advisors-mentors", label: "Advisors & Mentors", tone: "purple" },
      { id: "neighbors", label: "Neighbors", tone: "orange" },
      { id: "health-wellness", label: "Health & Wellness", tone: "cyan" },
      { id: "all-lists", label: "All Lists", tone: "brown", surface: "utility" }
    ]
  },
  {
    title: "Smart views",
    items: [
      { id: "no-contact-90", label: "No Contact > 90 Days", tone: "brown" },
      { id: "high-priority", label: "High Priority", tone: "crimson" },
      { id: "birthdays-month", label: "Birthdays This Month", tone: "orange" },
      { id: "new-people", label: "New People", tone: "green" },
      { id: "profile-gaps", label: "Profile Gaps", tone: "blue" },
      { id: "dormant", label: "Dormant", tone: "brown" }
    ]
  },
  {
    title: "Data",
    items: [
      { id: "import-export", label: "Import / Export", surface: "utility" },
      { id: "duplicates", label: "Duplicates", tone: "orange", surface: "utility" },
      { id: "recently-deleted", label: "Recently Deleted", tone: "brown", surface: "utility" },
      { id: "customize", label: "Customize People", tone: "blue", surface: "utility" }
    ]
  }
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

function getLastName(record: PersonalRecord) {
  const profile = getProfile(record);
  const name = profile.lastName || record.title.split(/\s+/).filter(Boolean).slice(-1)[0] || record.title;
  return name.toLowerCase();
}

function isRecentContact(record: PersonalRecord) {
  const last = record.time.lastReview || record.updatedAt;
  if (!last) return false;
  const date = new Date(last);
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= 1000 * 60 * 60 * 24 * 30;
}

function isNoContact90(record: PersonalRecord) {
  const last = record.time.lastReview || getProfile(record).lastContact;
  if (!last) return true;
  const date = new Date(last);
  return Number.isNaN(date.getTime()) || Date.now() - date.getTime() > 1000 * 60 * 60 * 24 * 90;
}

function isBirthdayThisMonth(record: PersonalRecord) {
  const birthday = getProfile(record).birthday;
  if (!birthday) return false;
  const date = new Date(birthday);
  return !Number.isNaN(date.getTime()) && date.getMonth() === new Date().getMonth();
}

function isNewPerson(record: PersonalRecord) {
  const date = new Date(record.createdAt);
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= 1000 * 60 * 60 * 24 * 30;
}

function getProfileGaps(record: PersonalRecord) {
  const profile = getProfile(record);
  return [
    !profile.primaryEmail && !profile.workEmail && !profile.phoneNumber ? "Primary contact method" : "",
    !profile.birthday ? "Birthday" : "",
    !profile.livesIn ? "Location" : "",
    !profile.context ? "Relationship context" : "",
    !record.time.reviewCadence ? "Cadence" : "",
    !profile.associatedPeople ? "Connections" : ""
  ].filter(Boolean);
}

function hasGroupLike(record: PersonalRecord, terms: string[]) {
  const haystack = [
    record.subjects.join(" "),
    record.areas.join(" "),
    record.projects.join(" "),
    getProfile(record).context
  ].join(" ").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function matchesSidebarView(record: PersonalRecord, view: PeopleSidebarView, starredIds: Set<string>) {
  if (view === "all") return true;
  if (view === "starred") return starredIds.has(record.id);
  if (view === "recent") return isRecentContact(record);
  if (view === "upcoming") {
    const days = daysUntil(record.time.nextReview);
    return days !== null && days >= 0 && days <= 30;
  }
  if (view === "attention") return isDue(record) || getPriorityLabel(record) === "High" || getProfileGaps(record).length > 1;
  if (view === "relationship-map") return record.relations.related.length > 0 || getProfile(record).associatedPeople.length > 0;
  if (view === "family") return hasGroupLike(record, ["family", "parent", "sibling", "child"]);
  if (view === "close-friends") return hasGroupLike(record, ["close friend", "friend"]);
  if (view === "business") return hasGroupLike(record, ["business", "collaborator", "partner", "client", "work"]);
  if (view === "advisors-mentors") return hasGroupLike(record, ["advisor", "mentor"]);
  if (view === "neighbors") return hasGroupLike(record, ["neighbor"]);
  if (view === "health-wellness") return hasGroupLike(record, ["health", "wellness", "doctor", "therapy", "trainer"]);
  if (view === "no-contact-90") return isNoContact90(record);
  if (view === "high-priority") return getPriorityLabel(record) === "High";
  if (view === "birthdays-month") return isBirthdayThisMonth(record);
  if (view === "new-people") return isNewPerson(record);
  if (view === "profile-gaps") return getProfileGaps(record).length > 0;
  if (view === "dormant") return isDormant(record);
  return true;
}

function sortPeople(records: PersonalRecord[], sortMode: PeopleSortMode) {
  return [...records].sort((left, right) => {
    if (sortMode === "recent-contact") {
      return new Date(right.time.lastReview || right.updatedAt).getTime() - new Date(left.time.lastReview || left.updatedAt).getTime();
    }
    if (sortMode === "next-follow-up") {
      return (new Date(left.time.nextReview || "9999-12-31").getTime()) - (new Date(right.time.nextReview || "9999-12-31").getTime());
    }
    if (sortMode === "priority") {
      const priorityRank: Record<string, number> = { High: 0, Medium: 1, Normal: 2 };
      return priorityRank[getPriorityLabel(left)] - priorityRank[getPriorityLabel(right)];
    }
    return getLastName(left).localeCompare(getLastName(right));
  });
}

export default function PeopleWorkspace({ initialPeople, totalRecords }: PeopleWorkspaceProps) {
  const [people, setPeople] = useState(initialPeople);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PeopleFilter>("all");
  const [activeSidebarView, setActiveSidebarView] = useState<PeopleSidebarView>("all");
  const [sortMode, setSortMode] = useState<PeopleSortMode>("last-name");
  const [listMode, setListMode] = useState<PeopleListMode>("list");
  const [starredIds, setStarredIds] = useState<Set<string>>(() => new Set(initialPeople.filter((record) => record.status === "next").map((record) => record.id)));
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
  const [addingPerson, setAddingPerson] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState<PeopleAiTab>("suggestions");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [utilityNotice, setUtilityNotice] = useState("");
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("personal_context");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryPinned, setMemoryPinned] = useState(true);
  const [memorySaving, setMemorySaving] = useState(false);
  const [relationshipDraft, setRelationshipDraft] = useState("");
  const [relationshipType, setRelationshipType] = useState("collaborator");
  const [relationshipSaving, setRelationshipSaving] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  const visiblePeople = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const utilityViews: PeopleSidebarView[] = ["all-lists", "import-export", "duplicates", "recently-deleted", "customize"];
    if (utilityViews.includes(activeSidebarView)) {
      return [];
    }
    const matches = people.filter((record) => {
      if (!matchesSidebarView(record, activeSidebarView, starredIds)) return false;
      if (!matchesFilter(record, activeFilter)) return false;
      if (!normalizedQuery) return true;
      return getSearchText(record).includes(normalizedQuery);
    });
    return sortPeople(matches, sortMode);
  }, [activeFilter, activeSidebarView, people, query, sortMode, starredIds]);

  const selectedPerson = useMemo(() => {
    return people.find((record) => record.id === selectedId) || visiblePeople[0] || people[0];
  }, [people, selectedId, visiblePeople]);

  useEffect(() => {
    setProfileDraft(getProfile(selectedPerson));
  }, [selectedPerson?.id]);

  useEffect(() => {
    document.body.classList.toggle("people-ai-panel-open", aiOpen);
    return () => {
      document.body.classList.remove("people-ai-panel-open");
    };
  }, [aiOpen]);

  const stats = useMemo(() => {
    const countFor = (view: PeopleSidebarView) => people.filter((record) => matchesSidebarView(record, view, starredIds)).length;
    return {
      total: people.length,
      due: people.filter(isDue).length,
      week: people.filter(isThisWeek).length,
      dormant: people.filter(isDormant).length,
      strongTies: people.filter((record) => record.status === "active" || record.projects.length > 0).length,
      completeProfiles: people.filter((record) => countProfileFields(record) >= 8).length,
      starred: starredIds.size,
      recent: countFor("recent"),
      upcoming: countFor("upcoming"),
      attention: countFor("attention"),
      relationshipMap: countFor("relationship-map"),
      noContact90: countFor("no-contact-90"),
      highPriority: countFor("high-priority"),
      birthdaysMonth: countFor("birthdays-month"),
      newPeople: countFor("new-people"),
      profileGaps: countFor("profile-gaps"),
      family: countFor("family"),
      closeFriends: countFor("close-friends"),
      business: countFor("business"),
      advisorsMentors: countFor("advisors-mentors"),
      neighbors: countFor("neighbors"),
      healthWellness: countFor("health-wellness")
    };
  }, [people, starredIds]);

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
  const activeSidebarItem = PEOPLE_SIDEBAR_SECTIONS.flatMap((section) => section.items).find((item) => item.id === activeSidebarView);
  const activeViewLabel = activeSidebarItem?.label || "All People";
  const profileGaps = selectedPerson ? getProfileGaps(selectedPerson) : [];
  const selectedMemories = splitList(selectedProfile.memories);
  const selectedInteractions = splitList(selectedProfile.interactions);
  const selectedChildren = splitList(selectedProfile.children);
  const associatedPeople = splitList(selectedProfile.associatedPeople);
  const relatedRecordLabels = selectedPerson
    ? selectedPerson.relations.related.map((id) => people.find((record) => record.id === id)?.title || id)
    : [];
  const connectionItems = Array.from(new Set([...associatedPeople, ...relatedRecordLabels]));
  const importantDates = [
    ["Birthday", selectedProfile.birthday ? formatFullDate(selectedProfile.birthday) : "Not recorded"],
    ["Last contact", selectedPerson ? formatFullDate(selectedPerson.time.lastReview || selectedProfile.lastContact || selectedPerson.updatedAt) : "-"],
    ["Next follow-up", selectedPerson ? getNextContactLabel(selectedPerson) : "-"],
    ["Added", selectedPerson ? formatFullDate(selectedPerson.createdAt) : "-"]
  ];
  const aiSuggestions = [
    selectedPerson && isDue(selectedPerson) ? `Follow up with ${selectedPerson.title} today.` : "",
    profileGaps.length > 0 ? `Fill ${profileGaps[0].toLowerCase()} so this profile is easier to use later.` : "",
    selectedInteractions.length === 0 ? "Log the first real interaction to establish relationship history." : "",
    selectedProfile.birthday ? `Birthday is ${formatDate(selectedProfile.birthday)}. Consider adding a reminder note.` : "",
    selectedPerson?.projects.length ? `Review linked project context: ${selectedPerson.projects[0]}.` : ""
  ].filter(Boolean);
  const aiRecentNotes = Array.from(new Set([...selectedMemories, ...selectedProfile.notes.split("\n").filter(Boolean)]));
  const timelineItems = [
    ...selectedInteractions,
    ...selectedMemories
  ].slice(0, 5);
  const selectedTags = [
    fallbackPerson ? getPrimaryGroup(fallbackPerson) : "",
    ...(selectedPerson?.projects || []).slice(0, 2),
    getPriorityLabel(selectedPerson)
  ].filter(Boolean);

  function getSidebarCount(view: PeopleSidebarView) {
    const counts: Partial<Record<PeopleSidebarView, number>> = {
      all: stats.total,
      starred: stats.starred,
      recent: stats.recent,
      upcoming: stats.upcoming,
      attention: stats.attention,
      "relationship-map": stats.relationshipMap,
      family: stats.family,
      "close-friends": stats.closeFriends,
      business: stats.business,
      "advisors-mentors": stats.advisorsMentors,
      neighbors: stats.neighbors,
      "health-wellness": stats.healthWellness,
      "all-lists": 6,
      "no-contact-90": stats.noContact90,
      "high-priority": stats.highPriority,
      "birthdays-month": stats.birthdaysMonth,
      "new-people": stats.newPeople,
      "profile-gaps": stats.profileGaps,
      dormant: stats.dormant,
      duplicates: 0,
      "recently-deleted": 0
    };
    return counts[view];
  }

  function selectSidebarView(item: SidebarItemConfig) {
    setActiveSidebarView(item.id);
    setActiveFilter("all");
    setFiltersOpen(false);
    setMobileMenuOpen(false);
    setUtilityNotice("");
    setAddingPerson(false);
    setActionNotice("");
    if (item.surface === "profile" || item.id === "relationship-map") {
      setActiveView("relations");
      setDetailMode("profile");
      return;
    }
    if (item.surface === "utility") {
      setUtilityNotice(`${item.label} is ready as a People workspace surface. Actions that would change stored data stay disabled until the matching backend support exists.`);
      setDetailMode("profile");
      return;
    }
    setDetailMode("profile");
  }

  function selectProfileView(view: PeopleView) {
    setActiveView(view);
    setAddingPerson(false);
    setActionNotice("");
    if (view === "timeline") {
      setDetailMode("timeline");
    } else if (view === "files") {
      setDetailMode("workspace");
    } else if (view === "properties") {
      setDetailMode("edit");
    } else {
      setDetailMode("profile");
    }
  }

  async function saveProfileDraft(nextDraft: ContactProfileDraft) {
    if (!selectedPerson) return false;
    const profile = buildProfilePayload(nextDraft);
    return patchPerson(selectedPerson.id, {
      body: profile.context,
      url: profile.website || profile.linkedin,
      externalSources: [profile.website, profile.linkedin].filter((value): value is string => Boolean(value)),
      profile
    });
  }

  async function saveMemory() {
    if (!selectedPerson || !memoryDraft.trim()) return;
    setMemorySaving(true);
    const categoryLabel = MEMORY_CATEGORIES.find((category) => category.id === memoryCategory)?.label || "Memory";
    const currentMemories = splitList(selectedProfile.memories);
    const currentNotes = selectedProfile.notes ? `${selectedProfile.notes}\n` : "";
    const marker = memoryPinned ? "Pinned" : "Saved";
    const entry = `${marker} ${categoryLabel}: ${memoryDraft.trim()}`;
    const saved = await saveProfileDraft({
      ...selectedProfile,
      memories: [...currentMemories, entry].join(", "),
      notes: `${currentNotes}${entry}`.trim()
    });
    setMemorySaving(false);
    if (saved) {
      setMemoryDraft("");
      setMemoryPinned(true);
      setActiveView("notes");
      setDetailMode("profile");
      setActionNotice("Memory saved to this profile.");
    }
  }

  async function saveRelationship() {
    if (!selectedPerson || !relationshipDraft.trim()) return;
    setRelationshipSaving(true);
    const label = labelize(relationshipType);
    const currentPeople = splitList(selectedProfile.associatedPeople);
    const entry = `${relationshipDraft.trim()} (${label})`;
    const saved = await saveProfileDraft({
      ...selectedProfile,
      associatedPeople: [...currentPeople, entry].join(", ")
    });
    setRelationshipSaving(false);
    if (saved) {
      setRelationshipDraft("");
      setActiveView("relations");
      setDetailMode("profile");
      setActionNotice("Relationship link saved. This does not delete or alter either person.");
    }
  }

  function toggleStar(record: PersonalRecord) {
    setStarredIds((current) => {
      const next = new Set(current);
      if (next.has(record.id)) {
        next.delete(record.id);
      } else {
        next.add(record.id);
      }
      return next;
    });
  }

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
    setAddingPerson(false);
    setDetailMode("profile");
    setActiveView("overview");
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
    const saved = await saveProfileDraft(profileDraft);
    setProfileSaving(false);
    if (!saved) return;
  }

  function openAddPerson() {
    setAddingPerson(true);
    setDetailMode("edit");
    setActiveView("overview");
    setProfileMenuOpen(false);
  }

  function openEditProfile() {
    setAddingPerson(false);
    setDetailMode("edit");
    setActiveView("properties");
    setProfileMenuOpen(false);
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
        {PEOPLE_SIDEBAR_SECTIONS.map((section) => (
          <div className="people-sidebar-section" key={section.title}>
            <p>{section.title}</p>
            {section.items.map((item) => {
              const count = getSidebarCount(item.id);
              return (
                <button
                  type="button"
                  className={`${item.tone ? `module-ref-tone-${item.tone}` : ""}${activeSidebarView === item.id ? " is-active" : ""}`}
                  onClick={() => selectSidebarView(item)}
                  key={item.id}
                >
                  <span>{item.label}</span>
                  {typeof count === "number" ? <strong>{count}</strong> : <strong aria-hidden="true">{">"}</strong>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <aside className="people-desktop-sidebar" aria-label="People navigation">
        {PEOPLE_SIDEBAR_SECTIONS.map((section) => (
          <div className="people-sidebar-section" key={section.title}>
            <p>{section.title}</p>
            {section.items.map((item) => {
              const count = getSidebarCount(item.id);
              return (
                <button
                  className={`${item.tone ? `module-ref-tone-${item.tone}` : ""}${activeSidebarView === item.id ? " is-active" : ""}`}
                  type="button"
                  onClick={() => selectSidebarView(item)}
                  key={item.id}
                >
                  <span>{item.label}</span>
                  {typeof count === "number" ? <strong>{count}</strong> : <strong aria-hidden="true">{">"}</strong>}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <main className="people-directory-panel">
        <header className="people-directory-header">
          <div>
            <h1>{activeViewLabel}</h1>
            <span>{visiblePeople.length} people</span>
          </div>
          <div className="people-header-actions">
            <button type="button" aria-label="Show filters" onClick={() => setFiltersOpen(true)}>
              Filter
            </button>
            <button
              type="button"
              aria-label="Toggle list density"
              onClick={() => setListMode((current) => current === "list" ? "compact" : current === "compact" ? "grid" : "list")}
            >
              {listMode === "list" ? "Compact" : listMode === "compact" ? "Grid" : "List"}
            </button>
            <button type="button" aria-label="Add person" onClick={openAddPerson}>
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
          <label className="people-sort-control">
            Sort
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as PeopleSortMode)}>
              <option value="last-name">Last Name</option>
              <option value="recent-contact">Recent Contact</option>
              <option value="next-follow-up">Next Follow-up</option>
              <option value="priority">Priority</option>
            </select>
          </label>
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
              <button type="button" onClick={() => setActionNotice(`${label} filter is visible here; advanced filter editing is a shell action for this slice.`)} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
            <footer>
              <button type="button" onClick={() => setActionNotice("Saved People views are a shell action until custom view persistence is connected.")}>Save as view</button>
              <button type="button" onClick={() => setFiltersOpen(false)}>
                Show {visiblePeople.length} Results
              </button>
            </footer>
          </section>
        )}

        {utilityNotice ? (
          <section className="people-utility-surface">
            <h2>{activeViewLabel}</h2>
            <p>{utilityNotice}</p>
            {activeSidebarView === "all-lists" && (
              <div className="people-utility-grid">
                {PEOPLE_SIDEBAR_SECTIONS[1].items.slice(0, 6).map((item) => (
                  <button type="button" onClick={() => selectSidebarView(item)} key={item.id}>
                    <span>{item.label}</span>
                    <strong>{getSidebarCount(item.id) || 0}</strong>
                  </button>
                ))}
              </div>
            )}
            {activeSidebarView === "duplicates" && (
              <div className="notes-empty-state">
                <h3>No duplicate groups found</h3>
                <p>Duplicate review will compare names, emails, and phone numbers when enough records exist.</p>
              </div>
            )}
            {activeSidebarView === "import-export" && (
              <div className="people-utility-grid">
                <button type="button" disabled>Import preview not connected</button>
                <button type="button" disabled>Export people data</button>
              </div>
            )}
            {activeSidebarView === "customize" && (
              <div className="people-utility-grid">
                <button type="button" disabled>Manage custom fields</button>
                <button type="button" disabled>Cadence defaults</button>
                <button type="button" disabled>Visible sections</button>
              </div>
            )}
          </section>
        ) : visiblePeople.length > 0 ? (
          <div className={`people-directory-list is-${listMode}`}>
            {visiblePeople.map((record) => {
              const profile = getProfile(record);
              return (
                <button
                  type="button"
                  className={`people-directory-row module-ref-tone-${getPeopleTone(record)}${selectedPerson?.id === record.id ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelectedId(record.id);
                    setAddingPerson(false);
                    setDetailMode("profile");
                    setActiveView("overview");
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
            <button type="button" onClick={openAddPerson}>
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
                <button
                  type="button"
                  aria-label={starredIds.has(selectedPerson.id) ? "Unstar profile" : "Star profile"}
                  onClick={() => toggleStar(selectedPerson)}
                >
                  {starredIds.has(selectedPerson.id) ? "Starred" : "Star"}
                </button>
                <button type="button" aria-label="Edit profile" onClick={openEditProfile}>Edit</button>
                <button type="button" aria-label="More profile actions" onClick={() => setProfileMenuOpen((current) => !current)}>...</button>
              </div>
              {profileMenuOpen && (
                <div className="people-action-menu">
                  <button type="button" onClick={openEditProfile}>Open properties</button>
                  <button type="button" onClick={() => { setActiveSidebarView("all-lists"); setUtilityNotice("Choose a list to review membership. Editing list definitions is not connected yet."); setProfileMenuOpen(false); }}>Add to list</button>
                  <button type="button" onClick={() => { patchPerson(selectedPerson.id, { status: "inactive" }); setProfileMenuOpen(false); }}>Set dormant</button>
                <button type="button" disabled>Export contact</button>
                </div>
              )}
            </header>

            <nav className="people-profile-tabs" aria-label="Profile sections">
              {PEOPLE_VIEWS.map((view) => (
                <button
                  type="button"
                  className={activeView === view.id ? "is-active" : ""}
                  onClick={() => selectProfileView(view.id)}
                  key={view.id}
                >
                  {view.label}
                </button>
              ))}
            </nav>

            {addingPerson ? (
              renderAddPersonForm("people-empty-add")
            ) : detailMode === "edit" ? (
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
                  <button type="button" onClick={() => { setActiveView("properties"); setDetailMode("edit"); setActionNotice("Edit Next contact to schedule the next follow-up."); }}>Schedule Follow-up</button>
                  <button type="button" onClick={() => { setActiveView("notes"); setDetailMode("profile"); }}>Add Memory / Note</button>
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
                  {(selectedProfile.notes ? selectedProfile.notes.split("\n").filter(Boolean) : ["Project Fremen brainstorm", "Meeting: brand direction", "Personal: coffee preferences"]).map((item) => <span key={item}>{item}</span>)}
                  <button type="button" onClick={() => { setActiveView("notes"); setDetailMode("profile"); }}>Create Note</button>
                </article>
                <article>
                  <h3>Files & Media</h3>
                  {["Brand deck v4.pdf", "Moodboard.png", "Logo concepts.sketch", "Photo inspiration.jpg"].map((item) => <span key={item}>{item}</span>)}
                  <button type="button" onClick={() => setActionNotice("File linking is a shell action until the Files picker is connected here.")}>Link Existing</button>
                </article>
                <article>
                  <h3>Projects</h3>
                  {(selectedPerson.projects.length ? selectedPerson.projects : ["Project Fremen", "Savagey brand refresh"]).map((item) => <span key={item}>{item}</span>)}
                  <button type="button" onClick={() => setActionNotice("Project creation stays in the project workspace; this page can link existing context.")}>Link Project</button>
                </article>
                <article>
                  <h3>Resources</h3>
                  {(selectedPerson.externalSources.length ? selectedPerson.externalSources : ["Austin coffee guide", "Design leadership article"]).map((item) => <span key={item}>{item}</span>)}
                  <button type="button" onClick={() => setActionNotice("Resource linking is a shell action until the resource picker is connected here.")}>Add Resource</button>
                </article>
              </section>
            ) : activeView === "notes" ? (
              <section className="people-notes-panel">
                <div className="people-section-toolbar">
                  <div>
                    <h3>Notes & Memories</h3>
                    <span>{selectedMemories.length} memories, {selectedInteractions.length} interactions</span>
                  </div>
                  <button type="button" onClick={() => setActionNotice("Search is scoped to this rendered profile. Stored note search remains handled by the Notes workspace.")}>
                    Search this profile
                  </button>
                </div>

                {actionNotice && <p className="people-notice">{actionNotice}</p>}

                <div className="people-notes-grid">
                  <section className="people-memory-composer module-ref-tone-green">
                    <h4>Add memory or note</h4>
                    <div className="people-memory-controls">
                      <label>
                        Category
                        <select value={memoryCategory} onChange={(event) => setMemoryCategory(event.target.value as MemoryCategory)}>
                          {MEMORY_CATEGORIES.map((category) => (
                            <option value={category.id} key={category.id}>{category.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="people-check-row">
                        <input type="checkbox" checked={memoryPinned} onChange={(event) => setMemoryPinned(event.target.checked)} />
                        Pin as memory
                      </label>
                    </div>
                    <textarea
                      value={memoryDraft}
                      onChange={(event) => setMemoryDraft(event.target.value)}
                      placeholder="Preference, story, open loop, important context, or follow-up note..."
                      rows={5}
                    />
                    <div className="people-memory-actions">
                      <button type="button" onClick={saveMemory} disabled={memorySaving || !memoryDraft.trim()}>
                        {memorySaving ? "Saving..." : "Save Memory"}
                      </button>
                      <button type="button" onClick={() => setMemoryDraft("")}>Clear</button>
                    </div>
                  </section>

                  <section className="people-memory-list">
                    <h4>Pinned memories</h4>
                    {(selectedMemories.length ? selectedMemories : ["No pinned memories yet. Add context you want surfaced before the next conversation."]).map((item, index) => (
                      <article className="people-memory-card" key={`${item}-${index}`}>
                        <span>{item.includes(":") ? item.split(":")[0] : "Memory"}</span>
                        <p>{item.includes(":") ? item.split(":").slice(1).join(":").trim() : item}</p>
                        <div>
                          <button type="button" onClick={() => setActionNotice("Pin state is preserved in the saved memory text for now.")}>Pin</button>
                          <button type="button" onClick={() => setActionNotice("Editing a single memory opens the profile properties until per-memory rows exist.")}>Edit</button>
                          <button type="button" onClick={() => setActionNotice("Delete is intentionally disabled here to avoid destructive memory loss.")}>Archive</button>
                        </div>
                      </article>
                    ))}
                  </section>

                  <section className="people-memory-list">
                    <h4>Recent notes</h4>
                    {(selectedProfile.notes ? selectedProfile.notes.split("\n").filter(Boolean) : ["No profile notes yet."]).slice(0, 6).map((item, index) => (
                      <article className="people-memory-card is-note" key={`${item}-${index}`}>
                        <span>{index === 0 ? "Latest" : "Note"}</span>
                        <p>{item}</p>
                        <div>
                          <button type="button" onClick={() => { setActiveView("properties"); setDetailMode("edit"); }}>Open</button>
                          <button type="button" onClick={() => setActionNotice("Linking notes is non-destructive and will be wired to existing Notes objects in a later slice.")}>Link</button>
                        </div>
                      </article>
                    ))}
                  </section>

                  <section className="people-memory-list">
                    <h4>Important dates & open loops</h4>
                    {importantDates.map(([label, value]) => (
                      <article className="people-memory-row" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </article>
                    ))}
                    {(profileGaps.length ? profileGaps : ["No major profile gaps detected."]).map((gap) => (
                      <article className="people-memory-row" key={gap}>
                        <span>Profile gap</span>
                        <strong>{gap}</strong>
                      </article>
                    ))}
                  </section>
                </div>
              </section>
            ) : activeView === "relations" ? (
              <section className="people-relationships-panel">
                <div className="people-section-toolbar">
                  <div>
                    <h3>Relationships</h3>
                    <span>{connectionItems.length} linked people and context markers</span>
                  </div>
                  <button type="button" onClick={() => setActionNotice("Relationship links are saved onto this profile without changing other records.")}>
                    Add Relationship
                  </button>
                </div>

                {actionNotice && <p className="people-notice">{actionNotice}</p>}

                <div className="people-relationships-grid">
                  <section className="people-relation-map">
                    <h4>Relationship map</h4>
                    <div className="people-relation-node is-center">
                      <strong>{selectedPerson.title}</strong>
                      <span>{selectedProfile.nickname || getPrimaryGroup(selectedPerson)}</span>
                    </div>
                    <div className="people-relation-spokes">
                      {(connectionItems.length ? connectionItems : ["No associated people yet"]).slice(0, 8).map((item) => (
                        <button type="button" className="people-relation-node" key={item} onClick={() => setActionNotice(`${item} is linked as context. Opening linked profiles will come with cross-record relation support.`)}>
                          <strong>{item}</strong>
                          <span>Associated</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="people-relation-form module-ref-tone-purple">
                    <h4>Add contextual link</h4>
                    <label>
                      Person or context
                      <input value={relationshipDraft} onChange={(event) => setRelationshipDraft(event.target.value)} placeholder="Name, family member, collaborator, introduced by..." />
                    </label>
                    <label>
                      Relationship type
                      <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)}>
                        <option value="family">Family</option>
                        <option value="partner">Partner</option>
                        <option value="child">Child</option>
                        <option value="friend">Friend</option>
                        <option value="collaborator">Collaborator</option>
                        <option value="mentor">Advisor / Mentor</option>
                        <option value="introduced-by">Introduced by</option>
                        <option value="mutual">Mutual connection</option>
                      </select>
                    </label>
                    <button type="button" onClick={saveRelationship} disabled={relationshipSaving || !relationshipDraft.trim()}>
                      {relationshipSaving ? "Saving..." : "Save Relationship"}
                    </button>
                  </section>

                  <section className="people-relation-list">
                    <h4>Family and close context</h4>
                    {[
                      ["Partner", selectedProfile.partner || "Not recorded"],
                      ["Children", selectedChildren.length ? selectedChildren.join(", ") : "Not recorded"],
                      ["How you know them", selectedProfile.context || selectedPerson.body || "Not recorded"],
                      ["Introduced by", connectionItems.find((item) => item.toLowerCase().includes("introduced")) || "Not recorded"]
                    ].map(([label, value]) => (
                      <article key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </article>
                    ))}
                  </section>

                  <section className="people-relation-list">
                    <h4>Shared workspace context</h4>
                    {(selectedPerson.projects.length ? selectedPerson.projects : ["No shared projects linked yet"]).map((project) => (
                      <article key={project}>
                        <span>Project</span>
                        <strong>{project}</strong>
                      </article>
                    ))}
                    {(selectedInteractions.length ? selectedInteractions : ["No relationship timeline entries yet"]).slice(0, 4).map((item) => (
                      <article key={item}>
                        <span>Timeline</span>
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </section>
                </div>
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
                    {(connectionItems.length ? connectionItems : ["Sage B.", "Maria D.", "Alex M."]).slice(0, 5).map((name) => (
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
              {[
                ["glance", "At a glance"],
                ["suggestions", "Suggestions"],
                ["gaps", "Profile gaps"],
                ["notes", "Recent notes"]
              ].map(([id, label]) => (
                <button
                  type="button"
                  className={aiTab === id ? "is-active" : ""}
                  onClick={() => setAiTab(id as PeopleAiTab)}
                  key={id}
                >
                  {label}
                </button>
              ))}
            </nav>
            <section className="people-ai-state">
              <strong>Assistant shell ready</strong>
              <p>Assistant responses are not connected yet. This panel is using local profile context and deterministic suggestions.</p>
            </section>
            {aiTab === "glance" && (
              <div className="people-ai-section">
                {[
                  ["Relationship", selectedPerson ? getPrimaryGroup(selectedPerson) : "Any"],
                  ["Priority", getPriorityLabel(selectedPerson)],
                  ["Last contact", selectedPerson ? formatFullDate(selectedPerson.time.lastReview || selectedPerson.updatedAt) : "-"],
                  ["Next follow-up", selectedPerson ? getNextContactLabel(selectedPerson) : "-"]
                ].map(([label, value]) => (
                  <article key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </article>
                ))}
              </div>
            )}
            {aiTab === "suggestions" && (
              <div className="people-ai-section">
                {(aiSuggestions.length ? aiSuggestions : ["No urgent suggestions. Keep the profile updated after the next interaction."]).map((item) => (
                  <button type="button" className="people-ai-suggestion" key={item} onClick={() => setActionNotice(item)}>
                    <span>{item}</span>
                    <strong aria-hidden="true">{">"}</strong>
                  </button>
                ))}
              </div>
            )}
            {aiTab === "gaps" && (
              <div className="people-ai-section">
                {(profileGaps.length ? profileGaps : ["No major profile gaps detected."]).map((gap) => (
                  <button type="button" className="people-ai-suggestion" key={gap} onClick={() => { setActiveView("properties"); setDetailMode("edit"); }}>
                    <span>{gap}</span>
                    <strong>Fill</strong>
                  </button>
                ))}
              </div>
            )}
            {aiTab === "notes" && (
              <div className="people-ai-section">
                {(aiRecentNotes.length ? aiRecentNotes.slice(0, 6) : ["No recent notes or memories yet."]).map((item) => (
                  <article key={item}>
                    <span>Context</span>
                    <strong>{item}</strong>
                  </article>
                ))}
              </div>
            )}
            <label>
              <input placeholder={`Ask anything about ${selectedPerson?.title || "this person"}...`} />
              <button type="button" onClick={() => setActionNotice("Assistant chat is not connected yet; local suggestions above are available now.")}>Go</button>
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
              <button type="button" onClick={() => setFiltersOpen(true)} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
            <button type="button" onClick={() => setFiltersOpen(true)}>+ Add filter</button>
            <button type="button" onClick={() => setActionNotice("Saved People views are a shell action until custom view persistence is connected.")}>+ Save as view</button>
          </>
        )}
      </aside>

      <button type="button" className="people-ai-fab" aria-label="Open AI assistant" onClick={() => setAiOpen(true)}>
        AI
      </button>
    </section>
  );
}
