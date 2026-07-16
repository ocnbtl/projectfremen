"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import { peopleCreateInputToLegacy, peopleUpdateInputToLegacy } from "../lib/modules/people/legacy-adapter";
import { getModuleRoute, getNativeObjectRoute } from "../lib/native-objects/routes";
import { parsePeopleUrlState, serializePeopleUrlState } from "../lib/native-objects/url-state";
import type {
  PersonalContactProfile,
  PersonalRecord,
  PersonalRecordClass,
  PersonalRecordStatus
} from "../lib/personal-records-store";
import SharedAIDock from "./admin-shell/SharedAIDock";
import ConfirmationSheet from "./operational/ConfirmationSheet";
import DetailTabs from "./operational/DetailTabs";
import SystemState from "./operational/SystemState";

type RecordsResponse = {
  ok: boolean;
  items?: PersonalRecord[];
  error?: string;
};

type PeopleWorkspaceProps = {
  initialPeople: PersonalRecord[];
  totalRecords: number;
  initialSelectedId?: string;
  initialMode?: "directory" | "profile" | "new" | "edit";
  initialLoadError?: string;
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
type InteractionKind = "call" | "message" | "email" | "meeting" | "note" | "milestone";

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

const PEOPLE_DIRTY_HISTORY_GUARD = "__unigentamosPeopleDirtyGuard";
const PEOPLE_HISTORY_BACK_DESTINATION = "__people_history_back__";

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

function parseDisplayDate(value: string) {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatFullDate(value?: string) {
  if (!value) return "-";
  const date = parseDisplayDate(value);
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

function splitTextEntries(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed.includes("\n")
    ? trimmed.split(/\n+/).map((item) => item.trim()).filter(Boolean)
    : splitList(trimmed);
}

function joinTextEntries(values?: string[]) {
  return values && values.length > 0 ? values.join("\n") : "";
}

function daysUntil(value?: string) {
  if (!value) return null;
  const date = parseDisplayDate(value);
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
  const last = record.time.lastReview ? parseDisplayDate(record.time.lastReview) : null;
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
    interactions: joinTextEntries(profile?.interactions),
    memories: joinTextEntries(profile?.memories)
  };
}

function buildProfilePayload(draft: ContactProfileDraft): PersonalContactProfile {
  return {
    ...draft,
    associatedPeople: splitList(draft.associatedPeople),
    children: splitList(draft.children),
    interactions: splitTextEntries(draft.interactions),
    memories: splitTextEntries(draft.memories)
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

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function followUpDueAt(record: PersonalRecord) {
  const recordedDueAt = record.time.nextReview || getProfile(record).nextContact;
  if (recordedDueAt) {
    const recordedDate = parseDisplayDate(recordedDueAt);
    if (!Number.isNaN(recordedDate.getTime())) return toDateInputValue(recordedDate);
  }

  const oneWeekFromToday = new Date();
  oneWeekFromToday.setDate(oneWeekFromToday.getDate() + 7);
  return toDateInputValue(oneWeekFromToday);
}

function followUpCreationRoute(record: PersonalRecord) {
  const objectType = record.className === "org" ? "organization" : "person";
  const params = new URLSearchParams({
    create: "follow-up",
    sourceModule: "people",
    sourceObjectType: objectType,
    sourceObjectId: record.id,
    sourceLabel: record.title,
    sourceRoute: getNativeObjectRoute({
      module: "people",
      objectType,
      objectId: record.id
    }),
    dueAt: followUpDueAt(record)
  });
  return `${getModuleRoute("personal_ops")}/follow-ups?${params.toString()}`;
}

function getLastName(record: PersonalRecord) {
  const profile = getProfile(record);
  const name = profile.lastName || record.title.split(/\s+/).filter(Boolean).slice(-1)[0] || record.title;
  return name.toLowerCase();
}

function isRecentContact(record: PersonalRecord) {
  const last = record.time.lastReview || record.updatedAt;
  if (!last) return false;
  const date = parseDisplayDate(last);
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= 1000 * 60 * 60 * 24 * 30;
}

function isNoContact90(record: PersonalRecord) {
  const last = record.time.lastReview || getProfile(record).lastContact;
  if (!last) return true;
  const date = parseDisplayDate(last);
  return Number.isNaN(date.getTime()) || Date.now() - date.getTime() > 1000 * 60 * 60 * 24 * 90;
}

function isBirthdayThisMonth(record: PersonalRecord) {
  const birthday = getProfile(record).birthday;
  if (!birthday) return false;
  const date = parseDisplayDate(birthday);
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

export default function PeopleWorkspace({
  initialPeople,
  totalRecords,
  initialSelectedId,
  initialMode = "directory",
  initialLoadError = ""
}: PeopleWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialUrlState = parsePeopleUrlState(searchParams);
  const [people, setPeople] = useState(initialPeople);
  const [query, setQuery] = useState(initialUrlState.query);
  const [activeFilter, setActiveFilter] = useState<PeopleFilter>(initialUrlState.filter);
  const [activeSidebarView, setActiveSidebarView] = useState<PeopleSidebarView>(initialUrlState.sidebar);
  const [sortMode, setSortMode] = useState<PeopleSortMode>(initialUrlState.sort);
  const [listMode, setListMode] = useState<PeopleListMode>(initialUrlState.view);
  // Star storage is an open product decision. Do not overload lifecycle `next`
  // or pretend this client-only preference is durable.
  const [starredIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState(initialSelectedId || initialUrlState.person || initialPeople[0]?.id || "");
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(() => new Set());
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
  const [activeView, setActiveView] = useState<PeopleView>(initialMode === "edit" ? "properties" : initialUrlState.tab);
  const [detailMode, setDetailMode] = useState<DetailMode>(initialMode === "new" || initialMode === "edit" ? "edit" : "profile");
  const [addingPerson, setAddingPerson] = useState(initialMode === "new");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(initialUrlState.ai);
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
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionKind, setInteractionKind] = useState<InteractionKind>("meeting");
  const [interactionDate, setInteractionDate] = useState("");
  const [interactionTitle, setInteractionTitle] = useState("");
  const [interactionSummary, setInteractionSummary] = useState("");
  const [interactionMeaningful, setInteractionMeaningful] = useState(true);
  const [interactionSaving, setInteractionSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [editorReturnView, setEditorReturnView] = useState<PeopleView>("overview");
  const interactionDialogRef = useRef<HTMLFormElement>(null);
  const interactionReturnFocusRef = useRef<HTMLElement | null>(null);
  const interactionSavingRef = useRef(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const filterSheetRef = useRef<HTMLElement>(null);
  const dirtyHistoryGuardRef = useRef<string | null>(null);
  const suppressDirtyPopRef = useRef(false);

  const searchParamKey = searchParams.toString();

  useEffect(() => {
    const next = parsePeopleUrlState(searchParams);
    setQuery(next.query);
    setActiveFilter(next.filter);
    setActiveSidebarView(next.sidebar);
    setSortMode(next.sort);
    setListMode(next.view);
    setAiOpen(next.ai);
    if (initialSelectedId || next.person) {
      setSelectedId(initialSelectedId || next.person);
    }
    if (initialMode === "edit") {
      setEditorReturnView(next.tab === "properties" ? "overview" : next.tab);
      setActiveView("properties");
      setDetailMode("edit");
      setAddingPerson(false);
    } else if (initialMode === "new") {
      setAddingPerson(true);
      setDetailMode("edit");
    } else {
      setActiveView(next.tab);
      setDetailMode(
        next.tab === "timeline"
          ? "timeline"
          : next.tab === "files"
            ? "workspace"
            : next.tab === "properties"
              ? "edit"
              : "profile"
      );
      setAddingPerson(false);
    }
  }, [initialMode, initialSelectedId, searchParamKey]);

  useEffect(() => {
    if (!interactionOpen) return;
    interactionReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = interactionDialogRef.current;
    dialog?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const handleDialogKey = (event: KeyboardEvent) => {
      if (!interactionDialogRef.current) return;
      if (event.key === "Escape" && !interactionSavingRef.current) {
        event.preventDefault();
        setInteractionOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        interactionDialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKey);
    return () => {
      document.removeEventListener("keydown", handleDialogKey);
      interactionReturnFocusRef.current?.focus();
    };
  }, [interactionOpen]);

  useEffect(() => {
    interactionSavingRef.current = interactionSaving;
  }, [interactionSaving]);

  useEffect(() => {
    const container = mobileMenuOpen ? mobileMenuRef.current : filtersOpen ? filterSheetRef.current : null;
    if (!container) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(
      container.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
      )
    );
    controls()[0]?.focus();
    const handleOverlayKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (mobileMenuOpen) setMobileMenuOpen(false);
        if (filtersOpen) setFiltersOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = controls();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleOverlayKey);
    return () => {
      document.removeEventListener("keydown", handleOverlayKey);
      previousFocus?.focus();
    };
  }, [filtersOpen, mobileMenuOpen]);

  function buildPeopleDestination(
    partial: Partial<ReturnType<typeof parsePeopleUrlState>>,
    options: { path?: string } = {}
  ) {
    const path = options.path || pathname;
    const params = serializePeopleUrlState(
      {
        query,
        filter: activeFilter,
        sort: sortMode,
        view: listMode,
        sidebar: activeSidebarView,
        person: path === getModuleRoute("people") ? selectedId : "",
        tab: activeView,
        ai: aiOpen,
        ...partial
      },
      searchParams
    );
    return `${path}${params.size ? `?${params.toString()}` : ""}`;
  }

  function updatePeopleUrl(
    partial: Partial<ReturnType<typeof parsePeopleUrlState>>,
    options: { path?: string; history?: "push" | "replace"; native?: boolean } = {}
  ) {
    const destination = buildPeopleDestination(partial, options);
    if (options.native && typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", destination);
      return;
    }
    if (options.history === "push") {
      router.push(destination, { scroll: false });
    } else {
      router.replace(destination, { scroll: false });
    }
  }

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
    return people.find((record) => record.id === selectedId) || visiblePeople[0];
  }, [people, selectedId, visiblePeople]);

  useEffect(() => {
    setProfileDraft(getProfile(selectedPerson));
  }, [selectedPerson?.id]);

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
  const fallbackPerson = selectedPerson || visiblePeople[0];
  const activeFilterCount = (activeFilter === "all" ? 0 : 1) + (query.trim() ? 1 : 0);
  const filteringActive = detailMode === "profile" && activeFilterCount > 0;
  const mobileSurface = addingPerson || initialMode === "new" || detailMode === "edit" || initialMode === "edit"
    ? "editor"
    : pathname === getModuleRoute("people")
      ? "directory"
      : "profile";
  const shellClassName = [
    "people-redesign-shell",
    filteringActive ? "is-filtering" : "",
    `is-mobile-${mobileSurface}`,
    detailMode !== "profile" ? `is-mode-${detailMode}` : ""
  ].filter(Boolean).join(" ");
  const activeSidebarItem = PEOPLE_SIDEBAR_SECTIONS.flatMap((section) => section.items).find((item) => item.id === activeSidebarView);
  const activeViewLabel = activeSidebarItem?.label || "All People";
  const resolvedUtilityNotice = activeSidebarItem?.surface === "utility"
    ? utilityNotice || `${activeViewLabel} is a read-only People utility in this checkpoint. Stored-data actions remain disabled until matching backend support exists.`
    : utilityNotice;
  const profileGaps = selectedPerson ? getProfileGaps(selectedPerson) : [];
  const selectedMemories = splitTextEntries(selectedProfile.memories);
  const selectedInteractions = splitTextEntries(selectedProfile.interactions);
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
  const timelineItems = [
    ...selectedInteractions,
    ...selectedMemories
  ].slice(0, 5);
  const selectedTags = [
    fallbackPerson ? getPrimaryGroup(fallbackPerson) : "",
    ...(selectedPerson?.projects || []).slice(0, 2),
    getPriorityLabel(selectedPerson)
  ].filter(Boolean);
  const addFormDirty = [
    name,
    quickContext,
    quickEmail,
    quickPhone,
    quickLocation,
    quickOccupation,
    quickEmployer,
    quickProjects,
    lastContact,
    nextContact,
    referenceUrl
  ].some((value) => value.trim().length > 0)
    || className !== "person"
    || group !== "Collaborator"
    || status !== "active"
    || cadence !== "P1M";
  const profileFormDirty = Boolean(
    selectedPerson && JSON.stringify(profileDraft) !== JSON.stringify(getProfile(selectedPerson))
  );
  const editorDirty = addingPerson ? addFormDirty : detailMode === "edit" && profileFormDirty;

  function guardDirtyNavigation(destination: string) {
    if (!editorDirty) return false;
    setPendingNavigation(destination);
    setCancelConfirmOpen(true);
    return true;
  }

  useEffect(() => {
    if (!editorDirty) return;
    if (!dirtyHistoryGuardRef.current) {
      const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      dirtyHistoryGuardRef.current = marker;
      window.history.pushState(
        { ...(window.history.state || {}), [PEOPLE_DIRTY_HISTORY_GUARD]: marker },
        "",
        window.location.href
      );
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleLinkNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      event.preventDefault();
      setPendingNavigation(`${destination.pathname}${destination.search}${destination.hash}`);
      setCancelConfirmOpen(true);
    };
    const handlePopState = () => {
      if (suppressDirtyPopRef.current) {
        suppressDirtyPopRef.current = false;
        return;
      }
      if (!dirtyHistoryGuardRef.current) return;
      suppressDirtyPopRef.current = true;
      window.history.forward();
      setPendingNavigation(PEOPLE_HISTORY_BACK_DESTINATION);
      setCancelConfirmOpen(true);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleLinkNavigation, true);
    };
  }, [editorDirty]);

  useEffect(() => {
    if (editorDirty || !dirtyHistoryGuardRef.current) return;
    void releaseDirtyHistoryGuard();
  }, [editorDirty]);

  useEffect(() => {
    if (detailMode !== "edit") return;
    const handleEditorShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const selector = addingPerson ? ".people-capture-form" : ".people-edit-form";
        document.querySelector<HTMLFormElement>(selector)?.requestSubmit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        requestCancelEditor();
      }
    };
    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [addingPerson, detailMode, editorDirty, selectedPerson?.id]);

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
    const destination = buildPeopleDestination(
      {
        sidebar: item.id,
        filter: "all",
        person: "",
        tab: item.surface === "profile" || item.id === "relationship-map" ? "relations" : "overview"
      },
      { path: getModuleRoute("people") }
    );
    if (guardDirtyNavigation(destination)) return;
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
      updatePeopleUrl(
        { sidebar: item.id, filter: "all", tab: "relations", person: "" },
        { path: getModuleRoute("people"), history: "push" }
      );
      return;
    }
    if (item.surface === "utility") {
      setUtilityNotice(`${item.label} is ready as a People workspace surface. Actions that would change stored data stay disabled until the matching backend support exists.`);
      setDetailMode("profile");
      updatePeopleUrl(
        { sidebar: item.id, filter: "all", person: "" },
        { path: getModuleRoute("people"), history: "push" }
      );
      return;
    }
    setDetailMode("profile");
    updatePeopleUrl(
      { sidebar: item.id, filter: "all", person: "" },
      { path: getModuleRoute("people"), history: "push" }
    );
  }

  function selectProfileView(view: PeopleView) {
    if (!selectedPerson) return;
    if (view === "properties") {
      setEditorReturnView(activeView === "properties" ? "overview" : activeView);
    }
    const destination = buildPeopleDestination(
      { tab: view, person: "" },
      {
        path: getNativeObjectRoute({
          module: "people",
          objectType: selectedPerson.className === "org" ? "organization" : "person",
          objectId: selectedPerson.id,
          mode: view === "properties" ? "edit" : "view"
        })
      }
    );
    if (guardDirtyNavigation(destination)) return;
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
    router.push(destination, { scroll: false });
  }

  function selectPerson(record: PersonalRecord) {
    const destination = buildPeopleDestination(
      { person: "", tab: "overview" },
      {
        path: getNativeObjectRoute({
          module: "people",
          objectType: record.className === "org" ? "organization" : "person",
          objectId: record.id
        })
      }
    );
    if (guardDirtyNavigation(destination)) return;
    setSelectedId(record.id);
    setAddingPerson(false);
    setDetailMode("profile");
    setActiveView("overview");
    router.push(destination, { scroll: false });
  }

  function toggleBatchSelection(id: string) {
    setBatchSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveProfileDraft(nextDraft: ContactProfileDraft) {
    if (!selectedPerson) return false;
    const profile = buildProfilePayload(nextDraft);
    const previousProfileSources = new Set(
      [selectedProfile.website, selectedProfile.linkedin].filter((value): value is string => Boolean(value))
    );
    const preservedSources = selectedPerson.externalSources.filter((source) => !previousProfileSources.has(source));
    const profileSources = [profile.website, profile.linkedin].filter((value): value is string => Boolean(value));
    return patchPerson(selectedPerson.id, {
      title: profile.fullName || selectedPerson.title,
      body: profile.context,
      url: profile.website || profile.linkedin,
      externalSources: Array.from(new Set([...preservedSources, ...profileSources])),
      time: {
        lastReview: profile.lastContact || undefined,
        nextReview: profile.nextContact || undefined,
        reviewCadence: profile.contactCadence || undefined
      },
      profile
    });
  }

  async function saveMemory() {
    if (!selectedPerson || !memoryDraft.trim()) return;
    setMemorySaving(true);
    const categoryLabel = MEMORY_CATEGORIES.find((category) => category.id === memoryCategory)?.label || "Memory";
    const currentMemories = splitTextEntries(selectedProfile.memories);
    const currentNotes = selectedProfile.notes ? `${selectedProfile.notes}\n` : "";
    const marker = memoryPinned ? "Pinned" : "Saved";
    const entry = `${marker} ${categoryLabel}: ${memoryDraft.trim()}`;
    const saved = await saveProfileDraft({
      ...selectedProfile,
      memories: joinTextEntries([...currentMemories, entry]),
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

  function openInteractionComposer() {
    if (!selectedPerson) return;
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setInteractionDate(localDate);
    setInteractionKind("meeting");
    setInteractionTitle("");
    setInteractionSummary("");
    setInteractionMeaningful(true);
    setInteractionOpen(true);
    setActionNotice("");
  }

  async function saveInteraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPerson || !interactionDate || !interactionTitle.trim()) return;
    setInteractionSaving(true);
    const kindLabel = labelize(interactionKind);
    const entry = [interactionDate, kindLabel, interactionTitle.trim(), interactionSummary.trim()]
      .filter(Boolean)
      .join(" • ");
    const profile = buildProfilePayload({
      ...selectedProfile,
      interactions: joinTextEntries([...selectedInteractions, entry]),
      lastContact: interactionMeaningful ? interactionDate : selectedProfile.lastContact
    });
    const saved = await patchPerson(selectedPerson.id, {
      profile,
      time: interactionMeaningful
        ? {
            lastReview: interactionDate,
            reviewCadence: selectedPerson.time.reviewCadence || selectedProfile.contactCadence || undefined
          }
        : undefined
    });
    setInteractionSaving(false);
    if (!saved) return;
    setInteractionOpen(false);
    setInteractionTitle("");
    setInteractionSummary("");
    setActionNotice("Interaction saved to this People profile and cadence refreshed.");
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

    const legacyInput = peopleCreateInputToLegacy({
      fullName: name.trim(),
      type: className === "org" ? "organization" : "person",
      status,
      context: quickContext,
      profile,
      time: {
        reviewCadence: cadence,
        lastReview: lastContact,
        nextReview: nextContact
      },
      areas: ["Relationships"],
      subjects: [group],
      projects: splitList(quickProjects),
      externalSources: referenceUrl ? [referenceUrl] : [],
      sourceUrl: referenceUrl
    });

    try {
      const response = await fetch("/api/personal/records", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify(legacyInput)
      });

      const payload = (await response
        .json()
        .catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;

      if (!response.ok || !payload.ok || !payload.items) {
        setError(payload.error || "Failed to save person");
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
      if (createdPerson) {
        await releaseDirtyHistoryGuard();
        router.replace(`${getNativeObjectRoute({ module: "people", objectType: "person", objectId: createdPerson.id })}?tab=overview`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reach the People store. Your draft is still here.");
    } finally {
      setSaving(false);
    }
  }

  async function patchPerson(
    id: string,
    patch: {
      status?: PersonalRecordStatus;
      action?: "review";
      title?: string;
      body?: string;
      url?: string;
      projects?: string[];
      externalSources?: string[];
      time?: {
        lastReview?: string;
        nextReview?: string;
        reviewCadence?: string;
      };
      profile?: PersonalContactProfile;
    }
  ) {
    setError("");
    const legacyPatch = peopleUpdateInputToLegacy({
      fullName: patch.title,
      status: patch.status,
      context: patch.body,
      sourceUrl: patch.url,
      projects: patch.projects,
      externalSources: patch.externalSources,
      time: patch.time,
      profile: patch.profile,
      markReviewed: patch.action === "review"
    });
    try {
      const response = await fetch("/api/personal/records", {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ id, ...legacyPatch })
      });
      const payload = (await response
        .json()
        .catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;

      if (!response.ok || !payload.ok || !payload.items) {
        setError(payload.error || "Failed to update person");
        return false;
      }

      const nextPeople = payload.items.filter((record) => record.className === "person" || record.className === "org");
      const updatedPerson = nextPeople.find((record) => record.id === id);
      setPeople(nextPeople);
      setSelectedId(id);
      if (updatedPerson) setProfileDraft(getProfile(updatedPerson));
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reach the People store. Your draft is still here.");
      return false;
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPerson) return;
    setProfileSaving(true);
    const saved = await saveProfileDraft(profileDraft);
    setProfileSaving(false);
    if (!saved) return;
    setDetailMode("profile");
    setActiveView(editorReturnView);
    await releaseDirtyHistoryGuard();
    router.replace(`${getNativeObjectRoute({ module: "people", objectType: selectedPerson.className === "org" ? "organization" : "person", objectId: selectedPerson.id })}?tab=${editorReturnView}`);
  }

  function openAddPerson() {
    const destination = `${getModuleRoute("people")}/new`;
    if (guardDirtyNavigation(destination)) return;
    setAddingPerson(true);
    setDetailMode("edit");
    setActiveView("overview");
    setProfileMenuOpen(false);
    router.push(destination);
  }

  function openEditProfile() {
    if (!selectedPerson) return;
    setEditorReturnView(activeView === "properties" ? "overview" : activeView);
    setAddingPerson(false);
    setDetailMode("edit");
    setActiveView("properties");
    setProfileMenuOpen(false);
    router.push(`${getNativeObjectRoute({ module: "people", objectType: selectedPerson.className === "org" ? "organization" : "person", objectId: selectedPerson.id, mode: "edit" })}?tab=${activeView}`);
  }

  async function releaseDirtyHistoryGuard() {
    const marker = dirtyHistoryGuardRef.current;
    if (!marker) return;
    dirtyHistoryGuardRef.current = null;
    if (window.history.state?.[PEOPLE_DIRTY_HISTORY_GUARD] !== marker) return;
    suppressDirtyPopRef.current = true;
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        suppressDirtyPopRef.current = false;
        window.removeEventListener("popstate", finish);
        window.clearTimeout(timeoutId);
        resolve();
      };
      const timeoutId = window.setTimeout(finish, 350);
      window.addEventListener("popstate", finish, { once: true });
      window.history.back();
    });
  }

  async function discardEditorChanges() {
    const destination = pendingNavigation;
    setPendingNavigation(null);
    setCancelConfirmOpen(false);
    if (destination === PEOPLE_HISTORY_BACK_DESTINATION) {
      const marker = dirtyHistoryGuardRef.current;
      const onGuardEntry = marker && window.history.state?.[PEOPLE_DIRTY_HISTORY_GUARD] === marker;
      dirtyHistoryGuardRef.current = null;
      suppressDirtyPopRef.current = true;
      window.history.go(onGuardEntry ? -2 : -1);
      return;
    }
    await releaseDirtyHistoryGuard();
    if (addingPerson || !selectedPerson) {
      setAddingPerson(false);
      setDetailMode("profile");
      router.replace(destination || getModuleRoute("people"));
      return;
    }
    setProfileDraft(getProfile(selectedPerson));
    setDetailMode("profile");
    setActiveView(editorReturnView);
    router.replace(destination || `${getNativeObjectRoute({ module: "people", objectType: selectedPerson.className === "org" ? "organization" : "person", objectId: selectedPerson.id })}?tab=${editorReturnView}`);
  }

  function requestCancelEditor() {
    if (editorDirty) {
      setCancelConfirmOpen(true);
      return;
    }
    discardEditorChanges();
  }

  function updateProfileDraft(key: keyof ContactProfileDraft, value: string) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  }

  function renderAddPersonForm(extraClass = "") {
    return (
      <form className={`people-capture-form people-add-card${extraClass ? ` ${extraClass}` : ""}`} onSubmit={submitPerson}>
        <div className="people-edit-toolbar">
          <button type="button" onClick={requestCancelEditor}>Cancel</button>
          <strong>New Person</strong>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
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
      </form>
    );
  }

  return (
    <section className={shellClassName} aria-label="People workspace">
      <span id="people-unavailable-actions" className="sr-only">
        This action is intentionally unavailable until its native owner or persistence path is connected.
      </span>
      <div className="people-mobile-topbar">
        {mobileSurface === "directory" ? (
          <button type="button" aria-label="Open people menu" onClick={() => setMobileMenuOpen(true)}>
            <span aria-hidden="true">☰</span>
          </button>
        ) : (
          <button
            type="button"
            aria-label={mobileSurface === "editor" ? "Cancel editing" : "Back to People directory"}
            onClick={() => mobileSurface === "editor" ? requestCancelEditor() : router.push(getModuleRoute("people"))}
          >
            <span aria-hidden="true">←</span>
          </button>
        )}
        <span className="people-mobile-brand">U</span>
        <strong>{mobileSurface === "editor" ? (addingPerson ? "New Person" : "Edit Person") : mobileSurface === "profile" ? selectedPerson?.title || "Profile" : "People"}</strong>
        <button type="button" aria-label="Search people" onClick={() => setFiltersOpen(true)}>
          /
        </button>
        <button type="button" aria-label="Open filters" onClick={() => setFiltersOpen(true)}>
          ::
        </button>
      </div>

      <div
        ref={mobileMenuRef}
        className={`people-mobile-menu${mobileMenuOpen ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="People module navigation"
        aria-hidden={!mobileMenuOpen}
      >
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
            <span>{visiblePeople.length} shown · {people.length} People records · {totalRecords} total Personal Records</span>
          </div>
          <div className="people-header-actions">
            <button type="button" aria-label="Show filters" onClick={() => setFiltersOpen(true)}>
              Filter
            </button>
            <button
              type="button"
              aria-label="Toggle list density"
              onClick={() => {
                const next = listMode === "list" ? "compact" : listMode === "compact" ? "grid" : "list";
                setListMode(next);
                updatePeopleUrl({ view: next });
              }}
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
            onChange={(event) => {
              setQuery(event.target.value);
              updatePeopleUrl({ query: event.target.value }, { native: true });
            }}
            placeholder="Search people..."
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); updatePeopleUrl({ query: "" }, { native: true }); }}>
              x
            </button>
          )}
        </label>

        <div className="people-filter-bar" role="list" aria-label="People filters">
          {FILTERS.map((filter) => (
            <button
              type="button"
              className={`module-ref-pill module-ref-tone-${filter.tone}${activeFilter === filter.id ? " is-active" : ""}`}
              onClick={() => { setActiveFilter(filter.id); updatePeopleUrl({ filter: filter.id }); }}
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
            <select value={sortMode} onChange={(event) => {
              const next = event.target.value as PeopleSortMode;
              setSortMode(next);
              updatePeopleUrl({ sort: next });
            }}>
              <option value="last-name">Last Name</option>
              <option value="recent-contact">Recent Contact</option>
              <option value="next-follow-up">Next Follow-up</option>
              <option value="priority">Priority</option>
            </select>
          </label>
        </div>

        {filtersOpen && (
          <section ref={filterSheetRef} className="people-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="people-filter-title">
            <div className="people-sheet-handle" />
            <header>
              <h2 id="people-filter-title">Filters</h2>
              <button type="button" onClick={() => { setActiveFilter("all"); setQuery(""); updatePeopleUrl({ filter: "all", query: "" }); }}>
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
              <button type="button" disabled aria-describedby="people-unavailable-actions" title="Advanced filter editing is not connected in this slice" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
            <footer>
              <button type="button" disabled aria-describedby="people-unavailable-actions" title="Saved views are not connected yet">Save as view unavailable</button>
              <button type="button" onClick={() => setFiltersOpen(false)}>
                Show {visiblePeople.length} Results
              </button>
            </footer>
          </section>
        )}

        {batchSelectedIds.size > 0 && (
          <div className="people-batch-bar" role="toolbar" aria-label="People batch actions">
            <strong>{batchSelectedIds.size} selected</strong>
            <button type="button" disabled aria-describedby="people-unavailable-actions" title="Durable list membership is not connected yet">Add to list unavailable</button>
            <button type="button" disabled aria-describedby="people-unavailable-actions" title="People export is not connected yet">Export unavailable</button>
            <button type="button" onClick={() => setBatchSelectedIds(new Set())}>Clear selection</button>
          </div>
        )}

        {initialLoadError ? (
          <SystemState
            variant="error"
            title="People could not be loaded"
            description={initialLoadError}
            action={{ label: "Reload", onSelect: () => window.location.reload() }}
          />
        ) : resolvedUtilityNotice ? (
          <section className="people-utility-surface">
            <h2>{activeViewLabel}</h2>
            <p>{resolvedUtilityNotice}</p>
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
                <button type="button" disabled aria-describedby="people-unavailable-actions">Import preview not connected</button>
                <button type="button" disabled aria-describedby="people-unavailable-actions">Export people data unavailable</button>
              </div>
            )}
            {activeSidebarView === "customize" && (
              <div className="people-utility-grid">
                <button type="button" disabled aria-describedby="people-unavailable-actions">Manage custom fields unavailable</button>
                <button type="button" disabled aria-describedby="people-unavailable-actions">Cadence defaults unavailable</button>
                <button type="button" disabled aria-describedby="people-unavailable-actions">Visible sections unavailable</button>
              </div>
            )}
          </section>
        ) : visiblePeople.length > 0 ? (
          <div className={`people-directory-list is-${listMode}`}>
            {visiblePeople.map((record) => {
              const profile = getProfile(record);
              return (
                <article
                  className={`people-directory-row module-ref-tone-${getPeopleTone(record)}${selectedPerson?.id === record.id ? " is-selected" : ""}`}
                  key={record.id}
                >
                  <label className="people-row-checkbox" aria-label={`Select ${record.title} for batch actions`}>
                    <input
                      type="checkbox"
                      checked={batchSelectedIds.has(record.id)}
                      onChange={() => toggleBatchSelection(record.id)}
                    />
                  </label>
                  <button
                    type="button"
                    className="people-directory-row-body"
                    aria-pressed={selectedPerson?.id === record.id}
                    onClick={() => selectPerson(record)}
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
                </article>
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
        {initialLoadError ? (
          <SystemState
            variant="error"
            title="Person could not be loaded"
            description={initialLoadError}
            action={{ label: "Reload", onSelect: () => window.location.reload() }}
          />
        ) : selectedPerson ? (
          <>
            {!addingPerson && (
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
                  aria-label="Star profile unavailable"
                  disabled
                  title="Star storage is not connected yet"
                >
                  Star
                </button>
                <button type="button" aria-label="Edit profile" onClick={openEditProfile}>Edit</button>
                <button
                  type="button"
                  aria-label="More profile actions"
                  aria-expanded={profileMenuOpen}
                  aria-controls="people-profile-action-menu"
                  onClick={() => setProfileMenuOpen((current) => !current)}
                >...</button>
              </div>
              {profileMenuOpen && (
                <div id="people-profile-action-menu" className="people-action-menu" role="group" aria-label="Profile actions">
                  <button type="button" onClick={openEditProfile}>Open properties</button>
                  <button type="button" disabled aria-describedby="people-unavailable-actions" title="List membership persistence is not connected yet">Add to list unavailable</button>
                  <button type="button" disabled aria-describedby="people-unavailable-actions" title="Lifecycle changes require a confirmation and undo path">Set dormant unavailable</button>
                  <button type="button" disabled aria-describedby="people-unavailable-actions" title="People export is not connected yet">Export contact unavailable</button>
                </div>
              )}
              </header>

              <DetailTabs
                id={`people-${selectedPerson.id}`}
                tabs={PEOPLE_VIEWS}
                activeTab={activeView}
                onTabChange={(tabId) => selectProfileView(tabId as PeopleView)}
                ariaLabel={`${selectedPerson.title} profile sections`}
                className="people-profile-tabs"
              />
              </>
            )}

            <div
              id={!addingPerson ? `people-${selectedPerson.id}-panel-${activeView}` : undefined}
              role={!addingPerson ? "tabpanel" : undefined}
              aria-labelledby={!addingPerson ? `people-${selectedPerson.id}-tab-${activeView}` : undefined}
              tabIndex={!addingPerson ? 0 : undefined}
              className="people-active-tab-panel"
            >
            {addingPerson ? (
              renderAddPersonForm("people-empty-add")
            ) : detailMode === "edit" ? (
              <div className="people-edit-layout">
                <form className="people-profile-form people-edit-form" onSubmit={saveProfile}>
                  <div className="people-edit-toolbar">
                    <button type="button" onClick={requestCancelEditor}>Cancel</button>
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
                  <button type="button" onClick={openInteractionComposer}>Log Interaction</button>
                  <button
                    type="button"
                    onClick={() => router.push(followUpCreationRoute(selectedPerson))}
                    aria-label={`Schedule a Personal Ops follow-up for ${selectedPerson.title}`}
                  >
                    Schedule Follow-up
                  </button>
                  <button type="button" onClick={() => selectProfileView("notes")}>Add Memory / Note</button>
                </div>
                <div className="people-timeline-list">
                  {timelineItems.length > 0 ? timelineItems.map((item, index) => (
                    <article key={`${item}-${index}`}>
                      <span>{formatFullDate(selectedPerson.time.lastReview || selectedPerson.updatedAt)}</span>
                      <strong>{item}</strong>
                      {selectedProfile.context && <p>{selectedProfile.context}</p>}
                    </article>
                  )) : (
                    <div className="notes-empty-state">
                      <h3>No interactions yet</h3>
                      <p>Log a call, email, meeting, message, or meaningful memory to build relationship history.</p>
                    </div>
                  )}
                </div>
              </section>
            ) : detailMode === "workspace" ? (
              <section className="people-linked-workspace">
                <article>
                  <h3>Notes</h3>
                  {selectedProfile.notes ? selectedProfile.notes.split("\n").filter(Boolean).map((item) => <span key={item}>{item}</span>) : <span>No authored Notes linked.</span>}
                  <button type="button" onClick={() => selectProfileView("notes")}>Open Notes & Memories</button>
                </article>
                <article>
                  <h3>Files & Media</h3>
                  <span>No Media files linked.</span>
                  <button type="button" disabled aria-describedby="people-unavailable-actions" title="The Media picker is not connected in this slice">Link Existing unavailable</button>
                </article>
                <article>
                  <h3>Projects</h3>
                  {selectedPerson.projects.length ? selectedPerson.projects.map((item) => <a href={`${getModuleRoute("projects")}?query=${encodeURIComponent(item)}`} key={item}>{item}</a>) : <span>No Projects linked.</span>}
                  <button type="button" disabled aria-describedby="people-unavailable-actions" title="The Projects object picker is not connected in this slice">Link Project unavailable</button>
                </article>
                <article>
                  <h3>Resources</h3>
                  {selectedPerson.externalSources.length ? selectedPerson.externalSources.map((item) => <a href={`${getModuleRoute("resources")}?query=${encodeURIComponent(item)}`} key={item}>{item}</a>) : <span>No Resources linked.</span>}
                  <button type="button" disabled aria-describedby="people-unavailable-actions" title="The Resources object picker is not connected in this slice">Add Resource unavailable</button>
                </article>
              </section>
            ) : activeView === "notes" ? (
              <section className="people-notes-panel">
                <div className="people-section-toolbar">
                  <div>
                    <h3>Notes & Memories</h3>
                    <span>{selectedMemories.length} memories, {selectedInteractions.length} interactions</span>
                  </div>
                  <button type="button" disabled aria-describedby="people-unavailable-actions" title="Profile-local note search is not connected in this slice">
                    Search unavailable
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
                          <button type="button" disabled aria-describedby="people-unavailable-actions" title="Per-memory pin mutations are not connected">Pin unavailable</button>
                          <button type="button" disabled aria-describedby="people-unavailable-actions" title="Per-memory editing is not connected">Edit unavailable</button>
                          <button type="button" disabled aria-describedby="people-unavailable-actions" title="Archive needs an auditable memory record">Archive unavailable</button>
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
                          <button type="button" onClick={openEditProfile}>Open in profile editor</button>
                          <button type="button" disabled aria-describedby="people-unavailable-actions" title="The Notes object picker is not connected in this slice">Link unavailable</button>
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
                  <button type="button" onClick={() => document.querySelector<HTMLInputElement>(".people-relation-form input")?.focus()}>
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
                    <div><span>Streak</span><strong>{splitTextEntries(selectedProfile.interactions).length} interactions</strong></div>
                    <div><span>Priority</span><strong>{getPriorityLabel(selectedPerson)}</strong></div>
                  </div>
                  <button type="button" onClick={openInteractionComposer}>Log Interaction</button>
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
                    {connectionItems.length > 0
                      ? connectionItems.slice(0, 5).map((name) => <span key={name}>{name.slice(0, 1)}</span>)
                      : <small>No linked connections.</small>}
                  </div>
                </article>
              </section>
            )}
            </div>
            {!addingPerson && PEOPLE_VIEWS.filter((view) => view.id !== activeView).map((view) => (
              <section
                id={`people-${selectedPerson.id}-panel-${view.id}`}
                role="tabpanel"
                aria-labelledby={`people-${selectedPerson.id}-tab-${view.id}`}
                hidden
                key={view.id}
              />
            ))}
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

      {!initialLoadError && <nav className="people-mobile-actionbar" aria-label="People quick actions">
        {mobileSurface === "directory" ? (
          <button type="button" onClick={openAddPerson}>Add Person</button>
        ) : mobileSurface === "editor" ? (
          <>
            <button type="button" onClick={requestCancelEditor}>Cancel</button>
            <button
              type="button"
              onClick={() => document.querySelector<HTMLFormElement>(addingPerson ? ".people-capture-form" : ".people-edit-form")?.requestSubmit()}
              disabled={saving || profileSaving}
            >
              {saving || profileSaving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={openInteractionComposer}>Log Interaction</button>
            <button type="button" onClick={openEditProfile}>Edit Profile</button>
          </>
        )}
      </nav>}

      {interactionOpen && selectedPerson && (
        <div className="people-dialog-backdrop" role="presentation">
          <form ref={interactionDialogRef} className="people-interaction-dialog" role="dialog" aria-modal="true" aria-labelledby="log-interaction-title" onSubmit={saveInteraction}>
            <header>
              <div>
                <span>Meaningful interaction</span>
                <h2 id="log-interaction-title">Log interaction with {selectedPerson.title}</h2>
              </div>
              <button type="button" aria-label="Close interaction composer" onClick={() => setInteractionOpen(false)} disabled={interactionSaving}>x</button>
            </header>
            <div className="people-interaction-fields">
              <label>
                Type
                <select value={interactionKind} onChange={(event) => setInteractionKind(event.target.value as InteractionKind)}>
                  <option value="call">Call</option>
                  <option value="message">Message</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="note">Note</option>
                  <option value="milestone">Milestone</option>
                </select>
              </label>
              <label>
                Date
                <input type="date" value={interactionDate} onChange={(event) => setInteractionDate(event.target.value)} required />
              </label>
              <label className="is-wide">
                Title
                <input value={interactionTitle} onChange={(event) => setInteractionTitle(event.target.value)} placeholder="Coffee, call, introduction, or shared moment" required />
              </label>
              <label className="is-wide">
                Summary
                <textarea value={interactionSummary} onChange={(event) => setInteractionSummary(event.target.value)} rows={4} placeholder="What mattered, what changed, and any context worth remembering." />
              </label>
              <label className="people-check-row is-wide">
                <input type="checkbox" checked={interactionMeaningful} onChange={(event) => setInteractionMeaningful(event.target.checked)} />
                Refresh last-contact date and cadence
              </label>
            </div>
            {error && <p className="personal-record-error">{error}</p>}
            <footer>
              <button type="button" onClick={() => setInteractionOpen(false)} disabled={interactionSaving}>Cancel</button>
              <button type="submit" disabled={interactionSaving || !interactionTitle.trim() || !interactionDate}>
                {interactionSaving ? "Saving..." : "Save Interaction"}
              </button>
            </footer>
          </form>
        </div>
      )}

      <aside className="people-smart-panel">
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
        <button type="button" disabled aria-describedby="people-unavailable-actions" title="Saved views are not connected yet">+ Save as view unavailable</button>
      </aside>

      <ConfirmationSheet
        open={cancelConfirmOpen}
        onOpenChange={(open) => {
          setCancelConfirmOpen(open);
          if (!open) setPendingNavigation(null);
        }}
        onConfirm={discardEditorChanges}
        title="Discard unsaved People changes?"
        description="Your current form values have not been saved to the Personal Records store."
        consequences={["The stored person will not be changed.", "Only the unsaved draft in this editor will be discarded."]}
        confirmLabel="Discard changes"
        tone="danger"
      />

      <SharedAIDock
        open={aiOpen}
        onOpenChange={(open) => {
          setAiOpen(open);
          updatePeopleUrl({ ai: open });
        }}
        context={{
          module: "people",
          object: selectedPerson
            ? {
                module: "people",
                objectType: selectedPerson.className === "org" ? "organization" : "person",
                objectId: selectedPerson.id,
                label: selectedPerson.title,
                route: getNativeObjectRoute({
                  module: "people",
                  objectType: selectedPerson.className === "org" ? "organization" : "person",
                  objectId: selectedPerson.id
                })
              }
            : null,
          activeTab: activeView,
          visibleScope: activeViewLabel,
          allowedActions: ["Draft a follow-up", "Summarize visible profile context"]
        }}
      />
    </section>
  );
}
