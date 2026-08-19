"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import { mirrorPersonalRecord } from "../lib/local-first/domain-mirror";
import {
  buildFollowUpCreationRoute,
  type FollowUpSourceRef
} from "../lib/modules/personal-ops/follow-up-links";
import { memoryCategoryLabel, sortPeopleMemories } from "../lib/modules/people/memories";
import { peopleCreateInputToLegacy, peopleUpdateInputToLegacy } from "../lib/modules/people/legacy-adapter";
import type { PersonalOpsFollowUp } from "../lib/modules/personal-ops/types";
import type { ProjectsState } from "../lib/modules/projects/types";
import { getModuleRoute, getNativeObjectRoute } from "../lib/native-objects/routes";
import { parsePeopleUrlState, serializePeopleUrlState } from "../lib/native-objects/url-state";
import type {
  PersonalContactProfile,
  PersonalContactEntryCategory,
  PersonalEmailEntry,
  PersonalEducationEntry,
  PersonalLocationEntry,
  PersonalMemoryEntry,
  PersonalOccupationEntry,
  PersonalPhoneEntry,
  PersonalRecord,
  PersonalRecordClass,
  PersonalRecordStatus
} from "../lib/personal-records-store";
import SharedAIDock from "./admin-shell/SharedAIDock";
import ConfirmationSheet from "./operational/ConfirmationSheet";
import DetailTabs from "./operational/DetailTabs";
import LinkedFollowUpsPanel from "./operational/LinkedFollowUpsPanel";
import LinkedProjectsPanel from "./operational/LinkedProjectsPanel";
import SystemState from "./operational/SystemState";
import { usePersonalOpsFollowUps } from "./operational/usePersonalOpsFollowUps";
import { useProjectsState } from "./operational/useProjectsState";

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
  initialFollowUps: PersonalOpsFollowUp[];
  initialFollowUpsError?: string;
  initialProjectsState: ProjectsState;
  initialProjectsError?: string;
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
type InteractionKind = "call" | "message" | "email" | "meeting" | "catch-up" | "note" | "milestone";
type ContactMethodId = "email" | "phone" | "website" | "instagram" | "tiktok" | "x" | "linkedin";

type ContactMethod = {
  id: ContactMethodId;
  label: string;
  value: string;
  available: boolean;
  href?: string;
  actionLabel?: string;
  details?: Array<{
    label: string;
    value: string;
    href?: string;
    actionLabel?: string;
  }>;
};

type PeopleTimelineInteraction = {
  date?: string;
  kind?: string;
  title: string;
  summary?: string;
};

function ContactMethodIcon({ id }: { id: ContactMethodId }) {
  if (id === "linkedin") return <span aria-hidden="true">in</span>;
  if (id === "x") return <span aria-hidden="true">X</span>;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      {id === "email" && <><path d="M3.5 6.5h17v11h-17z" /><path d="m4 7 8 6 8-6" /></>}
      {id === "phone" && <path d="M7 3.5 4.5 6c.8 6.8 6.7 12.7 13.5 13.5l2.5-2.5-4-3-2 2c-2.7-1.1-5.4-3.8-6.5-6.5l2-2z" />}
      {id === "website" && <><circle cx="12" cy="12" r="8.5" /><path d="M3.7 12h16.6M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5s-1 6.2-3.2 8.5C9.8 18.2 8.8 15.4 8.8 12S9.8 5.8 12 3.5Z" /></>}
      {id === "instagram" && <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3.5" /><circle cx="17.2" cy="6.8" r=".7" /></>}
      {id === "tiktok" && <><path d="M14.5 4v10.2a4 4 0 1 1-3-3.9" /><path d="M14.5 4c.7 2.5 2.2 4 4.5 4.4" /></>}
    </svg>
  );
}

function contactMethodHref(id: ContactMethodId, value: string): { href?: string; actionLabel?: string } {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (id === "email") return { href: `mailto:${trimmed}`, actionLabel: "Email" };
  if (id === "phone") return { href: `tel:${trimmed.replace(/[^\d+]/g, "")}`, actionLabel: "Call" };
  if (/^https?:\/\//i.test(trimmed)) return { href: trimmed, actionLabel: "Open" };
  if (/^www\./i.test(trimmed)) return { href: `https://${trimmed}`, actionLabel: "Open" };
  const username = trimmed.replace(/^@/, "");
  if (id === "instagram") return { href: `https://instagram.com/${username}`, actionLabel: "Open" };
  if (id === "tiktok") return { href: `https://tiktok.com/@${username}`, actionLabel: "Open" };
  if (id === "x") return { href: `https://x.com/${username}`, actionLabel: "Open" };
  return {};
}

type PeopleTimelineItem =
  | { kind: "memory"; id: string; date?: string; memory: PersonalMemoryEntry }
  | { kind: "interaction"; id: string; date?: string; interaction: PeopleTimelineInteraction };

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
  phoneCountryCode: string;
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
  instagram: string;
  tiktok: string;
  x: string;
  partner: string;
  children: string;
  interactions: string;
  emails: PersonalEmailEntry[];
  phones: PersonalPhoneEntry[];
  memories: PersonalMemoryEntry[];
  education: PersonalEducationEntry[];
  occupations: PersonalOccupationEntry[];
  locations: PersonalLocationEntry[];
};

type ContactProfileTextKey = Exclude<
  keyof ContactProfileDraft,
  "memories" | "education" | "occupations" | "locations" | "emails" | "phones"
>;

type ProfileField = {
  key: ContactProfileTextKey;
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
  "Acquaintance",
  "Advisor",
  "Client",
  "Collaborator",
  "Colleague",
  "Community",
  "Family",
  "Friend",
  "Partner",
  "University",
  "Vendor",
  "Other"
];

const COMMON_LOCATIONS = [
  "Columbus, Ohio, USA",
  "Cincinnati, Ohio, USA",
  "Cleveland, Ohio, USA",
  "Dayton, Ohio, USA",
  "New York, New York, USA",
  "Los Angeles, California, USA",
  "Chicago, Illinois, USA",
  "Houston, Texas, USA",
  "Philadelphia, Pennsylvania, USA",
  "Phoenix, Arizona, USA",
  "San Antonio, Texas, USA",
  "San Diego, California, USA",
  "Dallas, Texas, USA",
  "Austin, Texas, USA",
  "San Francisco, California, USA",
  "Seattle, Washington, USA",
  "Boston, Massachusetts, USA",
  "Washington, District of Columbia, USA",
  "Atlanta, Georgia, USA",
  "Miami, Florida, USA"
];

