"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import { mirrorPersonalRecord } from "../lib/local-first/domain-mirror";
import {
  buildFollowUpCreationRoute,
  type FollowUpSourceRef
} from "../lib/modules/personal-ops/follow-up-links";
import { sortPeopleMemories } from "../lib/modules/people/memories";
import { getSourceProjectConnections } from "../lib/modules/projects/people-links";
import { createProjectsRepository } from "../lib/modules/projects/repository";
import { peopleCreateInputToLegacy, peopleUpdateInputToLegacy } from "../lib/modules/people/legacy-adapter";
import { birthdayForStorage, formatBirthday, parseBirthday } from "../lib/modules/people/birthday";
import {
  PHONE_COUNTRY_FORMATS,
  canonicalCountryCode,
  formatInternationalPhone,
  normalizeCountryCodeInput,
  normalizePhoneForStorage,
  rebasePhoneCountryCode,
  validateInternationalPhone
} from "../lib/modules/people/phone";
import type { PersonalOpsFollowUp } from "../lib/modules/personal-ops/types";
import type { ProjectsState } from "../lib/modules/projects/types";
import { isUsableObjectLink, type ObjectLink } from "../lib/native-objects/links";
import { createNativeObjectRef, getModuleRoute, getNativeObjectRoute } from "../lib/native-objects/routes";
import type { NativeObjectRef } from "../lib/native-objects/types";
import { parsePeopleUrlState, serializePeopleUrlState } from "../lib/native-objects/url-state";
import type {
  PersonalContactProfile,
  PersonalContactEntryCategory,
  PersonalEmailEntry,
  PersonalEducationEntry,
  PersonalInteractionApproach,
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
import PeopleProfilePhotoDialog, { PeopleProfileAvatar } from "./people/PeopleProfilePhoto";
import { usePersonalOpsFollowUps } from "./operational/usePersonalOpsFollowUps";
import { useProjectsState } from "./operational/useProjectsState";

type RecordsResponse = {
  ok: boolean;
  items?: PersonalRecord[];
  error?: string;
};

type ProfilePhotoMetadata = {
  url: string;
  updatedAt: string;
  byteLength: number;
};

type PeopleWorkspaceProps = {
  initialPeople: PersonalRecord[];
  initialInteractions: PersonalRecord[];
  totalRecords: number;
  initialSelectedId?: string;
  initialMode?: "directory" | "profile" | "new" | "edit";
  initialLoadError?: string;
  initialFollowUps: PersonalOpsFollowUp[];
  initialFollowUpsError?: string;
  initialProjectsState: ProjectsState;
  initialProjectsError?: string;
  initialObjectLinks: ObjectLink[];
  initialObjectTargets: NativeObjectRef[];
};

type PeopleFilter = "all" | "due" | "week" | "active" | "dormant" | "orgs";
type PeopleView = "overview" | "timeline" | "links" | "properties";
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
  | "birthdays-month"
  | "new-people"
  | "profile-gaps"
  | "dormant"
  | "import-export"
  | "duplicates"
  | "recently-deleted"
  | "customize";
type PeopleSortMode = "last-name" | "recent-contact" | "next-follow-up";
type PeopleListMode = "list" | "compact" | "grid";
type PeopleLastContactFilter = "any" | "7d" | "30d" | "90d" | "none";
type InteractionKind = "call" | "message" | "email" | "meeting" | "catch-up" | "note" | "memory" | "milestone";
type ContactMethodId = "email" | "phone" | "website" | "instagram" | "tiktok" | "x" | "linkedin" | "youtube";

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
  approach?: PersonalInteractionApproach;
  updatesLastContact?: boolean;
};

type PeopleIconName =
  | "birthday"
  | "location"
  | "hometown"
  | "occupation"
  | "employer"
  | "university"
  | "partner"
  | "children"
  | "organization"
  | "industry"
  | "founded"
  | "team"
  | "edit"
  | "object"
  | "dormant"
  | "export"
  | "delete"
  | "chevron"
  | "search"
  | "filter"
  | "close"
  | "plus"
  | "groups"
  | "communication"
  | "notes"
  | "cadence"
  | "view-comfortable"
  | "view-compact"
  | "view-grid";