const CADENCE_OPTIONS = [
  { label: "Not set", value: "" },
  { label: "No cadence", value: "NONE" },
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
      { key: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://linkedin.com/in/..." },
      { key: "website", label: "Website", type: "url", placeholder: "https://..." },
      { key: "instagram", label: "Instagram", type: "url", placeholder: "https://instagram.com/..." },
      { key: "tiktok", label: "TikTok", type: "url", placeholder: "https://tiktok.com/@..." },
      { key: "x", label: "X", type: "url", placeholder: "https://x.com/..." }
    ]
  },
  {
    title: "Place and relationships",
    tone: "teal",
    fields: [
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
      { key: "contactCadence", label: "Contact cadence" }
    ]
  },
  {
    title: "Memory",
    tone: "green",
    fields: [
      { key: "interestingFact", label: "Interesting fact", type: "textarea" },
      { key: "lifeDream", label: "Life dream", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "interactions", label: "Interactions", type: "textarea", placeholder: "One interaction per line" }
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
  phoneCountryCode: "+1",
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
  instagram: "",
  tiktok: "",
  x: "",
  partner: "",
  children: "",
  interactions: "",
  emails: [],
  phones: [],
  memories: [],
  education: [],
  occupations: [],
  locations: []
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

function normalizedCountryCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits ? `+${digits}` : "+1";
}

function normalizePhoneForStorage(value: string, countryCode = "+1"): string {
  const clean = value.trim();
  if (!clean) return "";
  const digits = clean.replace(/\D/g, "");
  if (!digits) return "";
  if (clean.startsWith("+")) return `+${digits}`;
  const code = normalizedCountryCode(countryCode).replace(/\D/g, "");
  if (digits.length === 10) return `+${code}${digits}`;
  if (code === "1" && digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${code}${digits}`;
}

function formatPhone(value: string, countryCode = "+1"): string {
  const canonical = normalizePhoneForStorage(value, countryCode);
  const digits = canonical.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  const codeDigits = normalizedCountryCode(countryCode).replace(/\D/g, "");
  if (digits.startsWith(codeDigits) && digits.length > codeDigits.length) {
    const local = digits.slice(codeDigits.length);
    return `+${codeDigits} ${local.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}`;
  }
  return canonical;
}

const CONTACT_CATEGORY_OPTIONS: Array<{ value: PersonalContactEntryCategory; label: string }> = [
  { value: "primary", label: "Primary" },
  { value: "personal", label: "Personal" },
  { value: "work", label: "Work" },
  { value: "university", label: "University" },
  { value: "custom", label: "Custom" }
];

function contactEntryLabel(entry: Pick<PersonalEmailEntry | PersonalPhoneEntry, "category" | "customLabel">): string {
  if (entry.category === "custom") return entry.customLabel?.trim() || "Custom";
  return CONTACT_CATEGORY_OPTIONS.find((option) => option.value === entry.category)?.label || "Contact";
}

function derivePersonNameParts(value: string) {
  const parts = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1]
  };
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

function todayDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function newMemoryEntry(input: {
  text?: string;
  occurredOn?: string;
  category?: string;
  pinned?: boolean;
} = {}): PersonalMemoryEntry {
  return {
    id: `memory-${crypto.randomUUID()}`,
    text: input.text || "",
    occurredOn: input.occurredOn || todayDateInputValue(),
    category: input.category,
    pinned: input.pinned ?? true,
    createdAt: new Date().toISOString()
  };
}

function newEducationEntry(input: Partial<PersonalEducationEntry> = {}): PersonalEducationEntry {
  return {
    id: input.id || `education-${crypto.randomUUID()}`,
    institution: input.institution || "",
    degree: input.degree,
    fieldOfStudy: input.fieldOfStudy
  };
}

function newOccupationEntry(input: Partial<PersonalOccupationEntry> = {}): PersonalOccupationEntry {
  return {
    id: input.id || `occupation-${crypto.randomUUID()}`,
    title: input.title || "",
    employer: input.employer,
    status: input.status || "current"
  };
}

function newLocationEntry(input: Partial<PersonalLocationEntry> = {}): PersonalLocationEntry {
  return {
    id: input.id || `location-${crypto.randomUUID()}`,
    label: input.label,
    location: input.location,
    address: input.address
  };
}

function newEmailEntry(input: Partial<PersonalEmailEntry> = {}): PersonalEmailEntry {
  return {
    id: input.id || `email-${crypto.randomUUID()}`,
    category: input.category || "personal",
    customLabel: input.customLabel,
    address: input.address || ""
  };
}

function newPhoneEntry(input: Partial<PersonalPhoneEntry> = {}): PersonalPhoneEntry {
  return {
    id: input.id || `phone-${crypto.randomUUID()}`,
    category: input.category || "personal",
    customLabel: input.customLabel,
    number: input.number || "",
    countryCode: normalizedCountryCode(input.countryCode || "+1")
  };
}

function cleanEmailEntries(entries: PersonalEmailEntry[]): PersonalEmailEntry[] {
  const seen = new Set<string>();
  return entries
    .map((entry) => ({
      ...entry,
      address: entry.address.trim(),
      customLabel: entry.category === "custom" ? entry.customLabel?.trim() || undefined : undefined
    }))
    .filter((entry) => {
      if (!entry.address) return false;
      const key = entry.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanPhoneEntries(entries: PersonalPhoneEntry[]): PersonalPhoneEntry[] {
  const seen = new Set<string>();
  return entries
    .map((entry) => ({
      ...entry,
      number: normalizePhoneForStorage(entry.number, entry.countryCode),
      countryCode: normalizedCountryCode(entry.countryCode),
      customLabel: entry.category === "custom" ? entry.customLabel?.trim() || undefined : undefined
    }))
    .filter((entry) => {
      if (!entry.number || seen.has(entry.number)) return false;
      seen.add(entry.number);
      return true;
    });
}

function legacyEmailEntries(profile: PersonalContactProfile): PersonalEmailEntry[] {
  if (profile.emails?.length) return profile.emails.map((entry) => ({ ...entry }));
  return cleanEmailEntries([
    profile.primaryEmail ? newEmailEntry({ id: "legacy-email-primary", category: "primary", address: profile.primaryEmail }) : null,
    profile.workEmail ? newEmailEntry({ id: "legacy-email-work", category: "work", address: profile.workEmail }) : null,
    profile.universityEmail ? newEmailEntry({ id: "legacy-email-university", category: "university", address: profile.universityEmail }) : null
  ].filter((entry): entry is PersonalEmailEntry => Boolean(entry)));
}

function legacyPhoneEntries(profile: PersonalContactProfile): PersonalPhoneEntry[] {
  if (profile.phones?.length) return profile.phones.map((entry) => ({ ...entry }));
  return profile.phoneNumber
    ? [newPhoneEntry({
        id: "legacy-phone-primary",
        category: "primary",
        number: profile.phoneNumber,
        countryCode: profile.phoneCountryCode || "+1"
      })]
    : [];
}

function cleanEducationEntries(entries: PersonalEducationEntry[]): PersonalEducationEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      institution: entry.institution.trim(),
      degree: entry.degree?.trim() || undefined,
      fieldOfStudy: entry.fieldOfStudy?.trim() || undefined
    }))
    .filter((entry) => entry.institution || entry.degree || entry.fieldOfStudy);
}

function cleanOccupationEntries(entries: PersonalOccupationEntry[]): PersonalOccupationEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      title: entry.title.trim(),
      employer: entry.employer?.trim() || undefined
    }))
    .filter((entry) => entry.title || entry.employer);
}

function cleanLocationEntries(entries: PersonalLocationEntry[]): PersonalLocationEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      label: entry.label?.trim() || undefined,
      location: entry.location?.trim() || undefined,
      address: entry.address?.trim() || undefined
    }))
    .filter((entry) => entry.location || entry.address);
}

function updateEntry<T extends { id: string }>(entries: T[], id: string, patch: Partial<T>): T[] {
  return entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry);
}

function removeEntry<T extends { id: string }>(entries: T[], id: string): T[] {
  return entries.filter((entry) => entry.id !== id);
}

function updateContactEntry<T extends { id: string; category: PersonalContactEntryCategory }>(
  entries: T[],
  id: string,
  patch: Partial<T>
): T[] {
  return entries.map((entry) => {
    if (entry.id === id) return { ...entry, ...patch };
    if (patch.category === "primary" && entry.category === "primary") {
      return { ...entry, category: "personal" };
    }
    return entry;
  });
}

function interactionOccurredOn(value: string): string | undefined {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:\s|$|•)/);
  return match?.[1];
}

const INTERACTION_KIND_LABELS = new Set([
  "call",
  "message",
  "email",
  "meeting",
  "catch-up",
  "catch up",
  "note",
  "milestone"
]);

function parseTimelineInteraction(value: string): PeopleTimelineInteraction {
  const parts = value
    .split(/\s+[•·]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const date = parts[0]?.match(/^\d{4}-\d{2}-\d{2}$/) ? parts.shift() : undefined;
  const possibleKind = parts[0]?.toLocaleLowerCase();
  const kind = possibleKind && INTERACTION_KIND_LABELS.has(possibleKind) ? parts.shift() : undefined;
  const title = parts.shift() || value.replace(/^(\d{4}-\d{2}-\d{2})(?:\s+[•·]\s+)?/, "").trim() || "Interaction";
  const summary = parts.length > 0 ? parts.join(" • ") : undefined;
  return { date, kind, title, summary };
}

function sortTimelineItems(items: PeopleTimelineItem[]): PeopleTimelineItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rightDate = right.item.date ? Date.parse(`${right.item.date}T12:00:00.000Z`) : Number.NEGATIVE_INFINITY;
      const leftDate = left.item.date ? Date.parse(`${left.item.date}T12:00:00.000Z`) : Number.NEGATIVE_INFINITY;
      if (rightDate !== leftDate) return rightDate - leftDate;
      return left.index - right.index;
    })
    .map(({ item }) => item);
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
  if (record.time.reviewCadence?.toUpperCase() === "NONE") return false;
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
    profile
      ? Object.entries(profile)
          .flatMap(([, value]) => Array.isArray(value)
            ? value.flatMap((item) => item && typeof item === "object"
              ? Object.values(item).map((entry) => String(entry || ""))
              : String(item || ""))
            : String(value || ""))
          .join(" ")
      : ""
  ]
    .join(" ")
    .toLowerCase();
}

function getPrimaryGroup(record: PersonalRecord) {
  return record.subjects[0] || record.areas[0] || (record.className === "org" ? "Organization" : "Contact");
}

function getCadenceLabel(value?: string) {
  if (!value) return "Not set";
  return CADENCE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function displayList(values: string[], fallback = "-") {
  return values.length > 0 ? values.join(", ") : fallback;
}

function educationSummary(entries: PersonalEducationEntry[], fallback: string) {
  const summaries = entries
    .filter((entry) => entry.institution.trim())
    .map((entry) => {
      const study = [entry.degree, entry.fieldOfStudy].filter(Boolean).join(" · ");
      return study ? `${entry.institution} — ${study}` : entry.institution;
    });
  if (summaries.length === 0) return fallback;
  return summaries.length === 1 ? summaries[0] : `${summaries[0]} +${summaries.length - 1} more`;
}

function relationshipName(value: string) {
  return value.replace(/\s+\([^)]*\)\s*$/, "").trim();
}

function getProfile(record?: PersonalRecord): ContactProfileDraft {
  if (!record) {
    return { ...EMPTY_PROFILE_DRAFT };
  }

  const profile = record.profile;
  const education = profile?.education?.length
    ? profile.education.map((entry) => ({ ...entry }))
    : profile?.universityAffiliation
      ? [newEducationEntry({ id: "legacy-education-primary", institution: profile.universityAffiliation })]
      : [];
  const occupations = profile?.occupations?.length
    ? profile.occupations.map((entry) => ({ ...entry }))
    : [
        profile?.primaryOccupation || profile?.primaryEmployer
          ? newOccupationEntry({ id: "legacy-occupation-primary", title: profile.primaryOccupation || "", employer: profile.primaryEmployer, status: "current" })
          : null,
        profile?.secondaryOccupation || profile?.secondaryEmployer
          ? newOccupationEntry({ id: "legacy-occupation-secondary", title: profile.secondaryOccupation || "", employer: profile.secondaryEmployer, status: "current" })
          : null,
        profile?.pastOccupation || profile?.pastEmployer
          ? newOccupationEntry({ id: "legacy-occupation-past", title: profile.pastOccupation || "", employer: profile.pastEmployer, status: "past" })
          : null
      ].filter((entry): entry is PersonalOccupationEntry => Boolean(entry));
  const locations = profile?.locations?.length
    ? profile.locations.map((entry) => ({ ...entry }))
    : profile?.livesIn || profile?.address
      ? [newLocationEntry({ id: "legacy-location-primary", label: "Primary home", location: profile.livesIn, address: profile.address })]
      : [];
  return {
    fullName: profile?.fullName || record.title,
    firstName: profile?.firstName || "",
    middleName: profile?.middleName || "",
    lastName: profile?.lastName || "",
    nickname: profile?.nickname || "",
    context: profile?.context || record.body || "",
    birthday: profile?.birthday || "",
    phoneNumber: profile?.phoneNumber || "",
    phoneCountryCode: profile?.phoneCountryCode || "+1",
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
    instagram: profile?.instagram || "",
    tiktok: profile?.tiktok || "",
    x: profile?.x || "",
    partner: profile?.partner || "",
    children: joinList(profile?.children),
    interactions: joinTextEntries(profile?.interactions),
    emails: profile ? legacyEmailEntries(profile) : [],
    phones: profile ? legacyPhoneEntries(profile) : [],
    memories: (profile?.memories || []).map((memory) => ({ ...memory })),
    education,
    occupations,
    locations
  };
}

function buildProfilePayload(draft: ContactProfileDraft): PersonalContactProfile {
  const education = cleanEducationEntries(draft.education);
  const occupations = cleanOccupationEntries(draft.occupations);
  const locations = cleanLocationEntries(draft.locations);
  const emails = cleanEmailEntries(draft.emails);
  const phones = cleanPhoneEntries(draft.phones);
  const currentJobs = occupations.filter((entry) => entry.status === "current");
  const pastJobs = occupations.filter((entry) => entry.status === "past");
  const primaryEmail = emails.find((entry) => entry.category === "primary") || emails[0];
  const workEmail = emails.find((entry) => entry.category === "work");
  const universityEmail = emails.find((entry) => entry.category === "university");
  const primaryPhone = phones.find((entry) => entry.category === "primary") || phones[0];
  return {
    ...draft,
    phoneCountryCode: primaryPhone?.countryCode || normalizedCountryCode(draft.phoneCountryCode),
    phoneNumber: primaryPhone?.number || "",
    primaryEmail: primaryEmail?.address || "",
    workEmail: workEmail?.address || "",
    universityEmail: universityEmail?.address || "",
    associatedPeople: splitList(draft.associatedPeople),
    children: splitList(draft.children),
    interactions: splitTextEntries(draft.interactions),
    memories: draft.memories.map((memory) => ({ ...memory, text: memory.text.trim() })).filter((memory) => memory.text),
    education,
    occupations,
    locations,
    emails,
    phones,
    universityAffiliation: education[0]?.institution || "",
    primaryOccupation: currentJobs[0]?.title || "",
    primaryEmployer: currentJobs[0]?.employer || "",
    secondaryOccupation: currentJobs[1]?.title || "",
    secondaryEmployer: currentJobs[1]?.employer || "",
    pastOccupation: pastJobs[0]?.title || "",
    pastEmployer: pastJobs[0]?.employer || "",
    livesIn: locations[0]?.location || "",
    address: locations[0]?.address || ""
  };
}

function countProfileFields(record: PersonalRecord) {
  const profile = getProfile(record);
  return Object.values(profile).filter((value) => Array.isArray(value) ? value.length > 0 : value.trim()).length;
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
  if (!record?.time.nextReview) {
    return record?.time.reviewCadence?.toUpperCase() === "NONE" ? "No cadence" : "No follow-up";
  }
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
  return buildFollowUpCreationRoute(peopleFollowUpSource(record), {
    dueAt: followUpDueAt(record)
  });
}

function peopleFollowUpSource(record: PersonalRecord): FollowUpSourceRef {
  const objectType = record.className === "org" ? "organization" : "person";
  return {
    module: "people",
    objectType,
    objectId: record.id,
    label: record.title,
    route: getNativeObjectRoute({
      module: "people",
      objectType,
      objectId: record.id
    })
  };
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
    profile.emails.length === 0 && profile.phones.length === 0 ? "Primary contact method" : "",
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
  if (view === "business") return hasGroupLike(record, ["business", "collaborator", "colleague", "coworker", "partner", "client", "work"]);
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

function EducationEntriesEditor({
  entries,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalEducationEntry[];
  onChange: (id: string, patch: Partial<PersonalEducationEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section module-ref-tone-violet" data-people-education-editor>
      <header className="people-repeatable-heading">
        <div><h4>University & education</h4><p>Add another only when there is another school or degree.</p></div>
        <button type="button" onClick={onAdd}>Add university</button>
      </header>
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-repeatable-entry" data-education-entry={entry.id} key={entry.id}>
          <div className="people-repeatable-entry-heading">
            <strong>University {index + 1}</strong>
            <button type="button" onClick={() => onRemove(entry.id)} aria-label={`Remove university ${index + 1}`}>Remove</button>
          </div>
          <div className="people-repeatable-fields people-repeatable-fields-education">
            <label>University<input value={entry.institution} onChange={(event) => onChange(entry.id, { institution: event.target.value })} placeholder="Ohio State University" /></label>
            <label>Degree<input value={entry.degree || ""} onChange={(event) => onChange(entry.id, { degree: event.target.value })} placeholder="Bachelor’s, Master’s, PhD..." /></label>
            <label>Field of study<input value={entry.fieldOfStudy || ""} onChange={(event) => onChange(entry.id, { fieldOfStudy: event.target.value })} placeholder="Economics, design, engineering..." /></label>
          </div>
        </article>
      )) : <p className="people-repeatable-empty">No university added.</p>}
    </section>
  );
}

function OccupationEntriesEditor({
  entries,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalOccupationEntry[];
  onChange: (id: string, patch: Partial<PersonalOccupationEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section module-ref-tone-blue" data-people-occupation-editor>
      <header className="people-repeatable-heading">
        <div><h4>Jobs & occupations</h4><p>Keep current and past work together without squeezing it into one field.</p></div>
        <button type="button" onClick={onAdd}>Add job</button>
      </header>
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-repeatable-entry" data-occupation-entry={entry.id} key={entry.id}>
          <div className="people-repeatable-entry-heading">
            <strong>Job {index + 1}</strong>
            <button type="button" onClick={() => onRemove(entry.id)} aria-label={`Remove job ${index + 1}`}>Remove</button>
          </div>
          <div className="people-repeatable-fields people-repeatable-fields-job">
            <label>Occupation or title<input value={entry.title} onChange={(event) => onChange(entry.id, { title: event.target.value })} placeholder="Product designer" /></label>
            <label>Employer<input value={entry.employer || ""} onChange={(event) => onChange(entry.id, { employer: event.target.value })} placeholder="Company or organization" /></label>
            <label>When<select value={entry.status} onChange={(event) => onChange(entry.id, { status: event.target.value as PersonalOccupationEntry["status"] })}><option value="current">Current</option><option value="past">Past</option></select></label>
          </div>
        </article>
      )) : <p className="people-repeatable-empty">No jobs added.</p>}
    </section>
  );
}

function LocationEntriesEditor({
  entries,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalLocationEntry[];
  onChange: (id: string, patch: Partial<PersonalLocationEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section module-ref-tone-green" data-people-location-editor>
      <header className="people-repeatable-heading">
        <div><h4>Homes & locations</h4><p>Save a city, a full address, or both. Add another place only when needed.</p></div>
        <button type="button" onClick={onAdd}>Add location</button>
      </header>
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-repeatable-entry" data-location-entry={entry.id} key={entry.id}>
          <div className="people-repeatable-entry-heading">
            <strong>{entry.label?.trim() || `Location ${index + 1}`}</strong>
            <button type="button" onClick={() => onRemove(entry.id)} aria-label={`Remove location ${index + 1}`}>Remove</button>
          </div>
          <div className="people-repeatable-fields people-repeatable-fields-location">
            <label>Label<input value={entry.label || ""} onChange={(event) => onChange(entry.id, { label: event.target.value })} placeholder={index === 0 ? "Primary home" : "Second home"} /></label>
            <label>City / region<input list="people-location-suggestions" value={entry.location || ""} onChange={(event) => onChange(entry.id, { location: event.target.value })} placeholder="Start typing a city" /></label>
            <label className="is-wide">Street address<textarea value={entry.address || ""} onChange={(event) => onChange(entry.id, { address: event.target.value })} placeholder="Street, apartment or unit, city, state, postal code, country" rows={2} /></label>
          </div>
        </article>
      )) : <p className="people-repeatable-empty">No location added.</p>}
    </section>
  );
}

function EmailEntriesEditor({
  entries,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalEmailEntry[];
  onChange: (id: string, patch: Partial<PersonalEmailEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section people-contact-channel-section module-ref-tone-blue" data-people-email-editor>
      <header className="people-repeatable-heading">
        <div><h4>Email addresses</h4><p>Label work, university, personal, or anything custom.</p></div>
        <button type="button" onClick={onAdd}>Add email</button>
      </header>
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-contact-channel-entry" data-email-entry={entry.id} key={entry.id}>
          <div className="people-contact-channel-fields">
            <div className="people-contact-category-fields">
              <label>
                Category
                <select
                  aria-label={`Email ${index + 1} category`}
                  value={entry.category}
                  onChange={(event) => onChange(entry.id, { category: event.target.value as PersonalContactEntryCategory })}
                >
                  {CONTACT_CATEGORY_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              {entry.category === "custom" && (
                <label>
                  Custom category
                  <input
                    value={entry.customLabel || ""}
                    onChange={(event) => onChange(entry.id, { customLabel: event.target.value })}
                    placeholder="Alumni, volunteer, club..."
                    required={Boolean(entry.address.trim())}
                  />
                </label>
              )}
            </div>
            <label className="people-contact-value-field">
              Email
              <input
                type="email"
                value={entry.address}
                onChange={(event) => onChange(entry.id, { address: event.target.value })}
                placeholder="name@example.com"
              />
            </label>
            <button type="button" className="people-contact-remove" onClick={() => onRemove(entry.id)} aria-label={`Remove email ${index + 1}`}>Remove</button>
          </div>
        </article>
      )) : <p className="people-repeatable-empty">No email address added.</p>}
    </section>
  );
}

function PhoneEntriesEditor({
  entries,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalPhoneEntry[];
  onChange: (id: string, patch: Partial<PersonalPhoneEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section people-contact-channel-section module-ref-tone-teal" data-people-phone-editor>
      <header className="people-repeatable-heading">
        <div><h4>Phone numbers</h4><p>Keep one by default and add another only when needed.</p></div>
        <button type="button" onClick={onAdd}>Add phone</button>
      </header>
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-contact-channel-entry" data-phone-entry={entry.id} key={entry.id}>
          <div className="people-contact-channel-fields">
            <div className="people-contact-category-fields">
              <label>
                Category
                <select
                  aria-label={`Phone ${index + 1} category`}
                  value={entry.category}
                  onChange={(event) => onChange(entry.id, { category: event.target.value as PersonalContactEntryCategory })}
                >
                  {CONTACT_CATEGORY_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              {entry.category === "custom" && (
                <label>
                  Custom category
                  <input
                    value={entry.customLabel || ""}
                    onChange={(event) => onChange(entry.id, { customLabel: event.target.value })}
                    placeholder="Studio, travel, emergency..."
                    required={Boolean(entry.number.trim())}
                  />
                </label>
              )}
            </div>
            <label className="people-contact-value-field">
              Phone
              <input
                type="tel"
                inputMode="tel"
                value={entry.number}
                onChange={(event) => onChange(entry.id, { number: event.target.value })}
                onBlur={() => onChange(entry.id, { number: formatPhone(entry.number, entry.countryCode) })}
                placeholder="6147963848"
              />
            </label>
            <button type="button" className="people-contact-remove" onClick={() => onRemove(entry.id)} aria-label={`Remove phone ${index + 1}`}>Remove</button>
          </div>
          <details className="people-contact-entry-advanced">
            <summary>Country code {entry.countryCode}</summary>
            <label>
              Country code
              <input
                inputMode="tel"
                value={entry.countryCode}
                onChange={(event) => onChange(entry.id, { countryCode: normalizedCountryCode(event.target.value) })}
                placeholder="+1"
              />
            </label>
          </details>
        </article>
      )) : <p className="people-repeatable-empty">No phone number added.</p>}
    </section>
  );
}

export default function PeopleWorkspace({
  initialPeople,
  totalRecords,
  initialSelectedId,
  initialMode = "directory",
  initialLoadError = "",
  initialFollowUps,
  initialFollowUpsError = "",
  initialProjectsState,
  initialProjectsError = ""
}: PeopleWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialUrlState = parsePeopleUrlState(searchParams);
  const [people, setPeople] = useState(initialPeople);
  const {
    followUps,
    error: followUpsError,
    loading: followUpsLoading,
    refresh: refreshLinkedFollowUps
  } = usePersonalOpsFollowUps(initialFollowUps, initialFollowUpsError);
  const {
    state: projectsState,
    error: projectsError,
    loading: projectsLoading,
    refresh: refreshProjects
  } = useProjectsState(initialProjectsState, initialProjectsError);
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
  const [groups, setGroups] = useState<string[]>(["Collaborator"]);
  const [status, setStatus] = useState<PersonalRecordStatus>("active");
  const [quickContext, setQuickContext] = useState("");
  const [quickEmails, setQuickEmails] = useState<PersonalEmailEntry[]>([
    newEmailEntry({ id: "new-contact-email-1", category: "primary" })
  ]);
  const [quickPhones, setQuickPhones] = useState<PersonalPhoneEntry[]>([
    newPhoneEntry({ id: "new-contact-phone-1", category: "primary", countryCode: "+1" })
  ]);
  const [quickEducation, setQuickEducation] = useState<PersonalEducationEntry[]>([]);
  const [quickOccupations, setQuickOccupations] = useState<PersonalOccupationEntry[]>([
    newOccupationEntry({ id: "new-contact-job-1" })
  ]);
  const [quickLocations, setQuickLocations] = useState<PersonalLocationEntry[]>([
    newLocationEntry({ id: "new-contact-location-1", label: "Primary home" })
  ]);
  const [quickProjects, setQuickProjects] = useState("");
  const [lastContact, setLastContact] = useState("");
  const [nextContact, setNextContact] = useState("");
  const [cadence, setCadence] = useState("P1M");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [quickInstagram, setQuickInstagram] = useState("");
  const [quickTikTok, setQuickTikTok] = useState("");
  const [quickX, setQuickX] = useState("");
  const [quickLinkedIn, setQuickLinkedIn] = useState("");
  const [profileDraft, setProfileDraft] = useState<ContactProfileDraft>({ ...EMPTY_PROFILE_DRAFT });
  const [profileGroups, setProfileGroups] = useState<string[]>([]);
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
  const [expandedContactMethod, setExpandedContactMethod] = useState<ContactMethodId | null>(null);
  const [utilityNotice, setUtilityNotice] = useState("");
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("personal_context");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryDate, setMemoryDate] = useState(todayDateInputValue);
  const [memoryPinned, setMemoryPinned] = useState(true);
  const [memorySaving, setMemorySaving] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState("");
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [editingMemoryDate, setEditingMemoryDate] = useState("");
  const [memoryEditSaving, setMemoryEditSaving] = useState(false);
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

  const locationSuggestions = useMemo(() => Array.from(new Set([
    ...people.map((record) => record.profile?.livesIn || "").filter(Boolean),
    ...people.flatMap((record) => (record.profile?.locations || []).map((entry) => entry.location || "").filter(Boolean)),
    ...COMMON_LOCATIONS
  ])).sort((left, right) => left.localeCompare(right)), [people]);

  const selectedPerson = useMemo(() => {
    return people.find((record) => record.id === selectedId) || visiblePeople[0];
  }, [people, selectedId, visiblePeople]);
  useEffect(() => {
    setProfileDraft(getProfile(selectedPerson));
    setProfileGroups(selectedPerson?.subjects || []);
    setEditingMemoryId("");
    setExpandedContactMethod(null);
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
  const emailContactDetails = selectedProfile.emails.map((entry) => ({
    label: contactEntryLabel(entry),
    value: entry.address,
    ...contactMethodHref("email", entry.address)
  }));
  const phoneContactDetails = selectedProfile.phones.map((entry) => {
    const value = formatPhone(entry.number, entry.countryCode);
    return {
      label: contactEntryLabel(entry),
      value,
      ...contactMethodHref("phone", value)
    };
  });
  const selectedContactMethods: ContactMethod[] = ([
    { id: "email", label: "Email", value: emailContactDetails[0]?.value || "", details: emailContactDetails },
    { id: "phone", label: "Phone", value: phoneContactDetails[0]?.value || "", details: phoneContactDetails },
    { id: "website", label: "Website", value: selectedProfile.website },
    { id: "instagram", label: "Instagram", value: selectedProfile.instagram },
    { id: "tiktok", label: "TikTok", value: selectedProfile.tiktok },
    { id: "x", label: "X", value: selectedProfile.x },
    { id: "linkedin", label: "LinkedIn", value: selectedProfile.linkedin }
  ] satisfies Array<Omit<ContactMethod, "available">>).map((method) => ({
    ...method,
    available: Boolean(method.value),
    ...contactMethodHref(method.id, method.value)
  }));
  const expandedContact = selectedContactMethods.find((method) => method.available && method.id === expandedContactMethod);
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
    `is-mobile-${mobileSurface}`
  ].filter(Boolean).join(" ");
  const activeSidebarItem = PEOPLE_SIDEBAR_SECTIONS.flatMap((section) => section.items).find((item) => item.id === activeSidebarView);
  const activeViewLabel = activeSidebarItem?.label || "All People";
  const resolvedUtilityNotice = activeSidebarItem?.surface === "utility"
    ? utilityNotice || `${activeViewLabel} is a read-only People utility in this checkpoint. Stored-data actions remain disabled until matching backend support exists.`
    : utilityNotice;
  const profileGaps = selectedPerson ? getProfileGaps(selectedPerson) : [];
  const selectedMemories = sortPeopleMemories(selectedProfile.memories);
  const selectedInteractions = splitTextEntries(selectedProfile.interactions);
  const selectedChildren = splitList(selectedProfile.children);
  const associatedPeople = splitList(selectedProfile.associatedPeople);
  const relationshipConnections = Array.from(new Map([
    ...associatedPeople.map((label) => {
      const name = relationshipName(label);
      const target = people.find((record) => record.title.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
      return [name.toLowerCase(), { label, target }] as const;
    }),
    ...(selectedPerson?.relations.related || []).map((id) => {
      const target = people.find((record) => record.id === id);
      return [(target?.title || id).toLowerCase(), { label: target?.title || id, target }] as const;
    })
  ]).values());
  const connectionItems = relationshipConnections.map((connection) => connection.label);
  const importantDates = [
    ["Birthday", selectedProfile.birthday ? formatFullDate(selectedProfile.birthday) : "Not recorded"],
    ["Last contact", selectedPerson ? formatFullDate(selectedPerson.time.lastReview || selectedProfile.lastContact || selectedPerson.updatedAt) : "-"],
    ["Next follow-up", selectedPerson ? getNextContactLabel(selectedPerson) : "-"],
    ["Added", selectedPerson ? formatFullDate(selectedPerson.createdAt) : "-"]
  ];
  const timelineItems = sortTimelineItems([
    ...selectedInteractions.map((text, index): PeopleTimelineItem => {
      const interaction = parseTimelineInteraction(text);
      return {
        kind: "interaction",
        id: `interaction-${index}-${text}`,
        date: interaction.date || interactionOccurredOn(text),
        interaction
      };
    }),
    ...selectedMemories.map((memory): PeopleTimelineItem => ({
      kind: "memory",
      id: memory.id,
      date: memory.occurredOn,
      memory
    }))
  ]).slice(0, 20);
  const selectedTags = [
    ...(fallbackPerson?.subjects || []).slice(0, 3),
    ...(selectedPerson?.projects || []).slice(0, 2),
    getPriorityLabel(selectedPerson)
  ].filter(Boolean);
  const addFormDirty = [
    name,
    quickContext,
    quickProjects,
    lastContact,
    nextContact,
    referenceUrl,
    quickInstagram,
    quickTikTok,
    quickX,
    quickLinkedIn
  ].some((value) => value.trim().length > 0)
    || cleanEmailEntries(quickEmails).length > 0
    || cleanPhoneEntries(quickPhones).length > 0
    || cleanEducationEntries(quickEducation).length > 0
    || cleanOccupationEntries(quickOccupations).length > 0
    || cleanLocationEntries(quickLocations).length > 0
    || className !== "person"
    || groups.length !== 1
    || groups[0] !== "Collaborator"
    || status !== "active"
    || cadence !== "P1M";
  const profileFormDirty = Boolean(
    selectedPerson && (
      JSON.stringify(profileDraft) !== JSON.stringify(getProfile(selectedPerson))
      || JSON.stringify(profileGroups) !== JSON.stringify(selectedPerson.subjects)
    )
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
      [selectedProfile.website, selectedProfile.linkedin, selectedProfile.instagram, selectedProfile.tiktok, selectedProfile.x]
        .filter((value): value is string => Boolean(value))
    );
    const preservedSources = selectedPerson.externalSources.filter((source) => !previousProfileSources.has(source));
    const profileSources = [profile.website, profile.linkedin, profile.instagram, profile.tiktok, profile.x]
      .filter((value): value is string => Boolean(value));
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
      subjects: profileGroups,
      profile
    });
  }

  async function saveMemory() {
    if (!selectedPerson || !memoryDraft.trim()) return;
    setMemorySaving(true);
    const entry = newMemoryEntry({
      text: memoryDraft.trim(),
      occurredOn: memoryDate,
      category: memoryCategory,
      pinned: memoryPinned
    });
    const saved = await saveProfileDraft({
      ...selectedProfile,
      memories: [...selectedProfile.memories, entry]
    });
    setMemorySaving(false);
    if (saved) {
      setMemoryDraft("");
      setMemoryDate(todayDateInputValue());
      setMemoryPinned(true);
      setActiveView("notes");
      setDetailMode("profile");
      setActionNotice("Memory saved to this profile.");
    }
  }

  function startMemoryEdit(memory: PersonalMemoryEntry) {
    setEditingMemoryId(memory.id);
    setEditingMemoryText(memory.text);
    setEditingMemoryDate(memory.occurredOn || "");
    setActionNotice("");
  }

  function cancelMemoryEdit() {
    setEditingMemoryId("");
    setEditingMemoryText("");
    setEditingMemoryDate("");
  }

  async function saveMemoryEdit() {
    if (!selectedPerson || !editingMemoryId || !editingMemoryText.trim()) return;
    setMemoryEditSaving(true);
    const memories = selectedProfile.memories.map((memory) => memory.id === editingMemoryId
      ? { ...memory, text: editingMemoryText.trim(), occurredOn: editingMemoryDate || undefined }
      : memory);
    const saved = await saveProfileDraft({ ...selectedProfile, memories });
    setMemoryEditSaving(false);
    if (saved) {
      cancelMemoryEdit();
      setActionNotice("Memory updated. Notes and Timeline have been reordered by date.");
    }
  }

  function updateProfileMemory(id: string, patch: Partial<Pick<PersonalMemoryEntry, "text" | "occurredOn">>) {
    setProfileDraft((current) => ({
      ...current,
      memories: current.memories.map((memory) => memory.id === id ? { ...memory, ...patch } : memory)
    }));
  }

  function addProfileMemory() {
    const memory = newMemoryEntry();
    setProfileDraft((current) => ({ ...current, memories: [...current.memories, memory] }));
    window.setTimeout(() => document.getElementById(`people-property-memory-${memory.id}`)?.focus(), 0);
  }

  function removeProfileMemory(id: string) {
    setProfileDraft((current) => ({
      ...current,
      memories: current.memories.filter((memory) => memory.id !== id)
    }));
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
    const kindLabel = interactionKind === "catch-up" ? "Catch-up" : labelize(interactionKind);
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

    const derivedName = className === "person" ? derivePersonNameParts(name) : { firstName: "", middleName: "", lastName: "" };
    const profile = buildProfilePayload({
      ...EMPTY_PROFILE_DRAFT,
      fullName: name,
      ...derivedName,
      context: quickContext,
      emails: quickEmails,
      phones: quickPhones,
      education: quickEducation,
      occupations: quickOccupations,
      locations: quickLocations,
      lastContact,
      nextContact,
      contactCadence: cadence,
      website: referenceUrl,
      instagram: quickInstagram,
      tiktok: quickTikTok,
      x: quickX,
      linkedin: quickLinkedIn
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
      subjects: groups,
      projects: splitList(quickProjects),
      externalSources: [referenceUrl, quickInstagram, quickTikTok, quickX, quickLinkedIn].filter(Boolean),
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
      setGroups(["Collaborator"]);
      setStatus("active");
      setQuickContext("");
      setQuickEmails([newEmailEntry({ id: "new-contact-email-1", category: "primary" })]);
      setQuickPhones([newPhoneEntry({ id: "new-contact-phone-1", category: "primary", countryCode: "+1" })]);
      setQuickEducation([]);
      setQuickOccupations([newOccupationEntry({ id: "new-contact-job-1" })]);
      setQuickLocations([newLocationEntry({ id: "new-contact-location-1", label: "Primary home" })]);
      setQuickProjects("");
      setLastContact("");
      setNextContact("");
      setCadence("P1M");
      setReferenceUrl("");
      setQuickInstagram("");
      setQuickTikTok("");
      setQuickX("");
      setQuickLinkedIn("");
      if (createdPerson) {
        await mirrorPersonalRecord(createdPerson);
        await releaseDirtyHistoryGuard();
        router.replace(`${getNativeObjectRoute({ module: "people", objectType: createdPerson.className === "org" ? "organization" : "person", objectId: createdPerson.id })}?tab=overview`);
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
      subjects?: string[];
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
      subjects: patch.subjects,
      externalSources: patch.externalSources,
      time: patch.time,
      profile: patch.profile,
      markReviewed: patch.action === "review"
    });
    try {
      const response = await fetch("/api/personal/records", {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ id, expectedUpdatedAt: selectedPerson?.id === id ? selectedPerson.updatedAt : undefined, ...legacyPatch })
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
      if (updatedPerson) await mirrorPersonalRecord(updatedPerson);
      setPeople(nextPeople);
      setSelectedId(id);
      if (updatedPerson) {
        setProfileDraft(getProfile(updatedPerson));
        setProfileGroups(updatedPerson.subjects);
      }
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
    setProfileGroups(selectedPerson.subjects);
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

  function updateProfileDraft(key: ContactProfileTextKey, value: string) {
    setProfileDraft((current) => {
      if (key !== "fullName" || selectedPerson?.className === "org") {
        return { ...current, [key]: value };
      }
      const previous = derivePersonNameParts(current.fullName);
      const next = derivePersonNameParts(value);
      return {
        ...current,
        fullName: value,
        firstName: !current.firstName || current.firstName === previous.firstName ? next.firstName : current.firstName,
        middleName: !current.middleName || current.middleName === previous.middleName ? next.middleName : current.middleName,
        lastName: !current.lastName || current.lastName === previous.lastName ? next.lastName : current.lastName
      };
    });
  }

  function updateProfileEmail(id: string, patch: Partial<PersonalEmailEntry>) {
    setProfileDraft((current) => ({ ...current, emails: updateContactEntry(current.emails, id, patch) }));
  }

  function updateProfilePhone(id: string, patch: Partial<PersonalPhoneEntry>) {
    setProfileDraft((current) => ({ ...current, phones: updateContactEntry(current.phones, id, patch) }));
  }

  function updateProfileEducation(id: string, patch: Partial<PersonalEducationEntry>) {
    setProfileDraft((current) => ({ ...current, education: updateEntry(current.education, id, patch) }));
  }

  function updateProfileOccupation(id: string, patch: Partial<PersonalOccupationEntry>) {
    setProfileDraft((current) => ({ ...current, occupations: updateEntry(current.occupations, id, patch) }));
  }

  function updateProfileLocation(id: string, patch: Partial<PersonalLocationEntry>) {
    setProfileDraft((current) => ({ ...current, locations: updateEntry(current.locations, id, patch) }));
  }

  function toggleGroup(option: string) {
    setGroups((current) => current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option]);
  }

  function toggleProfileGroup(option: string) {
    setProfileGroups((current) => current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option]);
  }

  function renderAddPersonForm(extraClass = "") {
    const derivedQuickName = className === "person" ? derivePersonNameParts(name) : null;
    const showDerivedQuickName = Boolean(derivedQuickName?.firstName && derivedQuickName.lastName);
    return (
      <form className={`people-capture-form people-add-card${extraClass ? ` ${extraClass}` : ""}`} onSubmit={submitPerson}>
        <div className="people-edit-toolbar">
          <button type="button" onClick={requestCancelEditor}>Cancel</button>
          <strong>{className === "org" ? "New Organization" : "New Person"}</strong>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
        <label>
          Full name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Person or organization"
            aria-describedby={showDerivedQuickName ? "people-derived-name" : undefined}
            required
          />
        </label>
        {showDerivedQuickName && derivedQuickName && (
          <div id="people-derived-name" className="people-derived-name" aria-live="polite" data-people-derived-name>
            <span><small>First</small><strong data-derived-first-name>{derivedQuickName.firstName}</strong></span>
            {derivedQuickName.middleName && <span><small>Middle</small><strong>{derivedQuickName.middleName}</strong></span>}
            <span><small>Last</small><strong data-derived-last-name>{derivedQuickName.lastName}</strong></span>
          </div>
        )}
        <div className="people-capture-classification">
          <label className="people-type-field">
            Type
            <select value={className} onChange={(event) => setClassName(event.target.value as "person" | "org")}>
              <option value="person">Person</option>
              <option value="org">Organization</option>
            </select>
          </label>
          <fieldset className="people-group-picker">
            <legend>Groups</legend>
            <div>{GROUP_OPTIONS.map((option) => <label key={option}>
              <input type="checkbox" checked={groups.includes(option)} onChange={() => toggleGroup(option)} />
              <span>{option}</span>
            </label>)}</div>
            <small>Choose every group that fits.</small>
          </fieldset>
        </div>
        <div className="people-contact-channel-grid">
          <EmailEntriesEditor
            entries={quickEmails}
            onChange={(id, patch) => setQuickEmails((current) => updateContactEntry(current, id, patch))}
            onAdd={() => setQuickEmails((current) => [...current, newEmailEntry({ category: current.some((entry) => entry.category === "primary") ? "personal" : "primary" })])}
            onRemove={(id) => setQuickEmails((current) => removeEntry(current, id))}
          />
          <PhoneEntriesEditor
            entries={quickPhones}
            onChange={(id, patch) => setQuickPhones((current) => updateContactEntry(current, id, patch))}
            onAdd={() => setQuickPhones((current) => [...current, newPhoneEntry({
              category: current.some((entry) => entry.category === "primary") ? "personal" : "primary",
              countryCode: current[0]?.countryCode || "+1"
            })])}
            onRemove={(id) => setQuickPhones((current) => removeEntry(current, id))}
          />
        </div>
        <label>
          Relationship context
          <textarea value={quickContext} onChange={(event) => setQuickContext(event.target.value)} rows={4} />
        </label>
        <OccupationEntriesEditor
          entries={quickOccupations}
          onChange={(id, patch) => setQuickOccupations((current) => updateEntry(current, id, patch))}
          onAdd={() => setQuickOccupations((current) => [...current, newOccupationEntry()])}
          onRemove={(id) => setQuickOccupations((current) => removeEntry(current, id))}
        />
        <EducationEntriesEditor
          entries={quickEducation}
          onChange={(id, patch) => setQuickEducation((current) => updateEntry(current, id, patch))}
          onAdd={() => setQuickEducation((current) => [...current, newEducationEntry()])}
          onRemove={(id) => setQuickEducation((current) => removeEntry(current, id))}
        />
        <LocationEntriesEditor
          entries={quickLocations}
          onChange={(id, patch) => setQuickLocations((current) => updateEntry(current, id, patch))}
          onAdd={() => setQuickLocations((current) => [...current, newLocationEntry({ label: current.length === 0 ? "Primary home" : "" })])}
          onRemove={(id) => setQuickLocations((current) => removeEntry(current, id))}
        />
        <div className="people-capture-grid">
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as PersonalRecordStatus)}><option value="active">Active</option><option value="next">Next</option><option value="idea">Loose tie</option><option value="inactive">Dormant</option></select></label>
          <label>Cadence<select data-people-cadence-select value={cadence} onChange={(event) => setCadence(event.target.value)}>{CADENCE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        </div>
        <label>Projects<input value={quickProjects} onChange={(event) => setQuickProjects(event.target.value)} placeholder="Comma-separated project names" /></label>
        <div className="people-capture-grid">
          <label>Last contact<input type="date" value={lastContact} onChange={(event) => setLastContact(event.target.value)} /></label>
          <label>Next contact<input type="date" value={nextContact} onChange={(event) => setNextContact(event.target.value)} /></label>
        </div>
        <fieldset className="people-social-fields">
          <legend>Website & social profiles</legend>
          <div className="people-capture-grid">
            <label>Website<input type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." /></label>
            <label>Instagram<input type="url" value={quickInstagram} onChange={(event) => setQuickInstagram(event.target.value)} placeholder="https://instagram.com/..." /></label>
            <label>TikTok<input type="url" value={quickTikTok} onChange={(event) => setQuickTikTok(event.target.value)} placeholder="https://tiktok.com/@..." /></label>
            <label>X<input type="url" value={quickX} onChange={(event) => setQuickX(event.target.value)} placeholder="https://x.com/..." /></label>
            <label>LinkedIn<input type="url" value={quickLinkedIn} onChange={(event) => setQuickLinkedIn(event.target.value)} placeholder="https://linkedin.com/in/..." /></label>
          </div>
        </fieldset>
        <datalist id="people-location-suggestions">
          {locationSuggestions.map((location) => <option value={location} key={location} />)}
        </datalist>
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
                  <fieldset className="people-group-picker people-profile-group-picker">
                    <legend>Groups</legend>
                    <div>{GROUP_OPTIONS.map((option) => <label key={option}>
                      <input type="checkbox" checked={profileGroups.includes(option)} onChange={() => toggleProfileGroup(option)} />
                      <span>{option}</span>
                    </label>)}</div>
                    <small>A person can belong to several groups without creating another contact.</small>
                  </fieldset>
                  {PROFILE_SECTIONS.map((section) => (
                    <Fragment key={section.title}>
                    <section className={`people-profile-section module-ref-tone-${section.tone}`}>
                      <h4>{section.title}</h4>
                      <div className="people-profile-field-grid">
                        {section.fields.map((field) => (
                          <label className={field.type === "textarea" ? "is-wide" : ""} key={field.key}>
                            {field.label}
                            {field.key === "contactCadence" ? (
                              <select
                                data-people-cadence-select
                                value={profileDraft.contactCadence}
                                onChange={(event) => updateProfileDraft("contactCadence", event.target.value)}
                              >
                                {CADENCE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                              </select>
                            ) : field.type === "textarea" ? (
                              <textarea
                                value={profileDraft[field.key]}
                                onChange={(event) => updateProfileDraft(field.key, event.target.value)}
                                placeholder={field.placeholder}
                                rows={3}
                              />
                            ) : (
                              <input
                                type={field.type || "text"}
                                list={field.key === "livesIn" ? "people-location-suggestions" : undefined}
                                value={profileDraft[field.key]}
                                onChange={(event) => updateProfileDraft(field.key, event.target.value)}
                                onBlur={field.key === "phoneNumber"
                                  ? () => updateProfileDraft("phoneNumber", formatPhone(profileDraft.phoneNumber, profileDraft.phoneCountryCode))
                                  : undefined}
                                placeholder={field.placeholder}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                      {section.title === "Memory" && (
                        <div className="people-memory-properties" aria-label="Dated memories">
                          <div className="people-memory-properties-heading">
                            <div>
                              <strong>Memories</strong>
                              <span>Each memory keeps its own date. Notes and Timeline show the newest first.</span>
                            </div>
                            <button type="button" onClick={addProfileMemory}>Add memory</button>
                          </div>
                          {profileDraft.memories.length > 0 ? profileDraft.memories.map((memory, index) => (
                            <article className="people-memory-property-entry" data-memory-editor-id={memory.id} key={memory.id}>
                              <div className="people-memory-property-entry-heading">
                                <strong>Memory {index + 1}</strong>
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`people-property-memory-${memory.id}`)?.focus()}
                                    aria-label={`Edit memory ${index + 1}`}
                                  >
                                    Edit
                                  </button>
                                  <button type="button" onClick={() => removeProfileMemory(memory.id)}>
                                    Remove
                                  </button>
                                </div>
                              </div>
                              <label>
                                Memory
                                <textarea
                                  id={`people-property-memory-${memory.id}`}
                                  value={memory.text}
                                  onChange={(event) => updateProfileMemory(memory.id, { text: event.target.value })}
                                  placeholder="What happened, what mattered, or what you want to remember..."
                                  rows={3}
                                />
                              </label>
                              <label>
                                Date
                                <input
                                  type="date"
                                  value={memory.occurredOn || ""}
                                  onChange={(event) => updateProfileMemory(memory.id, { occurredOn: event.target.value || undefined })}
                                />
                              </label>
                            </article>
                          )) : (
                            <p className="people-memory-properties-empty">No memories yet. Add one when there is a moment you want to keep.</p>
                          )}
                        </div>
                      )}
                    </section>
                    {section.title === "Communication" && (
                      <>
                        <div className="people-contact-channel-grid">
                          <EmailEntriesEditor
                            entries={profileDraft.emails}
                            onChange={updateProfileEmail}
                            onAdd={() => setProfileDraft((current) => ({
                              ...current,
                              emails: [...current.emails, newEmailEntry({ category: current.emails.some((entry) => entry.category === "primary") ? "personal" : "primary" })]
                            }))}
                            onRemove={(id) => setProfileDraft((current) => ({ ...current, emails: removeEntry(current.emails, id) }))}
                          />
                          <PhoneEntriesEditor
                            entries={profileDraft.phones}
                            onChange={updateProfilePhone}
                            onAdd={() => setProfileDraft((current) => ({
                              ...current,
                              phones: [...current.phones, newPhoneEntry({
                                category: current.phones.some((entry) => entry.category === "primary") ? "personal" : "primary",
                                countryCode: current.phones[0]?.countryCode || "+1"
                              })]
                            }))}
                            onRemove={(id) => setProfileDraft((current) => ({ ...current, phones: removeEntry(current.phones, id) }))}
                          />
                        </div>
                        <OccupationEntriesEditor
                          entries={profileDraft.occupations}
                          onChange={updateProfileOccupation}
                          onAdd={() => setProfileDraft((current) => ({ ...current, occupations: [...current.occupations, newOccupationEntry()] }))}
                          onRemove={(id) => setProfileDraft((current) => ({ ...current, occupations: removeEntry(current.occupations, id) }))}
                        />
                        <EducationEntriesEditor
                          entries={profileDraft.education}
                          onChange={updateProfileEducation}
                          onAdd={() => setProfileDraft((current) => ({ ...current, education: [...current.education, newEducationEntry()] }))}
                          onRemove={(id) => setProfileDraft((current) => ({ ...current, education: removeEntry(current.education, id) }))}
                        />
                        <LocationEntriesEditor
                          entries={profileDraft.locations}
                          onChange={updateProfileLocation}
                          onAdd={() => setProfileDraft((current) => ({
                            ...current,
                            locations: [...current.locations, newLocationEntry({ label: current.locations.length === 0 ? "Primary home" : "" })]
                          }))}
                          onRemove={(id) => setProfileDraft((current) => ({ ...current, locations: removeEntry(current.locations, id) }))}
                        />
                      </>
                    )}
                    </Fragment>
                  ))}
                </form>
                <datalist id="people-location-suggestions">
                  {locationSuggestions.map((location) => <option value={location} key={location} />)}
                </datalist>
              </div>
            ) : detailMode === "timeline" ? (
              <section className="people-timeline-panel">
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
                <div className="people-timeline-layout">
                  <section className="people-timeline-stream" aria-label={`${selectedPerson.title} relationship history`}>
                    <header>
                      <div>
                        <h3>Memories & interactions</h3>
                        <span>{timelineItems.length} saved {timelineItems.length === 1 ? "entry" : "entries"}</span>
                      </div>
                    </header>
                    <div className="people-timeline-list">
                      {timelineItems.length > 0 ? timelineItems.map((item) => item.kind === "memory" ? (
                        <article className="people-timeline-memory" data-memory-id={item.memory.id} data-memory-date={item.memory.occurredOn || ""} key={`memory-${item.id}`}>
                          {editingMemoryId === item.memory.id ? (
                            <div className="people-memory-inline-editor">
                              <label>
                                Memory
                                <textarea value={editingMemoryText} onChange={(event) => setEditingMemoryText(event.target.value)} rows={3} />
                              </label>
                              <label>
                                Date
                                <input type="date" value={editingMemoryDate} onChange={(event) => setEditingMemoryDate(event.target.value)} />
                              </label>
                              <div>
                                <button type="button" onClick={() => void saveMemoryEdit()} disabled={memoryEditSaving || !editingMemoryText.trim()}>
                                  {memoryEditSaving ? "Saving..." : "Save"}
                                </button>
                                <button type="button" onClick={cancelMemoryEdit} disabled={memoryEditSaving}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="people-memory-card-heading">
                                <span>{item.memory.occurredOn ? formatFullDate(item.memory.occurredOn) : "Date not set"}</span>
                                <button type="button" onClick={() => startMemoryEdit(item.memory)}>Edit</button>
                              </div>
                              <strong className="people-timeline-entry-title">{item.memory.text}</strong>
                              <p className="people-timeline-entry-body">{memoryCategoryLabel(item.memory.category)}</p>
                            </>
                          )}
                        </article>
                      ) : (
                        <article className="people-timeline-interaction" data-interaction-id={item.id} key={item.id}>
                          <div className="people-timeline-entry-meta">
                            <span>{item.date ? formatFullDate(item.date) : formatFullDate(selectedPerson.time.lastReview || selectedPerson.updatedAt)}</span>
                            {item.interaction.kind && <span className="people-timeline-kind">{item.interaction.kind}</span>}
                          </div>
                          <strong className="people-timeline-entry-title">{item.interaction.title}</strong>
                          {item.interaction.summary && <p className="people-timeline-entry-body">{item.interaction.summary}</p>}
                        </article>
                      )) : (
                        <div className="notes-empty-state">
                          <h3>No interactions yet</h3>
                          <p>Log a call, email, meeting, message, or memory to start the history.</p>
                        </div>
                      )}
                    </div>
                  </section>
                  <aside className="people-timeline-side" aria-label="Follow-ups and relationship rhythm">
                    <LinkedFollowUpsPanel
                      source={peopleFollowUpSource(selectedPerson)}
                      followUps={followUps}
                      loading={followUpsLoading}
                      error={followUpsError}
                      onRefresh={() => void refreshLinkedFollowUps()}
                      createHref={followUpCreationRoute(selectedPerson)}
                      limit={3}
                      compact
                      presentation="rail"
                      showBoundary={false}
                      title="Follow-ups"
                    />
                    <section className="people-relationship-rhythm">
                      <h3>Relationship rhythm</h3>
                      {[
                        ["Last contact", formatFullDate(selectedPerson.time.lastReview || selectedPerson.updatedAt)],
                        ["Next follow-up", getNextContactLabel(selectedPerson)],
                        ["Cadence", getCadenceLabel(selectedPerson.time.reviewCadence)],
                        ["Health", getPriorityLabel(selectedPerson) === "High" ? "Needs attention" : "Strong"]
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </section>
                  </aside>
                </div>
              </section>
            ) : detailMode === "workspace" ? (
              <section className="people-linked-workspace">
                <article>
                  <header className="people-linked-card-header">
                    <div><h3>Notes & memories</h3><span>{selectedMemories.length + selectedInteractions.length} timeline entries</span></div>
                    <button type="button" onClick={() => selectProfileView("notes")}>Open</button>
                  </header>
                  {selectedProfile.notes
                    ? selectedProfile.notes.split("\n").filter(Boolean).slice(0, 3).map((item) => <span key={item}>{item}</span>)
                    : <span>No profile notes yet.</span>}
                </article>
                <article>
                  <header className="people-linked-card-header">
                    <div><h3>Files & media</h3><span>Browse this person’s media context</span></div>
                    <a href={`${getModuleRoute("media")}?query=${encodeURIComponent(selectedPerson.title)}`}>Search Media</a>
                  </header>
                  <span>No directly linked Media files are visible on this profile.</span>
                </article>
                <article>
                  <header className="people-linked-card-header">
                    <div><h3>Projects</h3><span>Current involvement</span></div>
                    <div className="people-linked-card-tools">
                      <button
                        type="button"
                        onClick={() => void refreshProjects()}
                        disabled={projectsLoading}
                        aria-label={`Refresh Projects involvement for ${selectedPerson.title}`}
                      >
                        {projectsLoading ? "Checking…" : "Check"}
                      </button>
                      <details className="people-inline-info">
                        <summary aria-label="About project links">i</summary>
                        <p>Projects keeps roles and project status. People keeps identity, contact history, and cadence.</p>
                      </details>
                    </div>
                  </header>
                  <LinkedProjectsPanel
                    personId={selectedPerson.id}
                    personLabel={selectedPerson.title}
                    objectType={selectedPerson.className === "org" ? "organization" : "person"}
                    state={projectsState}
                    loading={projectsLoading}
                    error={projectsError}
                    onRefresh={() => void refreshProjects()}
                    legacyProjectLabels={selectedPerson.projects}
                    limit={3}
                    compact
                    showHeader={false}
                    showBoundary={false}
                  />
                </article>
                <article>
                  <header className="people-linked-card-header">
                    <div><h3>Resources</h3><span>Sources and saved references</span></div>
                    <a href={`${getModuleRoute("resources")}?query=${encodeURIComponent(selectedPerson.title)}`}>Search Resources</a>
                  </header>
                  {selectedPerson.externalSources.length ? selectedPerson.externalSources.map((item) => <a href={`${getModuleRoute("resources")}?query=${encodeURIComponent(item)}`} key={item}>{item}</a>) : <span>No Resources linked.</span>}
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
                      <label>
                        Date
                        <input type="date" value={memoryDate} onChange={(event) => setMemoryDate(event.target.value)} />
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
                    <h4>Memories · newest first</h4>
                    {selectedMemories.length ? selectedMemories.map((memory) => (
                      <article className="people-memory-card" data-memory-id={memory.id} data-memory-date={memory.occurredOn || ""} key={memory.id}>
                        {editingMemoryId === memory.id ? (
                          <div className="people-memory-inline-editor">
                            <label>
                              Memory
                              <textarea value={editingMemoryText} onChange={(event) => setEditingMemoryText(event.target.value)} rows={3} />
                            </label>
                            <label>
                              Date
                              <input type="date" value={editingMemoryDate} onChange={(event) => setEditingMemoryDate(event.target.value)} />
                            </label>
                            <div>
                              <button type="button" onClick={() => void saveMemoryEdit()} disabled={memoryEditSaving || !editingMemoryText.trim()}>
                                {memoryEditSaving ? "Saving..." : "Save"}
                              </button>
                              <button type="button" onClick={cancelMemoryEdit} disabled={memoryEditSaving}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="people-memory-card-heading">
                              <span>{memoryCategoryLabel(memory.category)}</span>
                              <div className="people-memory-card-heading-actions">
                                <time dateTime={memory.occurredOn}>{memory.occurredOn ? formatFullDate(memory.occurredOn) : "Date not set"}</time>
                                <button type="button" onClick={() => startMemoryEdit(memory)}>Edit</button>
                              </div>
                            </div>
                            <p>{memory.text}</p>
                            {!memory.pinned && <span>Saved note</span>}
                          </>
                        )}
                      </article>
                    )) : (
                      <div className="notes-empty-state">
                        <h3>No memories yet</h3>
                        <p>Add a dated moment or piece of context you want to remember later.</p>
                      </div>
                    )}
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
                      {connectionItems.length ? relationshipConnections.slice(0, 8).map((connection) => connection.target ? (
                        <button type="button" className="people-relation-node" key={connection.label} onClick={() => selectPerson(connection.target!)}>
                          <strong>{connection.label}</strong>
                          <span>Open profile</span>
                        </button>
                      ) : (
                        <div className="people-relation-node" key={connection.label}>
                          <strong>{connection.label}</strong>
                          <span>Saved context</span>
                        </div>
                      )) : (
                        <div className="people-relation-node">
                          <strong>No associated people yet</strong>
                          <span>Add the first relationship beside the map.</span>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="people-relation-form module-ref-tone-purple">
                    <h4>Add relationship</h4>
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
                    <h4>Recent context</h4>
                    {(selectedInteractions.length ? selectedInteractions : ["No relationship timeline entries yet"]).slice(0, 4).map((item) => (
                      <article key={item}>
                        <span>Timeline</span>
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </section>

                  <section className="people-relationship-projects">
                    <header className="people-linked-card-header">
                      <div><h4>Shared projects</h4><span>Current involvement</span></div>
                      <button
                        type="button"
                        onClick={() => void refreshProjects()}
                        disabled={projectsLoading}
                        aria-label={`Refresh Projects involvement for ${selectedPerson.title}`}
                      >
                        {projectsLoading ? "Checking…" : "Check"}
                      </button>
                    </header>
                    <LinkedProjectsPanel
                      personId={selectedPerson.id}
                      personLabel={selectedPerson.title}
                      objectType={selectedPerson.className === "org" ? "organization" : "person"}
                      state={projectsState}
                      loading={projectsLoading}
                      error={projectsError}
                      onRefresh={() => void refreshProjects()}
                      legacyProjectLabels={selectedPerson.projects}
                      limit={3}
                      compact
                      showHeader={false}
                      showBoundary={false}
                    />
                  </section>
                </div>
              </section>
            ) : (
              <section className="people-overview-grid">
                <section className="people-overview-contact-strip" data-people-overview-card="contact" aria-label="Contact methods">
                  <div className="people-contact-methods-compact">
                    {selectedContactMethods.map((method) => (
                      <button
                        type="button"
                        key={method.id}
                        data-contact-method={method.id}
                        data-available={method.available || undefined}
                        className={expandedContactMethod === method.id ? "is-active" : ""}
                        onClick={() => setExpandedContactMethod((current) => current === method.id ? null : method.id)}
                        aria-label={method.available ? `${expandedContactMethod === method.id ? "Hide" : "Show"} ${method.label}` : `${method.label} not added`}
                        aria-expanded={method.available ? expandedContactMethod === method.id : undefined}
                        title={method.available ? method.label : `${method.label} not added`}
                        disabled={!method.available}
                      >
                        <ContactMethodIcon id={method.id} />
                      </button>
                    ))}
                  </div>
                  {expandedContact && (
                    <div className="people-contact-disclosure" data-contact-disclosure={expandedContact.id}>
                      {expandedContact.details?.length ? expandedContact.details.map((detail) => (
                        <div className="people-contact-disclosure-row" key={`${detail.label}-${detail.value}`}>
                          <span>{detail.label}</span>
                          <strong>{detail.value}</strong>
                          {detail.href && (
                            <a href={detail.href} target={detail.href.startsWith("http") ? "_blank" : undefined} rel={detail.href.startsWith("http") ? "noreferrer" : undefined}>
                              {detail.actionLabel}
                            </a>
                          )}
                        </div>
                      )) : (
                        <>
                          <span>{expandedContact.label}</span>
                          <strong>{expandedContact.value}</strong>
                          {expandedContact.href && (
                            <a href={expandedContact.href} target={expandedContact.href.startsWith("http") ? "_blank" : undefined} rel={expandedContact.href.startsWith("http") ? "noreferrer" : undefined}>
                              {expandedContact.actionLabel}
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </section>
                <article className="people-overview-facts" data-people-overview-card="quick-info">
                  <h3 className="people-visually-hidden">Profile details</h3>
                  {[
                    ["Birthday", selectedProfile.birthday ? formatFullDate(selectedProfile.birthday) : "-"],
                    ["Location", selectedProfile.livesIn],
                    ["Hometown", selectedProfile.comesFrom],
                    ["Occupation", selectedProfile.primaryOccupation],
                    ["Employer", selectedProfile.primaryEmployer],
                    ["University", educationSummary(selectedProfile.education, selectedProfile.universityAffiliation)],
                    ["Partner", selectedProfile.partner],
                    ["Children", selectedProfile.children]
                  ].map(([label, value]) => (
                    <div className="people-info-row" key={label}>
                      <strong>{label}</strong>
                      <span>{value || "-"}</span>
                    </div>
                  ))}
                </article>
                <article className="people-overview-about" data-people-overview-card="about">
                  <h3>About {selectedPerson.title.split(" ")[0]}</h3>
                  <p>{selectedProfile.context || selectedPerson.body || "No relationship context recorded yet."}</p>
                </article>
                <article data-people-overview-card="projects">
                  <LinkedProjectsPanel
                    personId={selectedPerson.id}
                    personLabel={selectedPerson.title}
                    objectType={selectedPerson.className === "org" ? "organization" : "person"}
                    state={projectsState}
                    loading={projectsLoading}
                    error={projectsError}
                    onRefresh={() => void refreshProjects()}
                    legacyProjectLabels={selectedPerson.projects}
                    limit={2}
                    compact
                    showBoundary={false}
                  />
                </article>
                <article data-people-overview-card="connections">
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
              <h2 id="log-interaction-title">Log interaction with {selectedPerson.title}</h2>
              <button className="people-dialog-close" type="button" aria-label="Close interaction composer" onClick={() => setInteractionOpen(false)} disabled={interactionSaving}><span aria-hidden="true">×</span></button>
            </header>
            <div className="people-interaction-fields">
              <label>
                Type
                <select value={interactionKind} onChange={(event) => setInteractionKind(event.target.value as InteractionKind)}>
                  <option value="call">Call</option>
                  <option value="message">Message</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="catch-up">Catch-up</option>
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
            <footer className="people-dialog-actions">
              <button className="people-dialog-action" type="button" onClick={() => setInteractionOpen(false)} disabled={interactionSaving}>Cancel</button>
              <button className="people-dialog-action is-primary" type="submit" disabled={interactionSaving || !interactionTitle.trim() || !interactionDate}>
                {interactionSaving ? "Saving..." : "Save interaction"}
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