function PeopleIcon({ name }: { name: PeopleIconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      {name === "birthday" && <><path d="M5 10h14v10H5z" /><path d="M7 10V7h10v3M12 7V4M10.5 4.5 12 3l1.5 1.5" /><path d="M5 14c2 1.5 4.5 1.5 7 0 2.5 1.5 5 1.5 7 0" /></>}
      {name === "location" && <><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>}
      {name === "hometown" && <><path d="m4 11 8-7 8 7" /><path d="M6.5 10v10h11V10M10 20v-6h4v6" /></>}
      {name === "occupation" && <><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M9 7V4.5h6V7M3.5 12h17M10 12v2h4v-2" /></>}
      {name === "employer" && <><path d="M4 20V7l8-3v16M12 9l8-2v13" /><path d="M7 10h2M7 14h2M15 11h2M15 15h2" /></>}
      {name === "university" && <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M6 11.5V16c3.5 2.4 8.5 2.4 12 0v-4.5M21 9v6" /></>}
      {name === "partner" && <><path d="M8.5 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM15.5 19.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="m11.4 9.8 1.2 1.2" /></>}
      {name === "children" && <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="9" r="2.5" /><path d="M3.5 20c.3-4 1.8-6 4.5-6s4.2 2 4.5 6M12.5 20c.2-3.2 1.4-4.8 3.5-4.8s3.3 1.6 3.5 4.8" /></>}
      {name === "organization" && <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h3M8 12h3M14 8h2M14 12h2M9 20v-4h6v4" /></>}
      {name === "industry" && <><path d="M4 20V9l5 3V8l5 3V5l6 4v11Z" /><path d="M8 16h2M14 16h2" /></>}
      {name === "founded" && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>}
      {name === "team" && <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3.5 20c.3-4 2.1-6 5.5-6s5.2 2 5.5 6M14 15c3.6-.3 5.5 1.4 6 5" /></>}
      {name === "edit" && <><path d="m5 19 3.8-.8L19 8a2.1 2.1 0 0 0-3-3L5.8 15.2 5 19Z" /><path d="m14.5 6.5 3 3" /></>}
      {name === "object" && <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /><path d="M11 7.5h3.5A2.5 2.5 0 0 1 17 10v3M13 16.5H9.5A2.5 2.5 0 0 1 7 14v-3" /></>}
      {name === "dormant" && <><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" /></>}
      {name === "export" && <><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M5 13v7h14v-7" /></>}
      {name === "delete" && <><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>}
      {name === "chevron" && <path d="m9 6 6 6-6 6" />}
      {name === "search" && <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>}
      {name === "filter" && <path d="M4 6h16M7 12h10M10 18h4" />}
      {name === "close" && <path d="M6 6l12 12M18 6 6 18" />}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "groups" && <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c.3-4 2-6 5-6s4.7 2 5 6M13 15.5c3.8-.5 6 1 6.5 4.5" /></>}
      {name === "communication" && <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h5" /></>}
      {name === "notes" && <><path d="M6 3.5h9l3 3V20H6Z" /><path d="M15 3.5V7h3M9 11h6M9 14h6M9 17h4" /></>}
      {name === "cadence" && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>}
      {name === "view-comfortable" && <><rect x="4" y="5" width="16" height="5" rx="1.5" /><rect x="4" y="14" width="16" height="5" rx="1.5" /></>}
      {name === "view-compact" && <><path d="M5 7h14M5 12h14M5 17h14" /></>}
      {name === "view-grid" && <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>}
    </svg>
  );
}

function profileSectionIcon(title: string): PeopleIconName {
  const normalizedTitle = title.toLowerCase();
  if (normalizedTitle.includes("identity")) return "organization";
  if (normalizedTitle === "communication" || normalizedTitle === "links") return "communication";
  if (normalizedTitle.includes("group")) return "groups";
  if (normalizedTitle.includes("place") || normalizedTitle.includes("location")) return "location";
  if (normalizedTitle === "cadence") return "cadence";
  if (normalizedTitle.includes("about") || normalizedTitle.includes("note")) return "notes";
  return "object";
}

function RemoveIconButton({ label, onClick, className = "" }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={`people-remove-icon ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <PeopleIcon name="delete" />
    </button>
  );
}

function PeopleAddButton({
  label,
  onClick,
  className = "",
  disabled = false,
  ariaLabel
}: {
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`people-add-action ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || `Add ${label.toLowerCase()}`}
    >
      <PeopleIcon name="plus" />
      <span>{label}</span>
    </button>
  );
}

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
      {id === "youtube" && <><rect x="3.5" y="6.5" width="17" height="11" rx="3" /><path d="m10 9.5 5 2.5-5 2.5Z" /></>}
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
  if (id === "youtube") return { href: `https://youtube.com/@${username}`, actionLabel: "Open" };
  return {};
}

function vCardText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function vCardBirthday(value: string) {
  const parsed = parseBirthday(value);
  if (!parsed) return "";
  const month = String(parsed.month).padStart(2, "0");
  const day = String(parsed.day).padStart(2, "0");
  return parsed.year ? `${parsed.year}${month}${day}` : `--${month}${day}`;
}

type PeopleTimelineItem =
  | { kind: "memory"; id: string; date?: string; participantIds: string[]; memory: PersonalMemoryEntry }
  | { kind: "interaction"; id: string; date?: string; participantIds: string[]; interaction: PeopleTimelineInteraction };

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
  photoUrl: string;
  photoUpdatedAt: string;
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
  youtube: string;
  partner: string;
  organizationType: string;
  industry: string;
  mission: string;
  services: string;
  foundedYear: string;
  teamSize: string;
  headquarters: string;
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

type OrganizationOption = Pick<PersonalRecord, "id" | "title">;

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

const LAST_CONTACT_FILTER_OPTIONS: Array<{ value: PeopleLastContactFilter; label: string }> = [
  { value: "any", label: "Any time" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
  { value: "90d", label: "Past 90 days" },
  { value: "none", label: "No contact recorded" }
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

const ORGANIZATION_TYPE_OPTIONS = [
  "Business",
  "Nonprofit",
  "University / School",
  "Government",
  "Agency",
  "Community",
  "Association",
  "Other"
] as const;

type OrganizationType = (typeof ORGANIZATION_TYPE_OPTIONS)[number];

const ORGANIZATION_INDUSTRY_OPTIONS: Record<OrganizationType, readonly string[]> = {
  Business: [
    "Technology",
    "Professional services",
    "Retail & consumer",
    "Finance & insurance",
    "Healthcare",
    "Media & entertainment",
    "Manufacturing",
    "Construction & real estate",
    "Hospitality & travel",
    "Transportation & logistics",
    "Agriculture & food",
    "Energy & utilities",
    "Fashion & apparel",
    "Other"
  ],
  Nonprofit: [
    "Arts & culture",
    "Education",
    "Environment",
    "Health",
    "Human services",
    "Civil rights & advocacy",
    "Community development",
    "International development",
    "Religion & faith",
    "Research",
    "Animal welfare",
    "Other"
  ],
  "University / School": [
    "Primary / secondary education",
    "College / university",
    "Vocational / technical",
    "Research institute",
    "Online education",
    "Student organization",
    "Alumni organization",
    "Other"
  ],
  Government: [
    "Federal",
    "State / provincial",
    "Local / municipal",
    "Judicial / legal",
    "Public safety",
    "Public health",
    "Transportation",
    "Economic development",
    "Education",
    "International / diplomatic",
    "Other"
  ],
  Agency: [
    "Creative / design",
    "Marketing / advertising",
    "Talent / modeling",
    "Public relations",
    "Consulting",
    "Staffing / recruiting",
    "Digital / product",
    "Media / production",
    "Real estate",
    "Government / regulatory",
    "Other"
  ],
  Community: [
    "Neighborhood",
    "Professional network",
    "Cultural",
    "Religious / faith",
    "Sports / recreation",
    "Arts / creative",
    "Mutual aid",
    "Online community",
    "Social club",
    "Other"
  ],
  Association: [
    "Trade association",
    "Professional association",
    "Industry group",
    "Alumni association",
    "Standards body",
    "Labor / worker organization",
    "Membership organization",
    "Advocacy coalition",
    "Other"
  ],
  Other: [
    "Education",
    "Healthcare",
    "Technology",
    "Arts & culture",
    "Public service",
    "Research",
    "Media",
    "Community",
    "Professional services",
    "Other"
  ]
};

function organizationIndustryOptions(type: string): readonly string[] {
  return ORGANIZATION_INDUSTRY_OPTIONS[type as OrganizationType] || ORGANIZATION_INDUSTRY_OPTIONS.Other;
}

const PEOPLE_VIEWS: Array<{ id: PeopleView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "links", label: "Links" },
  { id: "properties", label: "Properties" }
];

const PEOPLE_DIRTY_HISTORY_GUARD = "__unigentamosPeopleDirtyGuard";
const PEOPLE_HISTORY_BACK_DESTINATION = "__people_history_back__";

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
      { key: "nickname", label: "Nickname" },
      { key: "firstName", label: "First name" },
      { key: "middleName", label: "Middle name" },
      { key: "lastName", label: "Last name" }
    ]
  },
  {
    title: "About",
    tone: "crimson",
    fields: [
      { key: "context", label: "About", type: "textarea", placeholder: "How you know them, why they matter, and the current relationship context." },
      { key: "lifeDream", label: "Life dream", type: "textarea" }
    ]
  },
  {
    title: "Communication",
    tone: "blue",
    fields: [
      { key: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://linkedin.com/in/..." },
      { key: "website", label: "Website", type: "url", placeholder: "https://..." },
      { key: "youtube", label: "YouTube", type: "url", placeholder: "https://youtube.com/@..." },
      { key: "instagram", label: "Instagram", type: "url", placeholder: "https://instagram.com/..." },
      { key: "tiktok", label: "TikTok", type: "url", placeholder: "https://tiktok.com/@..." },
      { key: "x", label: "X", type: "url", placeholder: "https://x.com/..." }
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
  }
];

const ORGANIZATION_PROFILE_SECTIONS: Array<{ title: string; tone: string; fields: ProfileField[] }> = [
  {
    title: "Organization identity",
    tone: "pink",
    fields: [
      { key: "fullName", label: "Organization name", placeholder: "Organization name" },
      { key: "organizationType", label: "Organization type" },
      { key: "industry", label: "Industry or field" },
      { key: "foundedYear", label: "Founded year", placeholder: "1998" },
      { key: "teamSize", label: "Team size", placeholder: "1–10, 50, global network..." },
      { key: "context", label: "Description", type: "textarea", placeholder: "What this organization is and why it is relevant." }
    ]
  },
  {
    title: "Links",
    tone: "blue",
    fields: [
      { key: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://linkedin.com/company/..." },
      { key: "website", label: "Website", type: "url", placeholder: "https://..." },
      { key: "youtube", label: "YouTube", type: "url", placeholder: "https://youtube.com/@..." },
      { key: "instagram", label: "Instagram", type: "url", placeholder: "https://instagram.com/..." },
      { key: "x", label: "X", type: "url", placeholder: "https://x.com/..." }
    ]
  },
  {
    title: "About",
    tone: "green",
    fields: []
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
  photoUrl: "",
  photoUpdatedAt: "",
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
  youtube: "",
  partner: "",
  organizationType: "",
  industry: "",
  mission: "",
  services: "",
  foundedYear: "",
  teamSize: "",
  headquarters: "",
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
  const birthday = parseBirthday(value);
  if (birthday) return new Date(birthday.year || 2000, birthday.month - 1, birthday.day);
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

function extractQuotedNickname(value: string): { fullName: string; nickname: string } | null {
  const match = value.match(/["“]([^"”]{1,80})["”]/);
  if (!match) return null;
  return {
    fullName: value.replace(match[0], " ").replace(/\s+/g, " ").trim(),
    nickname: match[1].trim()
  };
}

function formatFullDate(value?: string) {
  if (!value) return "-";
  if (value.startsWith("--")) return formatBirthday(value);
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

function newEducationEntry(input: Partial<PersonalEducationEntry> = {}): PersonalEducationEntry {
  return {
    id: input.id || `education-${crypto.randomUUID()}`,
    institution: input.institution || "",
    organizationId: input.organizationId,
    degree: input.degree,
    fieldOfStudy: input.fieldOfStudy
  };
}

function newOccupationEntry(input: Partial<PersonalOccupationEntry> = {}): PersonalOccupationEntry {
  return {
    id: input.id || `occupation-${crypto.randomUUID()}`,
    title: input.title || "",
    employer: input.employer,
    organizationId: input.organizationId,
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
    countryCode: canonicalCountryCode(input.countryCode || "+1")
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
      countryCode: canonicalCountryCode(entry.countryCode),
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
  "memory",
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

function canonicalInteractionItem(record: PersonalRecord): PeopleTimelineItem | null {
  if (record.className !== "interaction" || !record.interaction) return null;
  return {
    kind: "interaction",
    id: record.id,
    date: record.interaction.occurredOn,
    participantIds: record.interaction.participantIds,
    interaction: {
      date: record.interaction.occurredOn,
      kind: record.interaction.kind,
      title: record.title,
      summary: record.body || undefined,
      approach: record.interaction.approach,
      updatesLastContact: record.interaction.updatesLastContact
    }
  };
}

function legacyTimelineItems(record: PersonalRecord): PeopleTimelineItem[] {
  const profile = getProfile(record);
  return [
    ...splitTextEntries(profile.interactions).map((text, index): PeopleTimelineItem => {
      const interaction = parseTimelineInteraction(text);
      return {
        kind: "interaction",
        id: `legacy-interaction-${record.id}-${index}`,
        date: interaction.date || interactionOccurredOn(text),
        participantIds: [record.id],
        interaction: { ...interaction, updatesLastContact: false }
      };
    }),
    ...sortPeopleMemories(profile.memories).map((memory): PeopleTimelineItem => ({
      kind: "memory",
      id: `legacy-memory-${record.id}-${memory.id}`,
      date: memory.occurredOn,
      participantIds: [record.id],
      memory
    }))
  ];
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

function matchesRelationshipFilter(record: PersonalRecord, relationship: string) {
  if (!relationship) return true;
  const normalized = relationship.toLowerCase();
  return [...record.subjects, ...record.areas].some((value) => value.toLowerCase() === normalized);
}

function matchesLocationFilter(record: PersonalRecord, location: string) {
  if (!location) return true;
  const normalized = location.toLowerCase();
  const profile = getProfile(record);
  return [
    profile.livesIn,
    profile.comesFrom,
    profile.headquarters,
    ...profile.locations.flatMap((entry) => [entry.location || "", entry.address || ""])
  ].some((value) => value.toLowerCase().includes(normalized));
}

function matchesLastContactFilter(record: PersonalRecord, filter: PeopleLastContactFilter, interactionDate = "") {
  if (filter === "any") return true;
  const value = getLastContactValue(record, interactionDate);
  if (filter === "none") return !value;
  if (!value) return false;
  const timestamp = parseDisplayDate(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
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

function relationshipName(value: string) {
  return value.replace(/\s+\([^)]*\)\s*$/, "").trim();
}

function associatedPersonMatches(value: string, person: PersonalRecord) {
  const normalized = relationshipName(value).toLocaleLowerCase();
  return value === person.id || normalized === person.title.trim().toLocaleLowerCase();
}

function resolveAssociatedPersonIds(value: string | string[], people: PersonalRecord[]) {
  const entries = Array.isArray(value) ? value : splitList(value);
  return Array.from(new Set(entries.flatMap((entry) => {
    const person = people.find((candidate) => associatedPersonMatches(entry, candidate));
    return person ? [person.id] : [];
  })));
}

function mergeAssociatedPersonIds(value: string, people: PersonalRecord[], selectedIds: string[]) {
  const unresolvedEntries = splitList(value).filter((entry) => !people.some((person) => associatedPersonMatches(entry, person)));
  return joinList([...unresolvedEntries, ...selectedIds]);
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
    : profile?.livesIn || profile?.address || (record.className === "org" && profile?.headquarters)
      ? [newLocationEntry({
          id: "legacy-location-primary",
          label: record.className === "org" ? "Relevant location" : "Primary home",
          location: profile?.livesIn || (record.className === "org" ? profile?.headquarters : ""),
          address: profile?.address
        })]
      : [];
  return {
    fullName: profile?.fullName || record.title,
    firstName: profile?.firstName || "",
    middleName: profile?.middleName || "",
    lastName: profile?.lastName || "",
    nickname: profile?.nickname || "",
    context: profile?.context || record.body || "",
    birthday: profile?.birthday || "",
    photoUrl: profile?.photoUrl || "",
    photoUpdatedAt: profile?.photoUpdatedAt || "",
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
    youtube: profile?.youtube || "",
    partner: profile?.partner || "",
    organizationType: profile?.organizationType || "",
    industry: profile?.industry || "",
    mission: profile?.mission || "",
    services: profile?.services || "",
    foundedYear: profile?.foundedYear || "",
    teamSize: profile?.teamSize || "",
    headquarters: profile?.headquarters || "",
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

function getLastContactValue(record: PersonalRecord, interactionDate = ""): string {
  const profileDate = getProfile(record).lastContact || record.time.lastReview || "";
  if (!interactionDate) return profileDate;
  if (!profileDate) return interactionDate;
  const profileTimestamp = parseDisplayDate(profileDate).getTime();
  const interactionTimestamp = parseDisplayDate(interactionDate).getTime();
  if (Number.isNaN(interactionTimestamp)) return profileDate;
  return Number.isNaN(profileTimestamp) || interactionTimestamp > profileTimestamp ? interactionDate : profileDate;
}

function formatLastContact(record: PersonalRecord, full = false, interactionDate = ""): string {
  const value = getLastContactValue(record, interactionDate);
  if (!value) return "N/A";
  if (full) return formatFullDate(value);
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.getFullYear() === new Date().getFullYear() ? formatDate(value) : formatFullDate(value);
}

function lastContactTimestamp(record: PersonalRecord, interactionDate = ""): number {
  const value = getLastContactValue(record, interactionDate);
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = parseDisplayDate(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
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
    phoneCountryCode: primaryPhone?.countryCode || canonicalCountryCode(draft.phoneCountryCode),
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

function getRelationshipHealth(record?: PersonalRecord, interactionDate = "") {
  if (!record) return "Unknown";
  if (isDormant(record)) return "Dormant";
  if (isDue(record) || record.status === "blocked") return "Needs attention";
  if (!getLastContactValue(record, interactionDate)) return "Not enough history";
  return "On track";
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

function getDirectoryNextContactLabel(record: PersonalRecord) {
  if (!record.time.nextReview && getProfile(record).contactCadence.toUpperCase() === "NONE") {
    return "N/A";
  }
  return getNextContactLabel(record);
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

function isRecentContact(record: PersonalRecord, interactionDate = "") {
  const last = getLastContactValue(record, interactionDate);
  if (!last) return false;
  const date = parseDisplayDate(last);
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= 1000 * 60 * 60 * 24 * 30;
}

function isNoContact90(record: PersonalRecord, interactionDate = "") {
  const last = getLastContactValue(record, interactionDate);
  if (!last) return true;
  const date = parseDisplayDate(last);
  return Number.isNaN(date.getTime()) || Date.now() - date.getTime() > 1000 * 60 * 60 * 24 * 90;
}

function isBirthdayThisMonth(record: PersonalRecord) {
  const birthday = getProfile(record).birthday;
  if (!birthday) return false;
  const parsed = parseBirthday(birthday);
  return Boolean(parsed && parsed.month === new Date().getMonth() + 1);
}

function isNewPerson(record: PersonalRecord) {
  const date = new Date(record.createdAt);
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= 1000 * 60 * 60 * 24 * 30;
}

function getProfileGaps(record: PersonalRecord) {
  const profile = getProfile(record);
  if (record.className === "org") {
    return [
      !profile.organizationType ? "Organization type" : "",
      !profile.industry ? "Industry or field" : "",
      !profile.headquarters && !profile.livesIn ? "Relevant location" : "",
      !profile.website ? "Website" : "",
      !profile.context ? "Description" : ""
    ].filter(Boolean);
  }
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

function matchesSidebarView(record: PersonalRecord, view: PeopleSidebarView, interactionDate = "") {
  if (view === "all") return true;
  if (view === "starred") return record.starred === true;
  if (view === "recent") return isRecentContact(record, interactionDate);
  if (view === "upcoming") {
    const days = daysUntil(record.time.nextReview);
    return days !== null && days >= 0 && days <= 30;
  }
  if (view === "attention") return isDue(record) || record.status === "blocked" || getProfileGaps(record).length > 1;
  if (view === "relationship-map") return record.relations.related.length > 0 || getProfile(record).associatedPeople.length > 0;
  if (view === "family") return hasGroupLike(record, ["family", "parent", "sibling", "child"]);
  if (view === "close-friends") return hasGroupLike(record, ["close friend", "friend"]);
  if (view === "business") return hasGroupLike(record, ["business", "collaborator", "colleague", "coworker", "partner", "client", "work"]);
  if (view === "advisors-mentors") return hasGroupLike(record, ["advisor", "mentor"]);
  if (view === "neighbors") return hasGroupLike(record, ["neighbor"]);
  if (view === "health-wellness") return hasGroupLike(record, ["health", "wellness", "doctor", "therapy", "trainer"]);
  if (view === "no-contact-90") return isNoContact90(record, interactionDate);
  if (view === "birthdays-month") return isBirthdayThisMonth(record);
  if (view === "new-people") return isNewPerson(record);
  if (view === "profile-gaps") return getProfileGaps(record).length > 0;
  if (view === "dormant") return isDormant(record);
  return true;
}

function sortPeople(records: PersonalRecord[], sortMode: PeopleSortMode, interactionDates: Map<string, string> = new Map()) {
  return [...records].sort((left, right) => {
    if (sortMode === "recent-contact") {
      const difference = lastContactTimestamp(right, interactionDates.get(right.id)) - lastContactTimestamp(left, interactionDates.get(left.id));
      return !Number.isNaN(difference) && difference !== 0 ? difference : getLastName(left).localeCompare(getLastName(right));
    }
    if (sortMode === "next-follow-up") {
      return (new Date(left.time.nextReview || "9999-12-31").getTime()) - (new Date(right.time.nextReview || "9999-12-31").getTime());
    }
    return getLastName(left).localeCompare(getLastName(right));
  });
}

function BirthdayEditor({ value, onChange, label = "Birthday" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const parsed = parseBirthday(value);
  const [month, setMonth] = useState(parsed ? String(parsed.month) : "");
  const [day, setDay] = useState(parsed ? String(parsed.day) : "");
  const [year, setYear] = useState(parsed?.year ? String(parsed.year) : "");

  useEffect(() => {
    const next = parseBirthday(value);
    setMonth(next ? String(next.month) : "");
    setDay(next ? String(next.day) : "");
    setYear(next?.year ? String(next.year) : "");
  }, [value]);

  function commit(nextMonth: string, nextDay: string, nextYear: string) {
    if (!nextMonth && !nextDay && !nextYear) {
      onChange("");
      return;
    }
    if (!nextMonth || !nextDay) return;
    try {
      onChange(birthdayForStorage({
        month: Number(nextMonth),
        day: Number(nextDay),
        ...(nextYear ? { year: Number(nextYear) } : {})
      }));
    } catch {
      // Keep the draft controls editable until a complete calendar date is selected.
    }
  }

  return (
    <fieldset className="people-birthday-field" data-people-birthday-editor>
      <legend>{label}</legend>
      <label aria-label={`${label} month`}>
        <span className="people-visually-hidden">Month</span>
        <select value={month} onChange={(event) => {
          const next = event.target.value;
          setMonth(next);
          commit(next, day, year);
        }}>
          <option value="">Month</option>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((number) => (
            <option value={number} key={number}>{new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2000, number - 1, 1))}</option>
          ))}
        </select>
      </label>
      <label aria-label={`${label} day`}>
        <span className="people-visually-hidden">Day</span>
        <select value={day} onChange={(event) => {
          const next = event.target.value;
          setDay(next);
          commit(month, next, year);
        }}>
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((number) => <option value={number} key={number}>{number}</option>)}
        </select>
      </label>
      <label aria-label={`${label} year`}>
        <span className="people-visually-hidden">Year</span>
        <input
          inputMode="numeric"
          pattern="\d{4}"
          value={year}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, "").slice(0, 4);
            setYear(next);
            commit(month, day, next);
          }}
          placeholder="Year (optional)"
        />
      </label>
    </fieldset>
  );
}

function EducationEntriesEditor({
  entries,
  organizations,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalEducationEntry[];
  organizations: OrganizationOption[];
  onChange: (id: string, patch: Partial<PersonalEducationEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section people-themed-section module-ref-tone-purple" data-people-education-editor data-profile-section="education">
      <header className="people-repeatable-heading">
        <div className="people-repeatable-title"><span><PeopleIcon name="university" /></span><h4>Education</h4></div>
        <PeopleAddButton label="University" onClick={onAdd} />
      </header>
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-repeatable-entry" data-education-entry={entry.id} key={entry.id}>
          <div className="people-repeatable-fields people-repeatable-fields-education">
            <label>
              <span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>University</span>
              <select
                aria-label={`Education ${index + 1} organization`}
                value={entry.organizationId || ""}
                onChange={(event) => {
                  const organization = organizations.find((item) => item.id === event.target.value);
                  onChange(entry.id, { organizationId: organization?.id, institution: organization?.title || entry.institution });
                }}
              >
                <option value="">Select an Organization object</option>
                {entry.organizationId && !organizations.some((organization) => organization.id === entry.organizationId) && (
                  <option value={entry.organizationId}>{entry.institution || "Unavailable organization"} · unavailable</option>
                )}
                {organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.title}</option>)}
              </select>
            </label>
            <label><span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>Degree</span><input aria-label={`Education ${index + 1} degree`} value={entry.degree || ""} onChange={(event) => onChange(entry.id, { degree: event.target.value })} placeholder="Bachelor’s, Master’s, PhD..." /></label>
            <label><span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>Field of study</span><input aria-label={`Education ${index + 1} field of study`} value={entry.fieldOfStudy || ""} onChange={(event) => onChange(entry.id, { fieldOfStudy: event.target.value })} placeholder="Economics, design, engineering..." /></label>
            <RemoveIconButton className="people-repeatable-inline-remove" label={`Remove university ${index + 1}`} onClick={() => onRemove(entry.id)} />
          </div>
        </article>
      )) : <p className="people-repeatable-empty">No university added.</p>}
    </section>
  );
}

function OccupationEntriesEditor({
  entries,
  organizations,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalOccupationEntry[];
  organizations: OrganizationOption[];
  onChange: (id: string, patch: Partial<PersonalOccupationEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section people-themed-section module-ref-tone-green" data-people-occupation-editor data-profile-section="occupations">
      <header className="people-repeatable-heading">
        <div className="people-repeatable-title"><span><PeopleIcon name="occupation" /></span><h4>Occupations</h4></div>
        <PeopleAddButton label="Occupation" onClick={onAdd} />
      </header>
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-repeatable-entry" data-occupation-entry={entry.id} key={entry.id}>
          <div className="people-repeatable-fields people-repeatable-fields-job">
            <label><span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>Occupation</span><input aria-label={`Occupation ${index + 1} title`} value={entry.title} onChange={(event) => onChange(entry.id, { title: event.target.value })} placeholder="Product designer" /></label>
            <label>
              <span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>Employer</span>
              <select
                aria-label={`Job ${index + 1} organization`}
                value={entry.organizationId || ""}
                onChange={(event) => {
                  const organization = organizations.find((item) => item.id === event.target.value);
                  onChange(entry.id, { organizationId: organization?.id, employer: organization?.title || entry.employer });
                }}
              >
                <option value="">Select an Organization object</option>
                {entry.organizationId && !organizations.some((organization) => organization.id === entry.organizationId) && (
                  <option value={entry.organizationId}>{entry.employer || "Unavailable organization"} · unavailable</option>
                )}
                {organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.title}</option>)}
              </select>
            </label>
            <label><span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>When</span><select aria-label={`Occupation ${index + 1} timing`} value={entry.status} onChange={(event) => onChange(entry.id, { status: event.target.value as PersonalOccupationEntry["status"] })}><option value="current">Current</option><option value="past">Past</option></select></label>
            <RemoveIconButton className="people-repeatable-inline-remove" label={`Remove job ${index + 1}`} onClick={() => onRemove(entry.id)} />
          </div>
        </article>
      )) : <p className="people-repeatable-empty">No jobs added.</p>}
    </section>
  );
}

function LocationEntriesEditor({
  entries,
  organization = false,
  comesFrom = "",
  onComesFromChange,
  onChange,
  onAdd,
  onRemove
}: {
  entries: PersonalLocationEntry[];
  organization?: boolean;
  comesFrom?: string;
  onComesFromChange?: (value: string) => void;
  onChange: (id: string, patch: Partial<PersonalLocationEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="people-repeatable-section people-themed-section module-ref-tone-cyan" data-people-location-editor data-profile-section="locations">
      <header className="people-repeatable-heading">
        <div className="people-repeatable-title"><span><PeopleIcon name="location" /></span><h4>{organization ? "Locations" : "Places"}</h4></div>
        <PeopleAddButton label="Location" onClick={onAdd} />
      </header>
      {!organization && onComesFromChange && (
        <label className="people-comes-from-field">Comes from<input list="people-location-suggestions" value={comesFrom} onChange={(event) => onComesFromChange(event.target.value)} placeholder="Hometown or place of origin" /></label>
      )}
      {entries.length > 0 ? entries.map((entry, index) => (
        <article className="people-repeatable-entry" data-location-entry={entry.id} key={entry.id}>
          <div className="people-repeatable-fields people-repeatable-fields-location">
            <label><span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>Label</span><input aria-label={`Location ${index + 1} label`} value={entry.label || ""} onChange={(event) => onChange(entry.id, { label: event.target.value })} placeholder={organization ? "Relevant location" : index === 0 ? "Primary home" : "Second home"} /></label>
            <label><span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>City / region</span><input aria-label={`Location ${index + 1} city or region`} list="people-location-suggestions" value={entry.location || ""} onChange={(event) => onChange(entry.id, { location: event.target.value })} placeholder="Start typing a city" /></label>
            <RemoveIconButton className="people-repeatable-inline-remove" label={`Remove location ${index + 1}`} onClick={() => onRemove(entry.id)} />
            <label className="is-wide"><span className={index === 0 ? "people-field-label" : "people-visually-hidden"}>Street address</span><textarea aria-label={`Location ${index + 1} street address`} value={entry.address || ""} onChange={(event) => onChange(entry.id, { address: event.target.value })} placeholder="Street, apartment or unit, city, state, postal code, country" rows={2} /></label>
          </div>
        </article>
      )) : <p className="people-repeatable-empty">No location added.</p>}
    </section>
  );
}

function OrganizationIndustrySelect({
  organizationType,
  value,
  onChange
}: {
  organizationType: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = organizationIndustryOptions(organizationType);
  const hasLegacyValue = Boolean(value && !options.includes(value));
  return (
    <select data-organization-industry value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select industry or field</option>
      {hasLegacyValue && <option value={value}>{value} · current</option>}
      {options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>
  );
}

function OrganizationPeopleEditor({
  people,
  selectedIds,
  derivedIds = [],
  onChange
}: {
  people: PersonalRecord[];
  selectedIds: string[];
  derivedIds?: string[];
  onChange: (selectedIds: string[]) => void;
}) {
  const [pendingId, setPendingId] = useState("");
  const selected = new Set(selectedIds);
  const derived = new Set(derivedIds);
  const linkedIds = Array.from(new Set([...selectedIds, ...derivedIds]));
  const linkedPeople = linkedIds.flatMap((id) => {
    const person = people.find((candidate) => candidate.id === id);
    return person ? [person] : [];
  });
  const availablePeople = people.filter((person) => !selected.has(person.id) && !derived.has(person.id));

  function addPerson() {
    if (!pendingId || selected.has(pendingId) || derived.has(pendingId)) return;
    onChange([...selectedIds, pendingId]);
    setPendingId("");
  }

  return (
    <section className="people-organization-link-editor module-ref-tone-purple" data-organization-people-editor>
      <header>
        <div>
          <h4>People</h4>
          <p>Link people directly or let employer and education links add them automatically.</p>
        </div>
      </header>
      <div className="people-organization-link-controls">
        <label>
          Person
          <select aria-label="Person to link" value={pendingId} onChange={(event) => setPendingId(event.target.value)}>
            <option value="">Select a person</option>
            {availablePeople.map((person) => <option value={person.id} key={person.id}>{person.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={addPerson} disabled={!pendingId}>Add person</button>
      </div>
      <div className="people-organization-linked-list" aria-label="Linked people">
        {linkedPeople.length ? linkedPeople.map((person) => {
          const direct = selected.has(person.id);
          const backfilled = derived.has(person.id);
          const source = direct && backfilled ? "Direct + profile link" : backfilled ? "Employer or education link" : "Direct link";
          return (
            <article key={person.id} data-linked-person={person.id}>
              <PeopleProfileAvatar
                label={person.title}
                initials={getInitials(person)}
                photoUrl={person.profile?.photoUrl}
                photoUpdatedAt={person.profile?.photoUpdatedAt}
                compact
              />
              <span><strong>{person.title}</strong><small>{source}</small></span>
              {direct && (
                <RemoveIconButton label={`Remove direct link to ${person.title}`} onClick={() => onChange(selectedIds.filter((id) => id !== person.id))} />
              )}
            </article>
          );
        }) : <p>No people linked yet.</p>}
      </div>
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
    <section className="people-contact-channel-section" data-people-email-editor>
      <header className="people-repeatable-heading">
        <div><h4>Email addresses</h4></div>
        <PeopleAddButton label="Email" onClick={onAdd} />
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
            <RemoveIconButton className="people-contact-remove" label={`Remove email ${index + 1}`} onClick={() => onRemove(entry.id)} />
          </div>
        </article>
      )) : null}
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
    <section className="people-contact-channel-section" data-people-phone-editor>
      <header className="people-repeatable-heading">
        <div><h4>Phone numbers</h4></div>
        <PeopleAddButton label="Phone" onClick={onAdd} />
      </header>
      {entries.length > 0 ? entries.map((entry, index) => {
        const phoneError = entry.number.trim() && canonicalCountryCode(entry.countryCode, "")
          ? validateInternationalPhone(entry.number, entry.countryCode)
          : null;
        return (
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
                onBlur={() => onChange(entry.id, { number: formatInternationalPhone(entry.number, entry.countryCode) })}
                placeholder={entry.countryCode === "+51" ? "987-654-321" : "614-796-3848"}
                aria-describedby={phoneError ? `people-phone-error-${entry.id}` : undefined}
              />
            </label>
            <RemoveIconButton className="people-contact-remove" label={`Remove phone ${index + 1}`} onClick={() => onRemove(entry.id)} />
          </div>
          <details className="people-contact-entry-advanced" open={!entry.countryCode || entry.countryCode !== "+1"}>
            <summary>Country code {entry.countryCode || "required"}</summary>
            <label>
              Country code
              <input
                inputMode="tel"
                list="people-country-code-suggestions"
                value={entry.countryCode}
                onChange={(event) => {
                  const nextCode = normalizeCountryCodeInput(event.target.value);
                  onChange(entry.id, {
                    countryCode: nextCode,
                    number: /^\+\d{1,4}$/.test(nextCode) && nextCode !== entry.countryCode
                      ? rebasePhoneCountryCode(entry.number, entry.countryCode, nextCode)
                      : entry.number
                  });
                }}
                onBlur={(event) => {
                  const nextCode = canonicalCountryCode(event.target.value, "");
                  if (!nextCode) return;
                  onChange(entry.id, { countryCode: nextCode });
                }}
                placeholder="+1"
                required={Boolean(entry.number.trim())}
              />
            </label>
          </details>
          {phoneError && <p id={`people-phone-error-${entry.id}`} className="people-phone-error" role="status">{phoneError}</p>}
        </article>
      );
      }) : null}
      <datalist id="people-country-code-suggestions">
        {PHONE_COUNTRY_FORMATS.map((country) => <option value={country.code} label={`${country.country} · ${country.localDigits} digits`} key={country.code} />)}
      </datalist>
    </section>
  );
}

function PeopleNotesEditor({
  notes,
  onChange,
  title = "Notes",
  idPrefix = "people-about-note",
  editorKind = "notes"
}: {
  notes: string[];
  onChange: (notes: string[]) => void;
  title?: string;
  idPrefix?: string;
  editorKind?: string;
}) {
  const rows = notes.length > 0 ? notes : [""];

  function updateNote(index: number, value: string) {
    onChange(rows.map((note, noteIndex) => noteIndex === index ? value : note));
  }

  function removeNote(index: number) {
    const next = rows.filter((_, noteIndex) => noteIndex !== index);
    onChange(next.length > 0 ? next : [""]);
  }

  function addNote(afterIndex: number) {
    const next = [...rows.slice(0, afterIndex + 1), "", ...rows.slice(afterIndex + 1)];
    onChange(next);
    window.setTimeout(() => document.getElementById(`${idPrefix}-${afterIndex + 1}`)?.focus(), 0);
  }

  return (
    <section className="people-notes-editor" data-people-notes-editor={editorKind}>
      <header className="people-repeatable-heading">
        <div><h4>{title}</h4></div>
      </header>
      <div className="people-notes-list">
        {rows.map((note, index) => (
          <div className="people-note-row" key={`people-note-${index}`}>
            <span className="people-note-bullet" aria-hidden="true" />
            <textarea
              id={`${idPrefix}-${index}`}
              aria-label={`${title} note ${index + 1}`}
              rows={2}
              value={note}
              onChange={(event) => updateNote(index, event.target.value)}
              placeholder="Write a note…"
            />
            <div className="people-note-actions">
              <RemoveIconButton className="people-note-remove" label={`Remove note ${index + 1}`} onClick={() => removeNote(index)} />
              <button className="people-note-add" type="button" aria-label={`Add note after note ${index + 1}`} title="Add note" onClick={() => addNote(index)}><PeopleIcon name="plus" /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PeopleWorkspace({
  initialPeople,
  initialInteractions,
  totalRecords,
  initialSelectedId,
  initialMode = "directory",
  initialLoadError = "",
  initialFollowUps,
  initialFollowUpsError = "",
  initialProjectsState,
  initialProjectsError = "",
  initialObjectLinks,
  initialObjectTargets
}: PeopleWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialUrlState = parsePeopleUrlState(searchParams);
  const projectsRepository = useMemo(() => createProjectsRepository(), []);
  const [people, setPeople] = useState(initialPeople);
  const [interactionRecords, setInteractionRecords] = useState(initialInteractions);
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
  const [relationshipFilter, setRelationshipFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [lastContactFilter, setLastContactFilter] = useState<PeopleLastContactFilter>("any");
  const [activeSidebarView, setActiveSidebarView] = useState<PeopleSidebarView>(initialUrlState.sidebar);
  const [sortMode, setSortMode] = useState<PeopleSortMode>(initialUrlState.sort);
  const [listMode, setListMode] = useState<PeopleListMode>(initialUrlState.view);
  const [selectedId, setSelectedId] = useState(initialSelectedId || initialUrlState.person || initialPeople[0]?.id || "");
  const [name, setName] = useState("");
  const [quickNickname, setQuickNickname] = useState("");
  const [quickBirthday, setQuickBirthday] = useState("");
  const [className, setClassName] = useState<Extract<PersonalRecordClass, "person" | "org">>("person");
  const [groups, setGroups] = useState<string[]>(["Collaborator"]);
  const [status, setStatus] = useState<PersonalRecordStatus>("active");
  const [quickContext, setQuickContext] = useState("");
  const [quickNotes, setQuickNotes] = useState<string[]>([""]);
  const [quickOrganizationType, setQuickOrganizationType] = useState("Business");
  const [quickIndustry, setQuickIndustry] = useState("");
  const [quickFoundedYear, setQuickFoundedYear] = useState("");
  const [quickTeamSize, setQuickTeamSize] = useState("");
  const [quickOrganizationPeople, setQuickOrganizationPeople] = useState<string[]>([]);
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
  const [quickYouTube, setQuickYouTube] = useState("");
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
  const [objectLinkOpen, setObjectLinkOpen] = useState(false);
  const [objectLinkTargetId, setObjectLinkTargetId] = useState("");
  const [objectLinkRelationship, setObjectLinkRelationship] = useState("related");
  const [objectLinkSaving, setObjectLinkSaving] = useState(false);
  const [objectLinks, setObjectLinks] = useState(initialObjectLinks);
  const [dormantConfirmOpen, setDormantConfirmOpen] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState("");
  const [lifecycleSaving, setLifecycleSaving] = useState<"" | "star" | "dormant" | "delete" | "restore">("");
  const [expandedContactMethod, setExpandedContactMethod] = useState<ContactMethodId | null>(null);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNoteDraft, setQuickNoteDraft] = useState("");
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);
  const [utilityNotice, setUtilityNotice] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionKind, setInteractionKind] = useState<InteractionKind>("meeting");
  const [interactionApproach, setInteractionApproach] = useState<"" | PersonalInteractionApproach>("");
  const [interactionParticipantIds, setInteractionParticipantIds] = useState<string[]>([]);
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

  useEffect(() => {
    const handleProfileHistory = (event: PopStateEvent) => {
      if (suppressDirtyPopRef.current) return;
      if (window.location.pathname === `${getModuleRoute("people")}/new`) {
        setAddingPerson(true);
        setDetailMode("edit");
        setProfileMenuOpen(false);
        return;
      }
      const state = event.state?.__unigentamosPeopleRoute as {
        selectedId?: string;
        view?: PeopleView;
        mode?: DetailMode;
      } | undefined;
      const pathMatch = window.location.pathname.match(/^\/admin\/people\/([^/]+)(?:\/edit)?$/);
      const nextSelectedId = state?.selectedId || (pathMatch ? decodeURIComponent(pathMatch[1]) : "");
      const nextView = state?.view || parsePeopleUrlState(new URLSearchParams(window.location.search)).tab;
      if (nextSelectedId && people.some((record) => record.id === nextSelectedId && !record.archivedAt)) {
        setSelectedId(nextSelectedId);
      }
      setActiveView(nextView);
      setDetailMode(state?.mode || (
        window.location.pathname.endsWith("/edit") || nextView === "properties"
          ? "edit"
          : nextView === "timeline"
            ? "timeline"
            : nextView === "links"
              ? "workspace"
              : "profile"
      ));
      setAddingPerson(false);
      setProfileMenuOpen(false);
    };
    window.addEventListener("popstate", handleProfileHistory);
    return () => window.removeEventListener("popstate", handleProfileHistory);
  }, [people]);

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
          : next.tab === "links"
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
    if (!profileMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("#people-profile-action-menu, .people-profile-more")) return;
      setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

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

  function commitPeopleRoute(
    destination: string,
    state: { selectedId: string; view: PeopleView; mode: DetailMode },
    history: "push" | "replace" = "push"
  ) {
    if (typeof window === "undefined") return;
    const nextState = {
      ...(window.history.state || {}),
      __unigentamosPeopleRoute: state
    };
    if (history === "replace") window.history.replaceState(nextState, "", destination);
    else window.history.pushState(nextState, "", destination);
  }

  const activePeople = useMemo(() => people.filter((record) => !record.archivedAt), [people]);
  const allInteractionItems = useMemo(() => sortTimelineItems([
    ...interactionRecords.map(canonicalInteractionItem).filter((item): item is PeopleTimelineItem => Boolean(item)),
    ...activePeople.flatMap(legacyTimelineItems)
  ]), [activePeople, interactionRecords]);
  const latestInteractionDateByParticipant = useMemo(() => {
    const dates = new Map<string, string>();
    for (const item of allInteractionItems) {
      if (item.kind !== "interaction" || !item.date || item.interaction.updatesLastContact === false) continue;
      for (const participantId of item.participantIds) {
        const current = dates.get(participantId);
        if (!current || parseDisplayDate(item.date).getTime() > parseDisplayDate(current).getTime()) {
          dates.set(participantId, item.date);
        }
      }
    }
    return dates;
  }, [allInteractionItems]);
  const recentInteractionItems = allInteractionItems.slice(0, 8);
  const organizationOptions = useMemo<OrganizationOption[]>(
    () => activePeople
      .filter((record) => record.className === "org")
      .map((record) => ({ id: record.id, title: record.title }))
      .sort((left, right) => left.title.localeCompare(right.title)),
    [activePeople]
  );
  const personOptions = useMemo(
    () => activePeople
      .filter((record) => record.className === "person")
      .sort((left, right) => left.title.localeCompare(right.title)),
    [activePeople]
  );
  const archivedPeople = useMemo(
    () => people.filter((record) => Boolean(record.archivedAt)).sort((left, right) => (right.archivedAt || "").localeCompare(left.archivedAt || "")),
    [people]
  );
  const visiblePeople = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const utilityViews: PeopleSidebarView[] = ["all-lists", "import-export", "duplicates", "recently-deleted", "customize"];
    if (utilityViews.includes(activeSidebarView)) {
      return [];
    }
    const matches = activePeople.filter((record) => {
      if (!matchesSidebarView(record, activeSidebarView, latestInteractionDateByParticipant.get(record.id))) return false;
      if (!matchesFilter(record, activeFilter)) return false;
      if (!matchesRelationshipFilter(record, relationshipFilter)) return false;
      if (!matchesLocationFilter(record, locationFilter)) return false;
      if (!matchesLastContactFilter(record, lastContactFilter, latestInteractionDateByParticipant.get(record.id))) return false;
      if (!normalizedQuery) return true;
      return getSearchText(record).includes(normalizedQuery);
    });
    return sortPeople(matches, sortMode, latestInteractionDateByParticipant);
  }, [activeFilter, activePeople, activeSidebarView, lastContactFilter, latestInteractionDateByParticipant, locationFilter, query, relationshipFilter, sortMode]);

  const filterLocationOptions = useMemo(() => Array.from(new Set(activePeople.flatMap((record) => {
    const profile = getProfile(record);
    return [profile.livesIn, profile.comesFrom, profile.headquarters, ...profile.locations.map((entry) => entry.location || "")].filter(Boolean);
  }))).sort((left, right) => left.localeCompare(right)), [activePeople]);

  const locationSuggestions = useMemo(() => Array.from(new Set([
    ...activePeople.map((record) => record.profile?.livesIn || "").filter(Boolean),
    ...activePeople.flatMap((record) => (record.profile?.locations || []).map((entry) => entry.location || "").filter(Boolean)),
    ...COMMON_LOCATIONS
  ])).sort((left, right) => left.localeCompare(right)), [activePeople]);

  const selectedPerson = useMemo(() => {
    return activePeople.find((record) => record.id === selectedId) || visiblePeople[0];
  }, [activePeople, selectedId, visiblePeople]);
  const selectedOrganizationDerivedPersonIds = useMemo(() => {
    if (!selectedPerson || selectedPerson.className !== "org") return [];
    return personOptions.filter((record) => (
      (record.profile?.occupations || []).some((entry) => entry.organizationId === selectedPerson.id) ||
      (record.profile?.education || []).some((entry) => entry.organizationId === selectedPerson.id)
    )).map((record) => record.id);
  }, [personOptions, selectedPerson]);
  const selectedOrganizationDirectPersonIds = useMemo(() => {
    if (!selectedPerson || selectedPerson.className !== "org") return [];
    return resolveAssociatedPersonIds(selectedPerson.profile?.associatedPeople || [], personOptions);
  }, [personOptions, selectedPerson]);
  const selectedOrganizationPeople = useMemo(() => {
    const linkedIds = new Set([...selectedOrganizationDirectPersonIds, ...selectedOrganizationDerivedPersonIds]);
    return personOptions.filter((record) => linkedIds.has(record.id));
  }, [personOptions, selectedOrganizationDerivedPersonIds, selectedOrganizationDirectPersonIds]);
  const deleteTarget = useMemo(() => people.find((record) => record.id === deleteTargetId), [deleteTargetId, people]);
  useEffect(() => {
    setProfileDraft(getProfile(selectedPerson));
    setProfileGroups(selectedPerson?.subjects || []);
    setExpandedContactMethod(null);
    setQuickNoteOpen(false);
    setQuickNoteDraft("");
  }, [selectedPerson?.id]);

  const stats = useMemo(() => {
    const countFor = (view: PeopleSidebarView) => activePeople.filter((record) => (
      matchesSidebarView(record, view, latestInteractionDateByParticipant.get(record.id))
    )).length;
    return {
      total: activePeople.length,
      due: activePeople.filter(isDue).length,
      week: activePeople.filter(isThisWeek).length,
      dormant: activePeople.filter(isDormant).length,
      strongTies: activePeople.filter((record) => record.status === "active" || record.projects.length > 0).length,
      completeProfiles: activePeople.filter((record) => countProfileFields(record) >= 8).length,
      starred: activePeople.filter((record) => record.starred === true).length,
      recent: countFor("recent"),
      upcoming: countFor("upcoming"),
      attention: countFor("attention"),
      relationshipMap: countFor("relationship-map"),
      noContact90: countFor("no-contact-90"),
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
  }, [activePeople, latestInteractionDateByParticipant]);

  const selectedProfile = getProfile(selectedPerson);
  const selectedNotes = selectedProfile.notes.split(/\r?\n/).map((note) => note.trim()).filter(Boolean);
  const organizationProfileSelectedPersonIds = selectedPerson?.className === "org"
    ? resolveAssociatedPersonIds(profileDraft.associatedPeople, personOptions)
    : [];
  const emailContactDetails = selectedProfile.emails.map((entry) => ({
    label: contactEntryLabel(entry),
    value: entry.address,
    ...contactMethodHref("email", entry.address)
  }));
  const phoneContactDetails = selectedProfile.phones.map((entry) => {
    const value = formatInternationalPhone(entry.number, entry.countryCode);
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
    { id: "linkedin", label: "LinkedIn", value: selectedProfile.linkedin },
    { id: "youtube", label: "YouTube", value: selectedProfile.youtube }
  ] satisfies Array<Omit<ContactMethod, "available">>)
    .filter((method) => selectedPerson?.className !== "org" || !["email", "phone"].includes(method.id))
    .map((method) => ({
    ...method,
    available: Boolean(method.value),
    ...contactMethodHref(method.id, method.value)
  }));
  const expandedContact = selectedContactMethods.find((method) => method.available && method.id === expandedContactMethod);
  const fallbackPerson = selectedPerson || visiblePeople[0];
  const activeFilterCount = (activeFilter === "all" ? 0 : 1)
    + (relationshipFilter ? 1 : 0)
    + (locationFilter ? 1 : 0)
    + (lastContactFilter === "any" ? 0 : 1)
    + (query.trim() ? 1 : 0);
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
  const resolvedUtilityNotice = activeSidebarItem?.surface === "utility" && activeSidebarView !== "recently-deleted"
    ? utilityNotice || `${activeViewLabel} is a read-only People utility in this checkpoint. Stored-data actions remain disabled until matching backend support exists.`
    : utilityNotice;
  const profileGaps = selectedPerson ? getProfileGaps(selectedPerson) : [];
  const selectedInteractionItems = selectedPerson
    ? allInteractionItems.filter((item) => item.participantIds.includes(selectedPerson.id))
    : [];
  const selectedChildren = splitList(selectedProfile.children);
  const associatedPeople = splitList(selectedProfile.associatedPeople);
  const relationshipConnections = Array.from(new Map([
    ...associatedPeople.map((label) => {
      const name = relationshipName(label);
      const target = people.find((record) => record.id === label || record.title.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
      const resolvedLabel = target?.title || label;
      return [resolvedLabel.toLowerCase(), { label: resolvedLabel, target }] as const;
    }),
    ...(selectedPerson?.relations.related || []).map((id) => {
      const target = people.find((record) => record.id === id);
      return [(target?.title || id).toLowerCase(), { label: target?.title || id, target }] as const;
    }),
    ...selectedOrganizationPeople.map((target) => [target.title.toLowerCase(), { label: target.title, target }] as const)
  ]).values());
  const peopleConnections = relationshipConnections.filter((connection) => connection.target?.className === "person");
  const organizationConnections = relationshipConnections.filter((connection) => connection.target?.className === "org");
  const unresolvedConnections = relationshipConnections.filter((connection) => !connection.target);
  const selectedPersonRef = selectedPerson ? createNativeObjectRef({
    module: "people",
    objectType: selectedPerson.className === "org" ? "organization" : "person",
    objectId: selectedPerson.id,
    label: selectedPerson.title,
    versionId: selectedPerson.updatedAt
  }) : null;
  const selectedNativeObjectLinks = selectedPersonRef ? objectLinks
    .filter(isUsableObjectLink)
    .filter((link) => (
      link.source.module === selectedPersonRef.module &&
      link.source.objectType === selectedPersonRef.objectType &&
      link.source.objectId === selectedPersonRef.objectId
    ) || (
      link.target.module === selectedPersonRef.module &&
      link.target.objectType === selectedPersonRef.objectType &&
      link.target.objectId === selectedPersonRef.objectId
    ))
    .map((link) => ({
      link,
      object: link.source.objectId === selectedPersonRef.objectId && link.source.module === "people"
        ? link.target
        : link.source
    }))
    : [];
  const selectedProjectConnections = selectedPersonRef
    ? getSourceProjectConnections(projectsState, selectedPersonRef, { includeOwner: true })
    : [];
  const linkedNativeTargetKeys = new Set([
    ...selectedNativeObjectLinks.map(({ object }) => `${object.module}:${object.objectType}:${object.objectId}`),
    ...relationshipConnections.flatMap((connection) => connection.target
      ? [`people:${connection.target.className === "org" ? "organization" : "person"}:${connection.target.id}`]
      : []),
    ...selectedProjectConnections.map((connection) => `projects:project:${connection.projectId}`)
  ]);
  const availableObjectTargets = initialObjectTargets.filter((target) => (
    !selectedPersonRef ||
    !(target.module === selectedPersonRef.module && target.objectType === selectedPersonRef.objectType && target.objectId === selectedPersonRef.objectId)
  ) && !linkedNativeTargetKeys.has(`${target.module}:${target.objectType}:${target.objectId}`));
  const timelineItems = selectedInteractionItems.slice(0, 20);
  const selectedTags = Array.from(new Set([
    ...(fallbackPerson?.subjects || []).slice(0, 3),
    ...(selectedPerson?.projects || []).slice(0, 2)
  ].filter(Boolean)));
  const overviewFacts: Array<{ label: string; value: string; icon: PeopleIconName; group: "life" | "work" | "relationships" }> = selectedPerson?.className === "org" ? [
    { label: "Type", value: selectedProfile.organizationType, icon: "organization", group: "work" },
    { label: "Industry", value: selectedProfile.industry, icon: "industry", group: "work" },
    { label: "Headquarters", value: selectedProfile.headquarters || selectedProfile.livesIn, icon: "location", group: "life" },
    { label: "Founded", value: selectedProfile.foundedYear, icon: "founded", group: "life" },
    { label: "Team size", value: selectedProfile.teamSize, icon: "team", group: "relationships" },
    { label: "Linked people", value: selectedOrganizationPeople.length ? String(selectedOrganizationPeople.length) : "-", icon: "children", group: "relationships" }
  ] : [
    { label: "Birthday", value: selectedProfile.birthday ? formatFullDate(selectedProfile.birthday) : "-", icon: "birthday", group: "life" },
    { label: "Location", value: selectedProfile.livesIn, icon: "location", group: "life" },
    { label: "Hometown", value: selectedProfile.comesFrom, icon: "hometown", group: "life" },
    { label: "Occupation", value: selectedProfile.primaryOccupation, icon: "occupation", group: "work" },
    { label: "Employer", value: selectedProfile.primaryEmployer, icon: "employer", group: "work" },
    { label: "Partner", value: selectedProfile.partner, icon: "partner", group: "relationships" },
    { label: "Children", value: selectedProfile.children, icon: "children", group: "relationships" }
  ];
  const overviewEducation: PersonalEducationEntry[] = selectedProfile.education.length > 0
    ? selectedProfile.education
    : selectedProfile.universityAffiliation
      ? [{ id: "legacy-overview-education", institution: selectedProfile.universityAffiliation }]
      : [];
  const addFormDirty = [
    name,
    quickNickname,
    quickBirthday,
    quickContext,
    ...quickNotes,
    quickIndustry,
    quickFoundedYear,
    quickTeamSize,
    quickProjects,
    lastContact,
    nextContact,
    referenceUrl,
    quickInstagram,
    quickTikTok,
    quickX,
    quickLinkedIn,
    quickYouTube
  ].some((value) => value.trim().length > 0)
    || (className === "person" && cleanEmailEntries(quickEmails).length > 0)
    || (className === "person" && cleanPhoneEntries(quickPhones).length > 0)
    || cleanEducationEntries(quickEducation).length > 0
    || cleanOccupationEntries(quickOccupations).length > 0
    || cleanLocationEntries(quickLocations).length > 0
    || quickOrganizationPeople.length > 0
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
      "birthdays-month": stats.birthdaysMonth,
      "new-people": stats.newPeople,
      "profile-gaps": stats.profileGaps,
      dormant: stats.dormant,
      duplicates: 0,
      "recently-deleted": archivedPeople.length
    };
    return counts[view];
  }

  function selectSidebarView(item: SidebarItemConfig) {
    const destination = buildPeopleDestination(
      {
        sidebar: item.id,
        filter: "all",
        person: "",
        tab: item.surface === "profile" || item.id === "relationship-map" ? "links" : "overview"
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
      setActiveView("links");
      setDetailMode("profile");
      updatePeopleUrl(
        { sidebar: item.id, filter: "all", tab: "links", person: "" },
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
    } else if (view === "links") {
      setDetailMode("workspace");
    } else if (view === "properties") {
      setDetailMode("edit");
    } else {
      setDetailMode("profile");
    }
    commitPeopleRoute(destination, {
      selectedId: selectedPerson.id,
      view,
      mode: view === "timeline" ? "timeline" : view === "links" ? "workspace" : view === "properties" ? "edit" : "profile"
    });
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
    setActionNotice("");
    setProfileMenuOpen(false);
    commitPeopleRoute(destination, { selectedId: record.id, view: "overview", mode: "profile" });
  }

  async function saveProfileDraft(nextDraft: ContactProfileDraft) {
    if (!selectedPerson) return false;
    const builtProfile = buildProfilePayload(nextDraft);
    const profile = selectedPerson.className === "org"
      ? {
          ...builtProfile,
          headquarters: builtProfile.locations[0]?.location || builtProfile.locations[0]?.address || builtProfile.headquarters
        }
      : builtProfile;
    const previousProfileSources = new Set(
      [selectedProfile.website, selectedProfile.linkedin, selectedProfile.youtube, selectedProfile.instagram, selectedProfile.tiktok, selectedProfile.x]
        .filter((value): value is string => Boolean(value))
    );
    const preservedSources = selectedPerson.externalSources.filter((source) => !previousProfileSources.has(source));
    const profileSources = [profile.website, profile.linkedin, profile.youtube, profile.instagram, profile.tiktok, profile.x]
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

  async function saveQuickNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = quickNoteDraft.trim();
    if (!note || !selectedPerson || quickNoteSaving) return;
    setQuickNoteSaving(true);
    const saved = await saveProfileDraft({
      ...selectedProfile,
      notes: [...selectedNotes, note].join("\n")
    });
    setQuickNoteSaving(false);
    if (!saved) return;
    setQuickNoteDraft("");
    setQuickNoteOpen(false);
    setActionNotice("Note added.");
  }

  function openInteractionComposer(record?: PersonalRecord) {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setInteractionDate(localDate);
    setInteractionKind("meeting");
    setInteractionApproach("");
    setInteractionParticipantIds(record ? [record.id] : []);
    setInteractionTitle("");
    setInteractionSummary("");
    setInteractionMeaningful(true);
    setInteractionOpen(true);
    setActionNotice("");
  }

  async function saveInteraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactionDate || !interactionTitle.trim() || interactionParticipantIds.length === 0) return;
    setInteractionSaving(true);
    const kindLabel = interactionKind === "catch-up" ? "Catch-up" : labelize(interactionKind);
    try {
      const response = await fetch("/api/personal/records", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({
          domain: "notes-docs",
          title: interactionTitle.trim(),
          className: "interaction",
          privacy: "private",
          stage: "processed",
          status: "completed",
          body: interactionSummary.trim(),
          happensOn: interactionDate,
          areas: ["Relationships"],
          subjects: [kindLabel, ...(interactionApproach ? [`${labelize(interactionApproach)} approach`] : [])],
          intents: ["connect"],
          interaction: {
            participantIds: interactionParticipantIds,
            kind: interactionKind,
            occurredOn: interactionDate,
            approach: interactionApproach || undefined,
            updatesLastContact: interactionMeaningful
          }
        })
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid server response" }))) as RecordsResponse;
      if (!response.ok || !payload.ok || !payload.items) {
        setError(payload.error || "Failed to save interaction");
        return;
      }
      const nextPeople = payload.items.filter((record) => record.className === "person" || record.className === "org");
      const nextInteractions = payload.items.filter((record) => record.className === "interaction" && record.interaction);
      const createdInteraction = nextInteractions.find((record) => (
        record.title === interactionTitle.trim() && record.interaction?.occurredOn === interactionDate
      ));
      setPeople(nextPeople);
      setInteractionRecords(nextInteractions);
      if (createdInteraction) await mirrorPersonalRecord(createdInteraction);
      setInteractionOpen(false);
      setInteractionTitle("");
      setInteractionSummary("");
      setInteractionParticipantIds([]);
      setInteractionApproach("");
      setActionNotice(`Interaction saved to ${interactionParticipantIds.length} ${interactionParticipantIds.length === 1 ? "profile" : "profiles"}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save the interaction. Your draft is still here.");
    } finally {
      setInteractionSaving(false);
    }
  }

  async function submitPerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const derivedName = className === "person" ? derivePersonNameParts(name) : { firstName: "", middleName: "", lastName: "" };
    const organizationLocation = className === "org" ? cleanLocationEntries(quickLocations)[0] : undefined;
    const profile = buildProfilePayload({
      ...EMPTY_PROFILE_DRAFT,
      fullName: name,
      ...derivedName,
      nickname: className === "person" ? quickNickname : "",
      birthday: className === "person" ? quickBirthday : "",
      context: quickContext,
      notes: joinTextEntries(quickNotes.filter((note) => note.trim())),
      organizationType: className === "org" ? quickOrganizationType : "",
      industry: className === "org" ? quickIndustry : "",
      foundedYear: className === "org" ? quickFoundedYear : "",
      teamSize: className === "org" ? quickTeamSize : "",
      headquarters: organizationLocation?.location || organizationLocation?.address || "",
      associatedPeople: className === "org" ? joinList(quickOrganizationPeople) : "",
      emails: className === "person" ? quickEmails : [],
      phones: className === "person" ? quickPhones : [],
      education: className === "person" ? quickEducation : [],
      occupations: className === "person" ? quickOccupations : [],
      locations: quickLocations,
      lastContact: className === "person" ? lastContact : "",
      nextContact: className === "person" ? nextContact : "",
      contactCadence: className === "person" ? cadence : "",
      website: referenceUrl,
      instagram: quickInstagram,
      tiktok: quickTikTok,
      x: quickX,
      linkedin: quickLinkedIn,
      youtube: quickYouTube
    });

    const legacyInput = peopleCreateInputToLegacy({
      fullName: name.trim(),
      type: className === "org" ? "organization" : "person",
      status: className === "org" ? "active" : status,
      context: quickContext,
      profile,
      time: {
        reviewCadence: className === "person" ? cadence : "",
        lastReview: className === "person" ? lastContact : "",
        nextReview: className === "person" ? nextContact : ""
      },
      areas: ["Relationships"],
      subjects: className === "org" ? [] : groups,
      projects: splitList(quickProjects),
      externalSources: [referenceUrl, quickInstagram, quickTikTok, quickX, quickLinkedIn, quickYouTube].filter(Boolean),
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
      setQuickNickname("");
      setQuickBirthday("");
      setClassName("person");
      setGroups(["Collaborator"]);
      setStatus("active");
      setQuickContext("");
      setQuickNotes([""]);
      setQuickOrganizationType("Business");
      setQuickIndustry("");
      setQuickFoundedYear("");
      setQuickTeamSize("");
      setQuickOrganizationPeople([]);
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
      setQuickYouTube("");
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
      action?: "review" | "archive" | "restore";
      archiveReason?: string;
      starred?: boolean;
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
    const currentRecord = people.find((record) => record.id === id);
    try {
      const response = await fetch("/api/personal/records", {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({
          id,
          expectedUpdatedAt: currentRecord?.updatedAt,
          ...legacyPatch,
          ...(patch.action ? { action: patch.action } : {}),
          ...(typeof patch.starred === "boolean" ? { starred: patch.starred } : {}),
          ...(patch.archiveReason ? { archiveReason: patch.archiveReason } : {})
        })
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

  async function toggleStar(record: PersonalRecord) {
    if (lifecycleSaving) return;
    setLifecycleSaving("star");
    const saved = await patchPerson(record.id, { starred: record.starred !== true });
    if (saved) {
      setActionNotice(record.starred ? `${record.title} is no longer starred.` : `${record.title} is now starred.`);
    }
    setLifecycleSaving("");
  }

  async function toggleDormant() {
    if (!selectedPerson || lifecycleSaving) return;
    setLifecycleSaving("dormant");
    const nextDormant = selectedPerson.status !== "inactive";
    const saved = await patchPerson(selectedPerson.id, { status: nextDormant ? "inactive" : "active" });
    setLifecycleSaving("");
    if (!saved) return;
    setDormantConfirmOpen(false);
    setProfileMenuOpen(false);
    setActionNotice(`${selectedPerson.title} is now ${nextDormant ? "dormant" : "active"}.`);
  }

  function exportContact() {
    if (!selectedPerson) return;
    const profile = getProfile(selectedPerson);
    const nameParts = [profile.lastName, profile.firstName, profile.middleName].map((value) => vCardText(value || ""));
    const lines = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      `FN:${vCardText(selectedPerson.title)}`,
      `N:${nameParts.join(";")};;`,
      ...(profile.nickname ? [`NICKNAME:${vCardText(profile.nickname)}`] : []),
      ...(vCardBirthday(profile.birthday || "") ? [`BDAY:${vCardBirthday(profile.birthday || "")}`] : []),
      ...profile.emails.filter((entry) => entry.address).map((entry) => `EMAIL;TYPE=${entry.category.toUpperCase()}:${vCardText(entry.address)}`),
      ...profile.phones.filter((entry) => entry.number).map((entry) => `TEL;TYPE=${entry.category.toUpperCase()}:${vCardText(formatInternationalPhone(entry.number, entry.countryCode))}`),
      ...(profile.primaryOccupation ? [`TITLE:${vCardText(profile.primaryOccupation)}`] : []),
      ...(profile.primaryEmployer ? [`ORG:${vCardText(profile.primaryEmployer)}`] : []),
      ...(profile.livesIn ? [`ADR;TYPE=HOME:;;${vCardText(profile.livesIn)};;;;`] : []),
      ...(profile.context ? [`NOTE:${vCardText(profile.context)}`] : []),
      ...(profile.website ? [`URL:${vCardText(profile.website)}`] : []),
      "END:VCARD"
    ];
    const blob = new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedPerson.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "contact"}.vcf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setProfileMenuOpen(false);
    setActionNotice(`Exported ${selectedPerson.title} as a vCard.`);
  }

  async function saveObjectLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPersonRef || objectLinkSaving) return;
    const target = availableObjectTargets.find((candidate) => `${candidate.module}:${candidate.objectType}:${candidate.objectId}` === objectLinkTargetId);
    if (!target) {
      setError("Choose an object to link.");
      return;
    }
    setObjectLinkSaving(true);
    setError("");
    try {
      if (target.module === "projects" && target.objectType === "project") {
        const result = await projectsRepository.create("links", {
          projectId: target.objectId,
          source: selectedPersonRef,
          relationship: "project_person",
          relationshipStrength: "normal",
          role: objectLinkRelationship === "related" ? undefined : labelize(objectLinkRelationship),
          projectSpecificNote: "Linked from People"
        });
        if (!result.ok) throw new Error(result.error.message);
        await refreshProjects();
      } else if (target.module === "people" && target.objectType === "organization") {
        const saved = await saveProfileDraft({
          ...selectedProfile,
          associatedPeople: [...splitList(selectedProfile.associatedPeople), `${target.label} (${labelize(objectLinkRelationship)})`].join(", ")
        });
        if (!saved) throw new Error("The organization relationship could not be saved.");
      } else {
      const response = await fetch("/api/native-links", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ source: selectedPersonRef, target, relationship: objectLinkRelationship })
      });
      const payload = await response.json().catch(() => ({ ok: false, error: "Invalid server response" })) as {
        ok?: boolean;
        item?: ObjectLink;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.item) throw new Error(payload.error || "The object link could not be saved.");
      setObjectLinks((current) => current.some((link) => link.id === payload.item!.id) ? current : [...current, payload.item!]);
      }
      setObjectLinkOpen(false);
      setObjectLinkTargetId("");
      setObjectLinkRelationship("related");
      setActionNotice(`${selectedPerson.title} was linked to ${target.label}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The object link could not be saved.");
    } finally {
      setObjectLinkSaving(false);
    }
  }

  async function removeObjectLink(link: ObjectLink) {
    if (objectLinkSaving) return;
    setObjectLinkSaving(true);
    setError("");
    try {
      const response = await fetch("/api/native-links", {
        method: "DELETE",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ id: link.id, reason: "Removed from People Links" })
      });
      const payload = await response.json().catch(() => ({ ok: false, error: "Invalid server response" })) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The object link could not be removed.");
      setObjectLinks((current) => current.map((item) => item.id === link.id ? { ...item, status: "removed" } : item));
      setActionNotice("Object link removed. The linked object was not deleted.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The object link could not be removed.");
    } finally {
      setObjectLinkSaving(false);
    }
  }

  async function deleteProfile() {
    if (!deleteTarget || lifecycleSaving) return;
    setLifecycleSaving("delete");
    const saved = await patchPerson(deleteTarget.id, {
      action: "archive",
      archiveReason: "Deleted from People"
    });
    setLifecycleSaving("");
    if (!saved) return;
    setDeleteTargetId("");
    setProfileMenuOpen(false);
    setSelectedId("");
    setActiveSidebarView("recently-deleted");
    setUtilityNotice(`${deleteTarget.title} was moved to Recently Deleted.`);
    router.replace(`${getModuleRoute("people")}?sidebar=recently-deleted`);
  }

  async function restoreProfile(record: PersonalRecord) {
    if (lifecycleSaving) return;
    setLifecycleSaving("restore");
    const saved = await patchPerson(record.id, { action: "restore" });
    setLifecycleSaving("");
    if (saved) {
      setUtilityNotice(`${record.title} was restored to People${record.starred ? " and remains starred" : ""}.`);
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

  function openAddPerson(type: "person" | "org" = "person") {
    const destination = `${getModuleRoute("people")}/new`;
    if (guardDirtyNavigation(destination)) return;
    setClassName(type);
    setName("");
    setQuickNickname("");
    setQuickBirthday("");
    setQuickContext("");
    setQuickNotes([""]);
    setQuickOrganizationType("Business");
    setQuickIndustry("");
    setQuickFoundedYear("");
    setQuickTeamSize("");
    setQuickOrganizationPeople([]);
    setQuickYouTube("");
    setQuickEmails([newEmailEntry({ id: "new-contact-email-1", category: "primary" })]);
    setQuickPhones([newPhoneEntry({ id: "new-contact-phone-1", category: "primary", countryCode: "+1" })]);
    setQuickEducation([]);
    setQuickOccupations(type === "person" ? [newOccupationEntry({ id: "new-contact-job-1" })] : []);
    setQuickLocations([newLocationEntry({
      id: "new-contact-location-1",
      label: type === "org" ? "Relevant location" : "Primary home"
    })]);
    setAddingPerson(true);
    setDetailMode("edit");
    setActiveView("overview");
    setProfileMenuOpen(false);
    router.push(destination);
  }

  function updateQuickName(value: string) {
    if (className !== "person") {
      setName(value);
      return;
    }
    const parsed = extractQuotedNickname(value);
    if (parsed) {
      setName(parsed.fullName);
      setQuickNickname(parsed.nickname);
      return;
    }
    setName(value);
  }

  function switchQuickProfileType(nextClassName: "person" | "org") {
    if (nextClassName === className) return;
    setClassName(nextClassName);
    setQuickLocations((current) => current.map((entry, index) => index === 0 && ["Primary home", "Relevant location", "Headquarters"].includes(entry.label || "")
      ? { ...entry, label: nextClassName === "org" ? "Relevant location" : "Primary home" }
      : entry));
    if (nextClassName === "person") {
      setQuickOccupations((current) => current.length ? current : [newOccupationEntry({ id: "new-contact-job-1" })]);
    }
  }

  async function saveProfilePhoto(photo: ProfilePhotoMetadata): Promise<boolean> {
    if (!selectedPerson) return false;
    return patchPerson(selectedPerson.id, {
      profile: buildProfilePayload({ ...selectedProfile, photoUrl: photo.url, photoUpdatedAt: photo.updatedAt })
    });
  }

  async function clearProfilePhoto(): Promise<boolean> {
    if (!selectedPerson) return false;
    return patchPerson(selectedPerson.id, {
      profile: buildProfilePayload({ ...selectedProfile, photoUrl: "", photoUpdatedAt: "" })
    });
  }

  function openEditProfile() {
    if (!selectedPerson) return;
    setEditorReturnView(activeView === "properties" ? "overview" : activeView);
    setAddingPerson(false);
    setDetailMode("edit");
    setActiveView("properties");
    setProfileMenuOpen(false);
    commitPeopleRoute(
      `${getNativeObjectRoute({ module: "people", objectType: selectedPerson.className === "org" ? "organization" : "person", objectId: selectedPerson.id, mode: "edit" })}?tab=${activeView}`,
      { selectedId: selectedPerson.id, view: "properties", mode: "edit" }
    );
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
      const quoted = extractQuotedNickname(value);
      const resolvedValue = quoted?.fullName || value;
      const previous = derivePersonNameParts(current.fullName);
      const next = derivePersonNameParts(resolvedValue);
      return {
        ...current,
        fullName: resolvedValue,
        nickname: quoted?.nickname || current.nickname,
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
        <fieldset className="people-record-type-toggle">
          <legend className="sr-only">Record type</legend>
          <div>
            <button type="button" aria-pressed={className === "person"} onClick={() => switchQuickProfileType("person")}>Person</button>
            <button type="button" aria-pressed={className === "org"} onClick={() => switchQuickProfileType("org")}>Organization</button>
          </div>
        </fieldset>
        {className === "person" && (
          <>
            <section className="people-profile-section people-themed-section module-ref-tone-pink people-capture-section" aria-labelledby="people-create-identity-title">
              <header className="people-profile-section-heading">
                <span><PeopleIcon name="organization" /></span>
                <h4 id="people-create-identity-title">Identity</h4>
              </header>
              <div className="people-profile-field-grid">
                <label className="is-wide people-create-name-field">
                  Full name
                  <input
                    value={name}
                    onChange={(event) => updateQuickName(event.target.value)}
                    placeholder="First, middle, and last name"
                    aria-describedby={showDerivedQuickName ? "people-derived-name" : undefined}
                    required
                  />
                </label>
                <label>
                  Nickname
                  <input value={quickNickname} onChange={(event) => setQuickNickname(event.target.value)} placeholder="Also filled from quoted names" />
                </label>
              </div>
              {showDerivedQuickName && derivedQuickName && (
                <div id="people-derived-name" className="people-derived-name people-create-derived-name" aria-live="polite" data-people-derived-name>
                  <span><small>First</small><strong data-derived-first-name>{derivedQuickName.firstName}</strong></span>
                  {derivedQuickName.middleName && <span><small>Middle</small><strong>{derivedQuickName.middleName}</strong></span>}
                  <span><small>Last</small><strong data-derived-last-name>{derivedQuickName.lastName}</strong></span>
                </div>
              )}
              <BirthdayEditor value={quickBirthday} onChange={setQuickBirthday} />
            </section>
            <section className="people-profile-section people-themed-section module-ref-tone-crimson people-capture-section" aria-labelledby="people-create-about-title">
              <header className="people-profile-section-heading">
                <span><PeopleIcon name="notes" /></span>
                <h4 id="people-create-about-title">About</h4>
              </header>
              <div className="people-profile-field-grid">
                <label className="is-wide">Relationship context<textarea value={quickContext} onChange={(event) => setQuickContext(event.target.value)} rows={4} /></label>
              </div>
              <PeopleNotesEditor notes={quickNotes} onChange={setQuickNotes} />
            </section>
            <section className="people-profile-section people-themed-section module-ref-tone-purple people-capture-section" aria-labelledby="people-create-groups-title">
              <header className="people-profile-section-heading">
                <span><PeopleIcon name="groups" /></span>
                <h4 id="people-create-groups-title">Groups</h4>
              </header>
              <fieldset className="people-group-picker people-profile-group-picker">
                <legend className="sr-only">Groups</legend>
                <div>{GROUP_OPTIONS.map((option) => <label key={option}>
                  <input type="checkbox" checked={groups.includes(option)} onChange={() => toggleGroup(option)} />
                  <span>{option}</span>
                </label>)}</div>
              </fieldset>
            </section>
            <section className="people-profile-section people-themed-section module-ref-tone-blue people-capture-section" aria-labelledby="people-create-communication-title">
              <header className="people-profile-section-heading">
                <span><PeopleIcon name="communication" /></span>
                <h4 id="people-create-communication-title">Communication</h4>
              </header>
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
              <div className="people-profile-field-grid people-create-social-grid">
                <label>Website<input type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." /></label>
                <label>YouTube<input type="url" value={quickYouTube} onChange={(event) => setQuickYouTube(event.target.value)} placeholder="https://youtube.com/@..." /></label>
                <label>Instagram<input type="url" value={quickInstagram} onChange={(event) => setQuickInstagram(event.target.value)} placeholder="https://instagram.com/..." /></label>
                <label>TikTok<input type="url" value={quickTikTok} onChange={(event) => setQuickTikTok(event.target.value)} placeholder="https://tiktok.com/@..." /></label>
                <label>X<input type="url" value={quickX} onChange={(event) => setQuickX(event.target.value)} placeholder="https://x.com/..." /></label>
                <label>LinkedIn<input type="url" value={quickLinkedIn} onChange={(event) => setQuickLinkedIn(event.target.value)} placeholder="https://linkedin.com/in/..." /></label>
              </div>
            </section>
            <OccupationEntriesEditor
              entries={quickOccupations}
              organizations={organizationOptions}
              onChange={(id, patch) => setQuickOccupations((current) => updateEntry(current, id, patch))}
              onAdd={() => setQuickOccupations((current) => [...current, newOccupationEntry()])}
              onRemove={(id) => setQuickOccupations((current) => removeEntry(current, id))}
            />
            <EducationEntriesEditor
              entries={quickEducation}
              organizations={organizationOptions}
              onChange={(id, patch) => setQuickEducation((current) => updateEntry(current, id, patch))}
              onAdd={() => setQuickEducation((current) => [...current, newEducationEntry()])}
              onRemove={(id) => setQuickEducation((current) => removeEntry(current, id))}
            />
            <LocationEntriesEditor
              entries={quickLocations}
              organization={false}
              onChange={(id, patch) => setQuickLocations((current) => updateEntry(current, id, patch))}
              onAdd={() => setQuickLocations((current) => [...current, newLocationEntry({ label: current.length === 0 ? "Primary home" : "" })])}
              onRemove={(id) => setQuickLocations((current) => removeEntry(current, id))}
            />
            <section className="people-profile-section people-themed-section module-ref-tone-orange people-capture-section" aria-labelledby="people-create-cadence-title">
              <header className="people-profile-section-heading">
                <span><PeopleIcon name="cadence" /></span>
                <h4 id="people-create-cadence-title">Cadence</h4>
              </header>
              <div className="people-profile-field-grid">
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as PersonalRecordStatus)}><option value="active">Active</option><option value="next">Next</option><option value="idea">Loose tie</option><option value="inactive">Dormant</option></select></label>
                <label>Cadence<select data-people-cadence-select value={cadence} onChange={(event) => setCadence(event.target.value)}>{CADENCE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label>Last contact<input type="date" value={lastContact} onChange={(event) => setLastContact(event.target.value)} /></label>
                <label>Next contact<input type="date" value={nextContact} onChange={(event) => setNextContact(event.target.value)} /></label>
                <label className="is-wide">Projects<input value={quickProjects} onChange={(event) => setQuickProjects(event.target.value)} placeholder="Comma-separated project names" /></label>
              </div>
            </section>
          </>
        )}
        {className === "org" && (
          <>
          <section className="people-profile-section people-themed-section module-ref-tone-pink people-capture-section" aria-labelledby="people-organization-details-title">
            <header className="people-profile-section-heading">
              <span><PeopleIcon name="organization" /></span>
              <h4 id="people-organization-details-title">Organization details</h4>
            </header>
            <div className="people-profile-field-grid">
              <label className="is-wide people-create-name-field">
                Organization name
                <input value={name} onChange={(event) => updateQuickName(event.target.value)} placeholder="Organization name" required />
              </label>
              <label>
                Organization type
                <select data-organization-type value={quickOrganizationType} onChange={(event) => {
                  const nextType = event.target.value;
                  setQuickOrganizationType(nextType);
                  if (!organizationIndustryOptions(nextType).includes(quickIndustry)) setQuickIndustry("");
                }}>
                  {ORGANIZATION_TYPE_OPTIONS.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
              </label>
              <label>Industry or field<OrganizationIndustrySelect organizationType={quickOrganizationType} value={quickIndustry} onChange={setQuickIndustry} /></label>
              <label>Founded year<input inputMode="numeric" pattern="\d{4}" value={quickFoundedYear} onChange={(event) => setQuickFoundedYear(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1998" /></label>
              <label>Team size<input value={quickTeamSize} onChange={(event) => setQuickTeamSize(event.target.value)} placeholder="1–10, 50, global network..." /></label>
              <label className="is-wide">Description<textarea value={quickContext} onChange={(event) => setQuickContext(event.target.value)} rows={3} placeholder="What this organization is and why it is relevant." /></label>
            </div>
          </section>
          <section className="people-profile-section people-themed-section module-ref-tone-blue people-capture-section" aria-labelledby="people-organization-links-title">
            <header className="people-profile-section-heading">
              <span><PeopleIcon name="communication" /></span>
              <h4 id="people-organization-links-title">Links</h4>
            </header>
            <div className="people-profile-field-grid people-create-social-grid">
              <label>Website<input type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." /></label>
              <label>YouTube<input type="url" value={quickYouTube} onChange={(event) => setQuickYouTube(event.target.value)} placeholder="https://youtube.com/@..." /></label>
              <label>Instagram<input type="url" value={quickInstagram} onChange={(event) => setQuickInstagram(event.target.value)} placeholder="https://instagram.com/..." /></label>
              <label>TikTok<input type="url" value={quickTikTok} onChange={(event) => setQuickTikTok(event.target.value)} placeholder="https://tiktok.com/@..." /></label>
              <label>X<input type="url" value={quickX} onChange={(event) => setQuickX(event.target.value)} placeholder="https://x.com/..." /></label>
              <label>LinkedIn<input type="url" value={quickLinkedIn} onChange={(event) => setQuickLinkedIn(event.target.value)} placeholder="https://linkedin.com/company/..." /></label>
              <label className="is-wide">Projects<input value={quickProjects} onChange={(event) => setQuickProjects(event.target.value)} placeholder="Comma-separated project names" /></label>
            </div>
          </section>
          <LocationEntriesEditor
            entries={quickLocations}
            organization
            onChange={(id, patch) => setQuickLocations((current) => updateEntry(current, id, patch))}
            onAdd={() => setQuickLocations((current) => [...current, newLocationEntry({ label: current.length === 0 ? "Relevant location" : "" })])}
            onRemove={(id) => setQuickLocations((current) => removeEntry(current, id))}
          />
          <OrganizationPeopleEditor people={personOptions} selectedIds={quickOrganizationPeople} onChange={setQuickOrganizationPeople} />
          </>
        )}
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
        <strong>{mobileSurface === "editor"
          ? addingPerson
            ? className === "org" ? "New Organization" : "New Person"
            : selectedPerson?.className === "org" ? "Edit Organization" : "Edit Person"
          : mobileSurface === "profile" ? labelize(activeView) : "People"}</strong>
        <button type="button" aria-label="Search people" aria-expanded={filtersOpen} aria-controls="people-filter-sheet" onClick={() => setFiltersOpen((current) => !current)}>
          <PeopleIcon name="search" />
        </button>
        <button type="button" aria-label={filtersOpen ? "Close filters" : "Open filters"} aria-expanded={filtersOpen} aria-controls="people-filter-sheet" onClick={() => setFiltersOpen((current) => !current)}>
          <PeopleIcon name="filter" />
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

      <main className="people-directory-panel" data-total-records={totalRecords}>
        <header className="people-directory-header">
          <div>
            <h1>{activeViewLabel}</h1>
          </div>
          <div className="people-header-actions">
            <button type="button" aria-label="Log interaction" onClick={() => openInteractionComposer()}>
              <PeopleIcon name="plus" /><span>Interaction</span>
            </button>
            <button type="button" aria-label="Add organization" onClick={() => openAddPerson("org")}>
              <PeopleIcon name="plus" /><span>Organization</span>
            </button>
            <button type="button" aria-label="Add person" onClick={() => openAddPerson("person")}>
              <PeopleIcon name="plus" /><span>Person</span>
            </button>
          </div>
        </header>

        <div className="people-directory-tools">
          <div className="people-primary-search">
            <PeopleIcon name="search" />
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
                <PeopleIcon name="close" />
              </button>
            )}
            <button type="button" className="people-search-filter" aria-label={filtersOpen ? "Hide filters" : "Show filters"} aria-expanded={filtersOpen} aria-controls="people-filter-sheet" onClick={() => setFiltersOpen((current) => !current)}>
              <PeopleIcon name="filter" />
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
          </div>
          <div className="people-view-switch" role="group" aria-label="People directory view">
            {([
              ["list", "view-comfortable", "Comfortable"],
              ["compact", "view-compact", "Compact"],
              ["grid", "view-grid", "Grid"]
            ] as const).map(([mode, icon, label]) => (
              <button
                type="button"
                aria-label={`${label} view`}
                aria-pressed={listMode === mode}
                title={`${label} view`}
                onClick={() => {
                  setListMode(mode);
                  updatePeopleUrl({ view: mode });
                }}
                key={mode}
              >
                <PeopleIcon name={icon} />
              </button>
            ))}
          </div>
        </div>

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
          <button type="button" aria-expanded={filtersOpen} aria-controls="people-filter-sheet" onClick={() => setFiltersOpen((current) => !current)}>
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
            </select>
          </label>
        </div>

        {filtersOpen && (
          <section id="people-filter-sheet" ref={filterSheetRef} className="people-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="people-filter-title">
            <div className="people-sheet-handle" />
            <header>
              <h2 id="people-filter-title">Filters</h2>
              <button type="button" onClick={() => {
                setActiveFilter("all");
                setRelationshipFilter("");
                setLocationFilter("");
                setLastContactFilter("any");
                setQuery("");
                updatePeopleUrl({ filter: "all", query: "" });
              }}>
                Reset
              </button>
            </header>
            <div className="people-filter-fields">
              <label>
                <span>Relationship type</span>
                <select value={relationshipFilter} onChange={(event) => setRelationshipFilter(event.target.value)}>
                  <option value="">Any relationship</option>
                  {GROUP_OPTIONS.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Location</span>
                <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
                  <option value="">Any location</option>
                  {filterLocationOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Last contact</span>
                <select value={lastContactFilter} onChange={(event) => setLastContactFilter(event.target.value as PeopleLastContactFilter)}>
                  {LAST_CONTACT_FILTER_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setFiltersOpen(false)}>
                Show {visiblePeople.length} Results
              </button>
            </footer>
          </section>
        )}

        {initialLoadError ? (
          <SystemState
            variant="error"
            title="People could not be loaded"
            description={initialLoadError}
            action={{ label: "Reload", onSelect: () => window.location.reload() }}
          />
        ) : activeSidebarView === "recently-deleted" ? (
          <section className="people-utility-surface people-deleted-surface" aria-labelledby="people-deleted-title">
            <header>
              <div>
                <h2 id="people-deleted-title">Recently Deleted</h2>
                <p>Profiles stay recoverable here with their links, history, and star intact.</p>
              </div>
              <strong>{archivedPeople.length}</strong>
            </header>
            {utilityNotice && <p className="people-utility-notice" role="status">{utilityNotice}</p>}
            {archivedPeople.length > 0 ? (
              <div className="people-deleted-list">
                {archivedPeople.map((record) => (
                  <article data-people-deleted-row key={record.id}>
                    <PeopleProfileAvatar
                      label={record.title}
                      initials={getInitials(record)}
                      photoUrl={record.profile?.photoUrl}
                      photoUpdatedAt={record.profile?.photoUpdatedAt}
                      compact
                    />
                    <div>
                      <strong>{record.title}</strong>
                      <span>Deleted {record.archivedAt ? formatFullDate(record.archivedAt) : "recently"}</span>
                    </div>
                    {record.starred && <span className="people-deleted-star" aria-label="Starred">★</span>}
                    <button
                      type="button"
                      aria-label={`Restore ${record.title}`}
                      onClick={() => void restoreProfile(record)}
                      disabled={Boolean(lifecycleSaving)}
                    >
                      {lifecycleSaving === "restore" ? "Restoring..." : "Restore"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notes-empty-state">
                <h3>Nothing to restore</h3>
                <p>Deleted profiles will appear here instead of disappearing permanently.</p>
              </div>
            )}
          </section>
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
          <>
          <div className={`people-directory-list is-${listMode}`}>
            {visiblePeople.map((record) => {
              const profile = getProfile(record);
              return (
                <article
                  className={`people-directory-row module-ref-tone-${getPeopleTone(record)}${selectedPerson?.id === record.id ? " is-selected" : ""}`}
                  key={record.id}
                >
                  <button
                    type="button"
                    className="people-directory-row-body"
                    aria-pressed={selectedPerson?.id === record.id}
                    onClick={() => selectPerson(record)}
                  >
                    <PeopleProfileAvatar
                      label={record.title}
                      initials={getInitials(record)}
                      photoUrl={profile.photoUrl}
                      photoUpdatedAt={profile.photoUpdatedAt}
                      compact={listMode === "compact"}
                    />
                    <span className="people-row-main">
                      <span className="people-row-name"><strong>{record.title}</strong>{record.className === "person" && profile.nickname && <em>AKA {profile.nickname}</em>}</span>
                      <small>{record.className === "org"
                        ? [profile.organizationType, profile.industry].filter(Boolean).join(" · ") || profile.context || getPrimaryGroup(record)
                        : [profile.primaryOccupation, profile.primaryEmployer].filter(Boolean).join(" at ") || profile.context || getPrimaryGroup(record)}</small>
                      <span>
                        {[getPrimaryGroup(record), ...record.projects.slice(0, 1)].filter(Boolean).map((tag) => (
                          <em key={tag}>{tag}</em>
                        ))}
                      </span>
                    </span>
                    <span className={`people-row-date${getLastContactValue(record, latestInteractionDateByParticipant.get(record.id)) ? "" : " is-unknown"}`}>
                      {getLastContactValue(record, latestInteractionDateByParticipant.get(record.id)) && <i />}
                      {formatLastContact(record, false, latestInteractionDateByParticipant.get(record.id))}
                    </span>
                    <span className="people-row-next">{getDirectoryNextContactLabel(record)}</span>
                    {record.starred && <span className="people-row-star" data-people-starred aria-label="Starred">★</span>}
                  </button>
                </article>
              );
            })}
          </div>
          <section className="people-recent-interactions" aria-labelledby="people-recent-interactions-title">
            <header>
              <div>
                <h2 id="people-recent-interactions-title">Recent interactions</h2>
                <span>Shared activity across People</span>
              </div>
              <button type="button" onClick={() => openInteractionComposer()}>Log interaction</button>
            </header>
            <div className="people-recent-interaction-list">
              {recentInteractionItems.length > 0 ? recentInteractionItems.map((item) => {
                const interaction = item.kind === "interaction"
                  ? item.interaction
                  : { kind: "memory", title: item.memory.text, summary: "" };
                const participants = item.participantIds
                  .map((participantId) => activePeople.find((record) => record.id === participantId))
                  .filter((record): record is PersonalRecord => Boolean(record));
                return (
                  <article key={`recent-${item.id}`}>
                    <span className="people-recent-kind">{interaction.kind || "Interaction"}</span>
                    <div>
                      <strong>{interaction.title}</strong>
                      <span>{participants.map((record) => record.title).join(" · ") || "Profile unavailable"}</span>
                    </div>
                    {item.kind === "interaction" && item.interaction.approach && (
                      <span className={`people-approach-badge is-${item.interaction.approach}`}>{labelize(item.interaction.approach)}</span>
                    )}
                    <time dateTime={item.date}>{item.date ? formatFullDate(item.date) : "Date unknown"}</time>
                  </article>
                );
              }) : (
                <p>No interactions logged yet.</p>
              )}
            </div>
          </section>
          </>
        ) : (
          <div className="notes-empty-state">
            <h3>{activePeople.length === 0 ? "No people yet" : "No matching people"}</h3>
            <p>
              {activePeople.length === 0
                ? "Add your first person or import contacts to start building relationship context."
                : "Try removing filters or search a broader term."}
            </p>
            <button type="button" onClick={() => openAddPerson("person")}>
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
              <header className="people-profile-header" data-profile-status={selectedPerson.status}>
              <PeopleProfileAvatar
                label={selectedPerson.title}
                initials={getInitials(selectedPerson)}
                photoUrl={selectedProfile.photoUrl}
                photoUpdatedAt={selectedProfile.photoUpdatedAt}
                onSelect={() => setPhotoDialogOpen(true)}
              />
              <div className="people-profile-identity">
                <div className="people-profile-title-line">
                  <h2>{selectedPerson.title}{selectedPerson.className === "person" && selectedProfile.nickname && <>, <span>AKA {selectedProfile.nickname}</span></>}</h2>
                </div>
                <p>{selectedPerson.className === "org"
                  ? [selectedProfile.organizationType, selectedProfile.industry].filter(Boolean).join(" · ") || "Organization"
                  : [selectedProfile.primaryOccupation, selectedProfile.primaryEmployer ? `at ${selectedProfile.primaryEmployer}` : ""].filter(Boolean).join(" ") || getPrimaryGroup(selectedPerson)}</p>
                <div className="people-tag-row">
                  {selectedTags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="people-profile-actions">
                <span className="people-status-marker"><i aria-hidden="true" />{STATUS_LABELS[selectedPerson.status]}</span>
                <button
                  type="button"
                  className={`people-profile-star${selectedPerson.starred ? " is-starred" : ""}`}
                  aria-label={selectedPerson.starred ? `Remove star from ${selectedPerson.title}` : `Star ${selectedPerson.title}`}
                  aria-pressed={selectedPerson.starred === true}
                  onClick={() => void toggleStar(selectedPerson)}
                  disabled={Boolean(lifecycleSaving)}
                  title={selectedPerson.starred ? "Remove from Starred" : "Add to Starred"}
                >
                  <span aria-hidden="true">{selectedPerson.starred ? "★" : "☆"}</span>
                </button>
                <button
                  type="button"
                  className="people-profile-more"
                  aria-label="More profile actions"
                  aria-expanded={profileMenuOpen}
                  aria-controls="people-profile-action-menu"
                  onClick={() => setProfileMenuOpen((current) => !current)}
                ><span aria-hidden="true">•••</span></button>
              </div>
              {profileMenuOpen && (
                <div id="people-profile-action-menu" className="people-action-menu" role="menu" aria-label="Profile actions">
                  <button type="button" role="menuitem" onClick={openEditProfile}><PeopleIcon name="edit" /><span>Edit profile</span></button>
                  <button type="button" role="menuitem" onClick={() => { setObjectLinkOpen(true); setProfileMenuOpen(false); }}><PeopleIcon name="object" /><span>Add to object</span></button>
                  <button type="button" role="menuitem" onClick={() => { setDormantConfirmOpen(true); setProfileMenuOpen(false); }}><PeopleIcon name="dormant" /><span>{selectedPerson.status === "inactive" ? "Set active" : "Set dormant"}</span></button>
                  <button type="button" role="menuitem" onClick={exportContact}><PeopleIcon name="export" /><span>Export contact</span></button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setDeleteTargetId(selectedPerson.id);
                    }}
                  ><PeopleIcon name="delete" /><span>Delete profile</span></button>
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
                    <strong>{selectedPerson.className === "org" ? "Edit Organization" : "Edit Profile"}</strong>
                    <div>
                      <button type="button" onClick={requestCancelEditor}>Cancel</button>
                      <button type="submit" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save"}</button>
                    </div>
                  </div>
                  {(selectedPerson.className === "org" ? ORGANIZATION_PROFILE_SECTIONS : PROFILE_SECTIONS).map((section) => (
                    <Fragment key={section.title}>
                    <section className={`people-profile-section people-themed-section module-ref-tone-${section.tone}`} data-profile-section={section.title.toLowerCase().replace(/\s+/g, "-")}>
                      <header className="people-profile-section-heading">
                        <span><PeopleIcon name={profileSectionIcon(section.title)} /></span>
                        <h4>{section.title}</h4>
                      </header>
                      <div className="people-profile-field-grid">
                        {section.fields.map((field) => (
                          <label className={`${field.type === "textarea" ? "is-wide " : ""}people-profile-field-${field.key}`} key={field.key}>
                            {field.label}
                            {field.key === "contactCadence" ? (
                              <select
                                data-people-cadence-select
                                value={profileDraft.contactCadence}
                                onChange={(event) => updateProfileDraft("contactCadence", event.target.value)}
                              >
                                {CADENCE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                              </select>
                            ) : field.key === "organizationType" ? (
                              <select data-organization-type value={profileDraft.organizationType} onChange={(event) => {
                                const nextType = event.target.value;
                                setProfileDraft((current) => ({
                                  ...current,
                                  organizationType: nextType,
                                  industry: organizationIndustryOptions(nextType).includes(current.industry) ? current.industry : ""
                                }));
                              }}>
                                <option value="">Select type</option>
                                {ORGANIZATION_TYPE_OPTIONS.map((option) => <option value={option} key={option}>{option}</option>)}
                              </select>
                            ) : field.key === "industry" && selectedPerson.className === "org" ? (
                              <OrganizationIndustrySelect
                                organizationType={profileDraft.organizationType}
                                value={profileDraft.industry}
                                onChange={(value) => updateProfileDraft("industry", value)}
                              />
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
                                inputMode={field.key === "foundedYear" ? "numeric" : undefined}
                                pattern={field.key === "foundedYear" ? "\\d{4}" : undefined}
                                placeholder={field.placeholder}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                      {section.title === "Identity" && selectedPerson.className === "person" && (
                        <BirthdayEditor value={profileDraft.birthday} onChange={(value) => updateProfileDraft("birthday", value)} />
                      )}
                      {section.title === "Communication" && selectedPerson.className === "person" && <div className="people-contact-channel-grid">
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
                      </div>}
                      {section.title === "About" && (
                        <>
                          {selectedPerson.className === "person" && (
                            <PeopleNotesEditor
                              title="Interesting facts"
                              idPrefix="people-interesting-fact"
                              editorKind="interesting-facts"
                              notes={profileDraft.interestingFact ? profileDraft.interestingFact.split(/\r?\n/) : [""]}
                              onChange={(facts) => updateProfileDraft("interestingFact", facts.join("\n"))}
                            />
                          )}
                          <PeopleNotesEditor
                            title={selectedPerson.className === "org" ? "Organization notes" : "Notes"}
                            idPrefix="people-about-note"
                            editorKind="notes"
                            notes={profileDraft.notes ? profileDraft.notes.split(/\r?\n/) : [""]}
                            onChange={(notes) => updateProfileDraft("notes", notes.join("\n"))}
                          />
                        </>
                      )}
                    </section>
                    {section.title === "About" && selectedPerson.className === "person" && (
                      <section className="people-profile-section people-themed-section module-ref-tone-purple" data-profile-section="groups">
                        <header className="people-profile-section-heading">
                          <span><PeopleIcon name="groups" /></span>
                          <h4>Groups</h4>
                        </header>
                        <fieldset className="people-group-picker people-profile-group-picker">
                          <legend className="people-visually-hidden">Groups</legend>
                          <div>{GROUP_OPTIONS.map((option) => <label key={option}>
                            <input type="checkbox" checked={profileGroups.includes(option)} onChange={() => toggleProfileGroup(option)} />
                            <span>{option}</span>
                          </label>)}</div>
                        </fieldset>
                      </section>
                    )}
                    {(section.title === "Communication" || section.title === "Links") && (
                      <>
                        {selectedPerson.className === "person" && (
                          <>
                            <OccupationEntriesEditor
                              entries={profileDraft.occupations}
                              organizations={organizationOptions}
                              onChange={updateProfileOccupation}
                              onAdd={() => setProfileDraft((current) => ({ ...current, occupations: [...current.occupations, newOccupationEntry()] }))}
                              onRemove={(id) => setProfileDraft((current) => ({ ...current, occupations: removeEntry(current.occupations, id) }))}
                            />
                            <EducationEntriesEditor
                              entries={profileDraft.education}
                              organizations={organizationOptions}
                              onChange={updateProfileEducation}
                              onAdd={() => setProfileDraft((current) => ({ ...current, education: [...current.education, newEducationEntry()] }))}
                              onRemove={(id) => setProfileDraft((current) => ({ ...current, education: removeEntry(current.education, id) }))}
                            />
                          </>
                        )}
                        <LocationEntriesEditor
                          entries={profileDraft.locations}
                          organization={selectedPerson.className === "org"}
                          comesFrom={profileDraft.comesFrom}
                          onComesFromChange={selectedPerson.className === "person" ? (value) => updateProfileDraft("comesFrom", value) : undefined}
                          onChange={updateProfileLocation}
                          onAdd={() => setProfileDraft((current) => ({
                            ...current,
                            locations: [...current.locations, newLocationEntry({ label: current.locations.length === 0 ? selectedPerson.className === "org" ? "Relevant location" : "Primary home" : "" })]
                          }))}
                          onRemove={(id) => setProfileDraft((current) => ({ ...current, locations: removeEntry(current.locations, id) }))}
                        />
                        {selectedPerson.className === "org" && (
                          <OrganizationPeopleEditor
                            people={personOptions}
                            selectedIds={organizationProfileSelectedPersonIds}
                            derivedIds={selectedOrganizationDerivedPersonIds}
                            onChange={(selectedIds) => setProfileDraft((current) => ({
                              ...current,
                              associatedPeople: mergeAssociatedPersonIds(current.associatedPeople, personOptions, selectedIds)
                            }))}
                          />
                        )}
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
                  <PeopleAddButton label="Interaction" ariaLabel="Log interaction" onClick={() => openInteractionComposer(selectedPerson)} />
                  <PeopleAddButton
                    label="Follow-up"
                    onClick={() => router.push(followUpCreationRoute(selectedPerson))}
                    ariaLabel={`Schedule a Personal Ops follow-up for ${selectedPerson.title}`}
                  />
                </div>
                <div className="people-timeline-layout">
                  <section className="people-timeline-stream" aria-label={`${selectedPerson.title} ${selectedPerson.className === "org" ? "organization" : "relationship"} history`}>
                    <header>
                      <div>
                        <h3>Interactions</h3>
                      </div>
                      <strong className="people-section-count" aria-label={`${timelineItems.length} interactions`}>{timelineItems.length}</strong>
                    </header>
                    <div className="people-timeline-list">
                      {timelineItems.length > 0 ? timelineItems.map((item) => item.kind === "memory" ? (
                        <article className="people-timeline-memory" data-memory-id={item.memory.id} data-memory-date={item.memory.occurredOn || ""} key={`memory-${item.id}`}>
                          <div className="people-timeline-entry-meta">
                            <span>{item.memory.occurredOn ? formatFullDate(item.memory.occurredOn) : "Date not set"}</span>
                            <span className="people-timeline-kind">Memory</span>
                          </div>
                          <strong className="people-timeline-entry-title">{item.memory.text}</strong>
                        </article>
                      ) : (
                        <article className="people-timeline-interaction" data-interaction-id={item.id} key={item.id}>
                          <div className="people-timeline-entry-meta">
                            <span>{item.date ? formatFullDate(item.date) : getLastContactValue(selectedPerson, latestInteractionDateByParticipant.get(selectedPerson.id)) ? formatLastContact(selectedPerson, true, latestInteractionDateByParticipant.get(selectedPerson.id)) : "Date unknown"}</span>
                            {item.interaction.kind && <span className="people-timeline-kind">{item.interaction.kind}</span>}
                            {item.interaction.approach && <span className={`people-approach-badge is-${item.interaction.approach}`}>{labelize(item.interaction.approach)}</span>}
                          </div>
                          <strong className="people-timeline-entry-title">{item.interaction.title}</strong>
                          {item.interaction.summary && <p className="people-timeline-entry-body">{item.interaction.summary}</p>}
                          {item.participantIds.length > 1 && (
                            <div className="people-interaction-participants" aria-label="Tagged people">
                              {item.participantIds.map((participantId) => {
                                const participant = activePeople.find((record) => record.id === participantId);
                                return participant ? <span key={participantId}>{participant.title}</span> : null;
                              })}
                            </div>
                          )}
                        </article>
                      )) : (
                        <div className="notes-empty-state">
                          <h3>No interactions yet</h3>
                          <p>Log a call, email, meeting, message, or memory to start the history.</p>
                        </div>
                      )}
                    </div>
                  </section>
                  <aside className="people-timeline-side" aria-label={`Follow-ups and ${selectedPerson.className === "org" ? "organization" : "relationship"} rhythm`}>
                    <LinkedFollowUpsPanel
                      source={peopleFollowUpSource(selectedPerson)}
                      followUps={followUps}
                      loading={followUpsLoading}
                      error={followUpsError}
                      onRefresh={() => void refreshLinkedFollowUps()}
                      limit={3}
                      compact
                      presentation="people"
                      showBoundary={false}
                      title="Follow-ups"
                    />
                    <section className="people-relationship-rhythm">
                      <h3>{selectedPerson.className === "org" ? "Organization rhythm" : "Relationship rhythm"}</h3>
                      {[
                        ["Last contact", formatLastContact(selectedPerson, true, latestInteractionDateByParticipant.get(selectedPerson.id))],
                        ["Next follow-up", getNextContactLabel(selectedPerson)],
                        ["Cadence", getCadenceLabel(selectedPerson.time.reviewCadence)],
                        [selectedPerson.className === "org" ? "Status" : "Health", getRelationshipHealth(selectedPerson, latestInteractionDateByParticipant.get(selectedPerson.id))]
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
              <section className="people-links-hub" aria-label={`${selectedPerson.title} links`}>
                <div className="people-section-toolbar">
                  <div>
                    <h3>Links</h3>
                  </div>
                  <div className="people-links-toolbar-actions">
                    <strong className="people-section-count" aria-label={`${peopleConnections.length + organizationConnections.length + unresolvedConnections.length + selectedProjectConnections.length + selectedNativeObjectLinks.length + selectedPerson.externalSources.length} linked items`}>
                      {peopleConnections.length + organizationConnections.length + unresolvedConnections.length + selectedProjectConnections.length + selectedNativeObjectLinks.length + selectedPerson.externalSources.length}
                    </strong>
                    <PeopleAddButton label="Objects" ariaLabel="Add object" onClick={() => setObjectLinkOpen(true)} />
                  </div>
                </div>
                {actionNotice && <p className="people-notice">{actionNotice}</p>}
                <div className="people-links-grid">
                  <article className="people-links-section is-people">
                    <header className="people-linked-card-header">
                      <div><h4>People</h4></div>
                      <strong className="people-section-count" aria-label={`${peopleConnections.length} linked people`}>{peopleConnections.length}</strong>
                    </header>
                    <div className="people-links-directory">
                      {peopleConnections.length > 0 ? peopleConnections.map((connection) => (
                          <button type="button" onClick={() => selectPerson(connection.target!)} key={connection.label}>
                            <PeopleProfileAvatar
                              label={connection.target!.title}
                              initials={getInitials(connection.target!)}
                              photoUrl={connection.target!.profile?.photoUrl}
                              photoUpdatedAt={connection.target!.profile?.photoUpdatedAt}
                              compact
                            />
                            <span><strong>{connection.target!.title}</strong><small>{getPrimaryGroup(connection.target!)}</small></span>
                            <PeopleIcon name="chevron" />
                          </button>
                      )) : <p>No people yet.</p>}
                    </div>
                  </article>
                  <article className="people-links-section is-organizations">
                    <header className="people-linked-card-header">
                      <div><h4>Organizations</h4></div>
                      <strong className="people-section-count" aria-label={`${organizationConnections.length} linked organizations`}>{organizationConnections.length}</strong>
                    </header>
                    <div className="people-links-directory is-organizations">
                      {organizationConnections.length > 0 ? organizationConnections.map((connection) => (
                        <button type="button" onClick={() => selectPerson(connection.target!)} key={connection.label}>
                          <PeopleProfileAvatar
                            label={connection.target!.title}
                            initials={getInitials(connection.target!)}
                            photoUrl={connection.target!.profile?.photoUrl}
                            photoUpdatedAt={connection.target!.profile?.photoUpdatedAt}
                            compact
                          />
                          <span><strong>{connection.target!.title}</strong><small>{connection.target!.profile?.organizationType || "Organization"}</small></span>
                          <PeopleIcon name="chevron" />
                        </button>
                      )) : <p>No organizations yet.</p>}
                    </div>
                    {unresolvedConnections.length > 0 && <div className="people-link-context-list">
                      {unresolvedConnections.map((connection) => <div className="people-link-context" key={connection.label}><strong>{connection.label}</strong><span>Context</span></div>)}
                    </div>}
                  </article>
                  <article className="people-links-section is-projects">
                    <header className="people-linked-card-header">
                      <div><h4>Projects</h4></div>
                      <strong className="people-section-count" aria-label={`${selectedProjectConnections.length} linked projects`}>{selectedProjectConnections.length}</strong>
                    </header>
                    {projectsError && <p className="people-notice" role="alert">{projectsError}</p>}
                    {projectsLoading ? <p>Loading projects…</p> : selectedProjectConnections.length > 0 ? (
                      <LinkedProjectsPanel
                        personId={selectedPerson.id}
                        personLabel={selectedPerson.title}
                        objectType={selectedPerson.className === "org" ? "organization" : "person"}
                        state={projectsState}
                        loading={projectsLoading}
                        error={projectsError}
                        onRefresh={() => void refreshProjects()}
                        legacyProjectLabels={selectedPerson.projects}
                        limit={4}
                        compact
                        showHeader={false}
                        showSummary={false}
                        showBoundary={false}
                      />
                    ) : <p>No projects yet.</p>}
                  </article>
                  <article className="people-links-section is-objects">
                    <header className="people-linked-card-header">
                      <div><h4>Objects</h4></div>
                      <strong className="people-section-count" aria-label={`${selectedNativeObjectLinks.length} linked objects`}>{selectedNativeObjectLinks.length}</strong>
                    </header>
                    <div className="people-object-links">
                      {selectedNativeObjectLinks.length > 0 ? selectedNativeObjectLinks.map(({ link, object }) => (
                        <div key={link.id}>
                          <a href={object.route}>
                            <span className="people-object-glyph"><PeopleIcon name="object" /></span>
                            <span><strong>{object.label}</strong><small>{labelize(object.objectType)} · {labelize(link.relationship)}</small></span>
                          </a>
                          <button type="button" onClick={() => void removeObjectLink(link)} disabled={objectLinkSaving} aria-label={`Remove link to ${object.label}`}><PeopleIcon name="close" /></button>
                        </div>
                      )) : <p>No objects yet.</p>}
                    </div>
                  </article>
                  <article className="people-links-section is-files">
                    <header className="people-linked-card-header">
                      <div><h4>Files</h4></div>
                      <strong className="people-section-count" aria-label="0 linked files">0</strong>
                    </header>
                    <p>No files yet.</p>
                  </article>
                  <article className="people-links-section is-resources">
                    <header className="people-linked-card-header">
                      <div><h4>Resources</h4></div>
                      <strong className="people-section-count" aria-label={`${selectedPerson.externalSources.length} saved resources`}>{selectedPerson.externalSources.length}</strong>
                    </header>
                    <div className="people-resource-links">
                      {selectedPerson.externalSources.length > 0 ? selectedPerson.externalSources.map((item) => (
                        <a href={/^https?:\/\//i.test(item) ? item : `${getModuleRoute("resources")}?query=${encodeURIComponent(item)}`} target={/^https?:\/\//i.test(item) ? "_blank" : undefined} rel={/^https?:\/\//i.test(item) ? "noreferrer" : undefined} key={item}>{item}</a>
                      )) : <p>No resources yet.</p>}
                    </div>
                  </article>
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
                <article className="people-overview-about" data-people-overview-card="about">
                  <h3>{selectedPerson.className === "org" ? "Description" : `About ${selectedPerson.title.split(" ")[0]}`}</h3>
                  <p>{selectedProfile.context || selectedPerson.body || (selectedPerson.className === "org" ? "No description recorded yet." : "No relationship context recorded yet.")}</p>
                  <div className="people-about-notes">
                    <header>
                      <strong>Notes <span aria-label={`${selectedNotes.length} notes`}>{selectedNotes.length}</span></strong>
                      <button
                        type="button"
                        onClick={() => setQuickNoteOpen((current) => !current)}
                        aria-label={`Add note for ${selectedPerson.title}`}
                        aria-expanded={quickNoteOpen}
                        title="Add note"
                      ><PeopleIcon name="plus" /></button>
                    </header>
                    {quickNoteOpen && (
                      <form className="people-quick-note-form" onSubmit={saveQuickNote}>
                        <textarea autoFocus rows={2} value={quickNoteDraft} onChange={(event) => setQuickNoteDraft(event.target.value)} placeholder="Write a note…" aria-label={`New note for ${selectedPerson.title}`} />
                        <div>
                          <button type="button" onClick={() => { setQuickNoteDraft(""); setQuickNoteOpen(false); }}>Cancel</button>
                          <button type="submit" disabled={!quickNoteDraft.trim() || quickNoteSaving}>{quickNoteSaving ? "Adding…" : "Add"}</button>
                        </div>
                      </form>
                    )}
                    {selectedNotes.length > 0 && (
                      <ul>
                        {selectedNotes.map((note, index) => (
                          <li key={`${note}-${index}`}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
                <article className="people-overview-facts" data-people-overview-card="quick-info">
                  <h3 className="people-visually-hidden">Profile details</h3>
                  {(["life", "work", "relationships"] as const).map((group) => {
                    const facts = overviewFacts.filter((fact) => fact.group === group);
                    if (!facts.length) return null;
                    return <section className={`people-fact-cluster is-${group}`} aria-label={labelize(group)} key={group}>
                      {facts.map(({ label, value, icon }) => {
                        const organizationId = label === "Employer"
                          ? selectedProfile.occupations.find((entry) => entry.status === "current")?.organizationId
                          : label === "University"
                            ? selectedProfile.education[0]?.organizationId
                            : undefined;
                        const organization = organizationId ? activePeople.find((record) => record.id === organizationId && record.className === "org") : undefined;
                        return (
                          <div className="people-info-row" key={label} title={label}>
                            <span className="people-info-icon"><PeopleIcon name={icon} /></span>
                            <span className="people-info-copy">
                              <strong>{label}</strong>
                              {organization
                                ? <button type="button" className="people-inline-object-link" onClick={() => selectPerson(organization)}>{value || organization.title}</button>
                                : <span>{value || "-"}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </section>;
                  })}
                  {selectedPerson.className === "person" && (
                    <section className="people-education-overview" aria-label="Education">
                      <span className="people-info-icon"><PeopleIcon name="university" /></span>
                      <div className="people-education-overview-copy">
                        <strong>Education</strong>
                        {overviewEducation.length > 0 ? (
                          <div className="people-education-overview-list">
                            {overviewEducation.map((entry) => {
                              const organization = entry.organizationId
                                ? activePeople.find((record) => record.id === entry.organizationId && record.className === "org")
                                : undefined;
                              return (
                                <article key={entry.id}>
                                  {organization
                                    ? <button type="button" className="people-inline-object-link" onClick={() => selectPerson(organization)}>{organization.title}</button>
                                    : <span className="people-education-name">{entry.institution || "University not added"}</span>}
                                  <div className="people-education-meta">
                                    <span><small>Degree</small>{entry.degree || "—"}</span>
                                    <span><small>Field</small>{entry.fieldOfStudy || "—"}</span>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : <span className="people-education-empty">—</span>}
                      </div>
                    </section>
                  )}
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
          <button type="button" onClick={() => openAddPerson("person")}>Add Person</button>
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
            <button type="button" onClick={() => openInteractionComposer(selectedPerson)}>Log Interaction</button>
            <button type="button" onClick={() => setProfileMenuOpen(true)}>More</button>
          </>
        )}
      </nav>}

      {interactionOpen && (
        <div className="people-dialog-backdrop" role="presentation">
          <form ref={interactionDialogRef} className="people-interaction-dialog" role="dialog" aria-modal="true" aria-labelledby="log-interaction-title" onSubmit={saveInteraction}>
            <header>
              <div>
                <h2 id="log-interaction-title">Log interaction</h2>
                <p>Tag everyone involved once; the same entry appears on each profile.</p>
              </div>
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
                  <option value="memory">Memory</option>
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
              <fieldset className="people-interaction-participant-picker is-wide">
                <legend>People and organizations</legend>
                <div>
                  {activePeople.map((record) => (
                    <label key={record.id}>
                      <input
                        type="checkbox"
                        value={record.id}
                        checked={interactionParticipantIds.includes(record.id)}
                        onChange={(event) => setInteractionParticipantIds((current) => event.target.checked
                          ? Array.from(new Set([...current, record.id]))
                          : current.filter((id) => id !== record.id))}
                      />
                      <PeopleProfileAvatar
                        label={record.title}
                        initials={getInitials(record)}
                        photoUrl={record.profile?.photoUrl}
                        photoUpdatedAt={record.profile?.photoUpdatedAt}
                        compact
                      />
                      <span>{record.title}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="people-interaction-approach is-wide">
                <legend>Approach</legend>
                <div>
                  {(["", "cold", "warm"] as const).map((value) => (
                    <label key={value || "unset"}>
                      <input
                        type="radio"
                        name="interaction-approach"
                        value={value}
                        checked={interactionApproach === value}
                        onChange={() => setInteractionApproach(value)}
                      />
                      <span>{value ? labelize(value) : "Not specified"}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="people-check-row is-wide">
                <input type="checkbox" checked={interactionMeaningful} onChange={(event) => setInteractionMeaningful(event.target.checked)} />
                Use this as the latest contact date
              </label>
            </div>
            {error && <p className="personal-record-error">{error}</p>}
            <footer className="people-dialog-actions">
              <button className="people-dialog-action" type="button" onClick={() => setInteractionOpen(false)} disabled={interactionSaving}>Cancel</button>
              <button className="people-dialog-action is-primary" type="submit" disabled={interactionSaving || !interactionTitle.trim() || !interactionDate || interactionParticipantIds.length === 0}>
                {interactionSaving ? "Saving..." : "Save interaction"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {objectLinkOpen && selectedPerson && (
        <div className="people-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !objectLinkSaving) setObjectLinkOpen(false);
        }}>
          <form className="people-object-link-dialog" role="dialog" aria-modal="true" aria-labelledby="people-object-link-title" onSubmit={saveObjectLink}>
            <header>
              <div>
                <h2 id="people-object-link-title">Add {selectedPerson.title} to an object</h2>
                <p>Create one durable relationship without copying either record.</p>
              </div>
              <button className="people-dialog-close" type="button" aria-label="Close object picker" onClick={() => setObjectLinkOpen(false)} disabled={objectLinkSaving}><PeopleIcon name="close" /></button>
            </header>
            <div className="people-object-link-fields">
              <label>
                Object
                <select value={objectLinkTargetId} onChange={(event) => setObjectLinkTargetId(event.target.value)} required>
                  <option value="">Choose an object</option>
                  {Array.from(new Set(availableObjectTargets.map((target) => target.module))).map((module) => (
                    <optgroup label={module === "personal_ops" ? "Lists" : labelize(module)} key={module}>
                      {availableObjectTargets.filter((target) => target.module === module).map((target) => (
                        <option value={`${target.module}:${target.objectType}:${target.objectId}`} key={`${target.module}:${target.objectType}:${target.objectId}`}>
                          {target.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                Relationship
                <select value={objectLinkRelationship} onChange={(event) => setObjectLinkRelationship(event.target.value)}>
                  <option value="related">Related</option>
                  <option value="member">Member</option>
                  <option value="participant">Participant</option>
                  <option value="owner">Owner</option>
                  <option value="client">Client</option>
                  <option value="advisor">Advisor</option>
                  <option value="subject">Subject</option>
                </select>
              </label>
            </div>
            {error && <p className="personal-record-error">{error}</p>}
            <footer className="people-dialog-actions">
              <button className="people-dialog-action" type="button" onClick={() => setObjectLinkOpen(false)} disabled={objectLinkSaving}>Cancel</button>
              <button className="people-dialog-action is-primary" type="submit" disabled={objectLinkSaving || !objectLinkTargetId}>{objectLinkSaving ? "Linking…" : "Add to object"}</button>
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
          ["Relationship", relationshipFilter || "Any"],
          ["Location", locationFilter || "Any"],
          ["Cadence status", activeFilter === "due" ? "Due soon" : "Anytime"],
          ["Last contact", LAST_CONTACT_FILTER_OPTIONS.find((option) => option.value === lastContactFilter)?.label || "Any time"]
        ].map(([label, value]) => (
          <button type="button" onClick={() => setFiltersOpen((current) => !current)} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
        <button type="button" onClick={() => setFiltersOpen((current) => !current)}>+ Add filter</button>
      </aside>

      {selectedPerson && (
        <PeopleProfilePhotoDialog
          open={photoDialogOpen}
          personId={selectedPerson.id}
          personName={selectedPerson.title}
          hasPhoto={Boolean(selectedProfile.photoUrl)}
          onClose={() => setPhotoDialogOpen(false)}
          onSaved={saveProfilePhoto}
          onRemoved={clearProfilePhoto}
        />
      )}

      <ConfirmationSheet
        open={dormantConfirmOpen}
        onOpenChange={(open) => {
          if (!open && lifecycleSaving !== "dormant") setDormantConfirmOpen(false);
        }}
        onConfirm={toggleDormant}
        title={`${selectedPerson?.status === "inactive" ? "Reactivate" : "Set dormant"} ${selectedPerson?.title || "this profile"}?`}
        description={selectedPerson?.status === "inactive" ? "This profile will return to active People views." : "This profile stays intact but leaves active relationship views."}
        consequences={selectedPerson?.status === "inactive"
          ? ["Links and history remain unchanged.", "The profile will be included in active views again."]
          : ["Links and history remain unchanged.", "You can reactivate the profile from Dormant at any time."]}
        confirmLabel={selectedPerson?.status === "inactive" ? "Set active" : "Set dormant"}
        busy={lifecycleSaving === "dormant"}
        dismissible={lifecycleSaving !== "dormant"}
      />

      <ConfirmationSheet
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && lifecycleSaving !== "delete") setDeleteTargetId("");
        }}
        onConfirm={deleteProfile}
        title={`Delete ${deleteTarget?.title || "this profile"}?`}
        description="This removes the profile from People, search, and Starred without erasing its relationship record."
        consequences={[
          "Its links and history will stay intact.",
          "You can restore it from Recently Deleted."
        ]}
        confirmLabel="Delete profile"
        tone="danger"
        busy={lifecycleSaving === "delete"}
        dismissible={lifecycleSaving !== "delete"}
      />

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
