import { mutateJsonFile, readJsonFile } from "./file-store";
import { normalizeBirthday } from "./modules/people/birthday";
import {
  canonicalCountryCode,
  normalizePhoneForStorage,
  validateInternationalPhone
} from "./modules/people/phone";
import { getPersonalSystemDomain } from "./personal-systems";

export type PersonalRecordClass =
  | "assignment"
  | "interaction"
  | "person"
  | "resource"
  | "org"
  | "list"
  | "daily"
  | "meeting"
  | "note"
  | "prompt"
  | "task"
  | "project"
  | "event"
  | "file"
  | "decision"
  | "metric";
export type PersonalRecordPrivacy = "private" | "shared";
export type PersonalRecordStage = "processed" | "unprocessed";
export type PersonalRecordStatus =
  | "idea"
  | "draft"
  | "active"
  | "completed"
  | "blocked"
  | "inactive"
  | "next";
export type PersonalRecordGrowth = "seed" | "plant" | "tree" | "forest" | "jungle";
export type PersonalRecordIntent =
  | "connect"
  | "create"
  | "implement"
  | "research"
  | "retain"
  | "ingest"
  | "publish"
  | "understand";
export type PersonalRecordKnowledgeShape =
  | ""
  | "observation"
  | "claim"
  | "procedure"
  | "process"
  | "collection"
  | "reference";

export type PersonalRecordCreatedMeta = {
  uid: string;
  createdIso: string;
  created: string;
  createdDate: string;
  createdYear: string;
  createdMonth: string;
  createdYearMonth: string;
  createdQuarter: string;
  createdYearQuarter: string;
  createdWeek: string;
  createdYearWeek: string;
  createdWeekdayName: string;
  createdWeekdayNumber: string;
};

export type PersonalRecordRelations = {
  north: string[];
  south: string[];
  east: string[];
  west: string[];
  stakeholders: string[];
  stakeholdings: string[];
  internalSources: string[];
  related: string[];
};

export type PersonalRecordTime = {
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  reviewCadence?: string;
  nextReview?: string;
  lastReview?: string;
  processedOn?: string;
};

export type PersonalMemoryEntry = {
  id: string;
  text: string;
  occurredOn?: string;
  category?: string;
  pinned: boolean;
  createdAt?: string;
};

export type PersonalEducationEntry = {
  id: string;
  institution: string;
  organizationId?: string;
  degree?: string;
  fieldOfStudy?: string;
};

export type PersonalOccupationEntry = {
  id: string;
  title: string;
  employer?: string;
  organizationId?: string;
  status: "current" | "past";
};

export type PersonalLocationEntry = {
  id: string;
  label?: string;
  location?: string;
  address?: string;
};

export type PersonalContactEntryCategory = "primary" | "personal" | "work" | "university" | "custom";

export type PersonalEmailEntry = {
  id: string;
  category: PersonalContactEntryCategory;
  customLabel?: string;
  address: string;
};

export type PersonalPhoneEntry = {
  id: string;
  category: PersonalContactEntryCategory;
  customLabel?: string;
  number: string;
  countryCode: string;
};

export type PersonalContactProfile = {
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickname?: string;
  context?: string;
  birthday?: string;
  photoUrl?: string;
  photoUpdatedAt?: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
  primaryEmail?: string;
  workEmail?: string;
  universityEmail?: string;
  emails: PersonalEmailEntry[];
  phones: PersonalPhoneEntry[];
  primaryOccupation?: string;
  primaryEmployer?: string;
  secondaryOccupation?: string;
  secondaryEmployer?: string;
  pastOccupation?: string;
  pastEmployer?: string;
  universityAffiliation?: string;
  livesIn?: string;
  address?: string;
  comesFrom?: string;
  associatedPeople: string[];
  lastContact?: string;
  nextContact?: string;
  contactCadence?: string;
  interestingFact?: string;
  lifeDream?: string;
  notes?: string;
  linkedin?: string;
  website?: string;
  instagram?: string;
  tiktok?: string;
  x?: string;
  partner?: string;
  organizationType?: string;
  industry?: string;
  mission?: string;
  services?: string;
  foundedYear?: string;
  teamSize?: string;
  headquarters?: string;
  children: string[];
  interactions: string[];
  memories: PersonalMemoryEntry[];
  education: PersonalEducationEntry[];
  occupations: PersonalOccupationEntry[];
  locations: PersonalLocationEntry[];
};

export type PersonalRecord = {
  id: string;
  domain: string;
  title: string;
  className: PersonalRecordClass;
  knowledgeShape: PersonalRecordKnowledgeShape;
  privacy: PersonalRecordPrivacy;
  stage: PersonalRecordStage;
  status: PersonalRecordStatus;
  growth: PersonalRecordGrowth;
  body: string;
  url?: string;
  areas: string[];
  subjects: string[];
  projects: string[];
  intents: PersonalRecordIntent[];
  externalSources: string[];
  relations: PersonalRecordRelations;
  time: PersonalRecordTime;
  profile?: PersonalContactProfile;
  createdMeta: PersonalRecordCreatedMeta;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  statusBeforeArchive?: PersonalRecordStatus;
};

export type PersonalRecordInput = {
  domain: string;
  title: string;
  className?: string;
  kind?: string;
  knowledgeShape?: string;
  privacy?: string;
  stage?: string;
  status?: string;
  body?: string;
  happensOn?: string;
  url?: string;
  areas?: string[];
  subjects?: string[];
  projects?: string[];
  intents?: string[];
  externalSources?: string[];
  starred?: boolean;
  relations?: Partial<PersonalRecordRelations>;
  time?: PersonalRecordTime;
  profile?: Partial<PersonalContactProfile>;
};

export type PersonalRecordPatch = Partial<
  Pick<
    PersonalRecord,
    "title" | "status" | "body" | "url" | "projects" | "areas" | "subjects" | "externalSources" | "starred"
  >
> & {
  action?: "review" | "archive" | "restore";
  archiveReason?: string;
  time?: Partial<PersonalRecordTime>;
  profile?: Partial<PersonalContactProfile>;
};

const FILE_NAME = "personal-records.json";

export const PERSONAL_RECORD_CLASSES: PersonalRecordClass[] = [
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
export const PERSONAL_RECORD_STATUSES: PersonalRecordStatus[] = [
  "idea",
  "draft",
  "active",
  "completed",
  "blocked",
  "inactive",
  "next"
];
export const PERSONAL_RECORD_INTENTS: PersonalRecordIntent[] = [
  "connect",
  "create",
  "implement",
  "research",
  "retain",
  "ingest",
  "publish",
  "understand"
];
export const PERSONAL_RECORD_KNOWLEDGE_SHAPES: PersonalRecordKnowledgeShape[] = [
  "",
  "observation",
  "claim",
  "procedure",
  "process",
  "collection",
  "reference"
];
export const PERSONAL_RECORD_AREAS = [
  "AI",
  "Finance",
  "Relationships",
  "Career",
  "Personal",
  "Travel",
  "University",
  "Health",
  "Home"
];
export const PERSONAL_RECORD_SUBJECTS = [
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
export const PERSONAL_RECORD_PROJECTS = [
  "Project Pacific",
  "Project Fremen",
  "Project Iceflake",
  "Project Blacktube",
  "Project Pint"
];

const DEFAULT_RELATIONS: PersonalRecordRelations = {
  north: [],
  south: [],
  east: [],
  west: [],
  stakeholders: [],
  stakeholdings: [],
  internalSources: [],
  related: []
};

const CONTACT_PROFILE_TEXT_KEYS = [
  "fullName",
  "firstName",
  "middleName",
  "lastName",
  "nickname",
  "context",
  "birthday",
  "photoUrl",
  "photoUpdatedAt",
  "phoneNumber",
  "phoneCountryCode",
  "primaryEmail",
  "workEmail",
  "universityEmail",
  "primaryOccupation",
  "primaryEmployer",
  "secondaryOccupation",
  "secondaryEmployer",
  "pastOccupation",
  "pastEmployer",
  "universityAffiliation",
  "livesIn",
  "address",
  "comesFrom",
  "lastContact",
  "nextContact",
  "contactCadence",
  "interestingFact",
  "lifeDream",
  "notes",
  "linkedin",
  "website",
  "instagram",
  "tiktok",
  "x",
  "partner",
  "organizationType",
  "industry",
  "mission",
  "services",
  "foundedYear",
  "teamSize",
  "headquarters"
] as const;

const CONTACT_PROFILE_LIST_KEYS = ["associatedPeople", "children", "interactions"] as const;
const PERSONAL_RECORD_TIME_KEYS = [
  "startDate",
  "startTime",
  "dueDate",
  "dueTime",
  "reviewCadence",
  "nextReview",
  "lastReview",
  "processedOn"
] as const;

type ContactProfileTextKey = (typeof CONTACT_PROFILE_TEXT_KEYS)[number];

function splitProfileList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return sanitizeList(value.map(String), 80);
  }
  if (typeof value === "string") {
    return sanitizeList(value.split(",").map((item) => item.trim()), 80);
  }
  return [];
}

const MEMORY_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MEMORY_ID = /^[a-zA-Z0-9._:-]{1,128}$/;

function isValidMemoryDate(value: string): boolean {
  const match = value.match(MEMORY_DATE);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function deterministicMemoryId(value: string, index: number): string {
  let hash = 2166136261;
  for (let offset = 0; offset < value.length; offset += 1) {
    hash ^= value.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-memory-${index}-${(hash >>> 0).toString(36)}`;
}

function legacyMemoryEntry(value: string, index: number): PersonalMemoryEntry | null {
  const clean = value.trim();
  if (!clean) return null;
  const marked = clean.match(/^(Pinned|Saved)\s+([^:]{1,64}):\s*(.+)$/i);
  return {
    id: deterministicMemoryId(clean, index),
    text: marked?.[3]?.trim() || clean,
    category: marked?.[2]?.trim() || undefined,
    pinned: marked ? marked[1].toLowerCase() === "pinned" : true
  };
}

function normalizeMemoryEntries(value: unknown, strict = false): PersonalMemoryEntry[] {
  if (typeof value === "string") {
    value = value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) {
    if (strict && value !== undefined) throw new Error("Memories must be a list");
    return [];
  }
  if (strict && value.length > 80) throw new Error("A profile can store up to 80 memories");

  const entries: PersonalMemoryEntry[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.slice(0, 80).entries()) {
    if (typeof item === "string") {
      const legacy = legacyMemoryEntry(item, index);
      if (legacy) entries.push(legacy);
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (strict) throw new Error(`Memory ${index + 1} is invalid`);
      continue;
    }
    const raw = item as Record<string, unknown>;
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) {
      if (strict) throw new Error(`Memory ${index + 1} needs text`);
      continue;
    }
    if (text.length > 8000) throw new Error(`Memory ${index + 1} must be 8,000 characters or fewer`);

    let id = typeof raw.id === "string" && MEMORY_ID.test(raw.id.trim())
      ? raw.id.trim()
      : deterministicMemoryId(text, index);
    if (ids.has(id)) {
      if (strict) throw new Error("Each memory needs a unique id");
      id = deterministicMemoryId(`${text}:${id}`, index);
    }
    ids.add(id);

    const occurredOn = typeof raw.occurredOn === "string" ? raw.occurredOn.trim() : "";
    if (strict && occurredOn && !isValidMemoryDate(occurredOn)) {
      throw new Error(`Memory ${index + 1} needs a valid date`);
    }
    const category = typeof raw.category === "string"
      ? raw.category.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 64)
      : "";
    const createdAt = typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt))
      ? raw.createdAt
      : undefined;
    entries.push({
      id,
      text,
      occurredOn: occurredOn && isValidMemoryDate(occurredOn) ? occurredOn : undefined,
      category: category || undefined,
      pinned: typeof raw.pinned === "boolean" ? raw.pinned : true,
      createdAt
    });
  }
  return entries;
}

function deterministicProfileEntryId(prefix: string, value: string, index: number): string {
  let hash = 2166136261;
  for (let offset = 0; offset < value.length; offset += 1) {
    hash ^= value.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${index}-${(hash >>> 0).toString(36)}`;
}

function profileEntryText(
  value: unknown,
  maximum: number,
  strict: boolean,
  label: string
): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    if (strict) throw new Error(`${label} must be text`);
    return "";
  }
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (strict && clean.length > maximum) throw new Error(`${label} must be ${maximum.toLocaleString()} characters or fewer`);
  return clean.slice(0, maximum);
}

function profileEntryId(
  prefix: string,
  rawId: unknown,
  basis: string,
  index: number,
  ids: Set<string>,
  strict: boolean
): string {
  let id = typeof rawId === "string" && MEMORY_ID.test(rawId.trim())
    ? rawId.trim()
    : deterministicProfileEntryId(prefix, basis, index);
  if (ids.has(id)) {
    if (strict) throw new Error(`Each ${prefix} entry needs a unique id`);
    id = deterministicProfileEntryId(prefix, `${basis}:${id}`, index);
  }
  ids.add(id);
  return id;
}

const CONTACT_ENTRY_CATEGORIES = ["primary", "personal", "work", "university", "custom"] as const;

function normalizeContactEntryCategory(
  value: unknown,
  index: number,
  strict: boolean,
  kind: "email" | "phone"
): PersonalContactEntryCategory {
  const category = typeof value === "string" ? value.trim().toLowerCase() : index === 0 ? "primary" : "personal";
  if (CONTACT_ENTRY_CATEGORIES.includes(category as PersonalContactEntryCategory)) {
    return category as PersonalContactEntryCategory;
  }
  if (strict) throw new Error(`${kind === "email" ? "Email" : "Phone"} ${index + 1} category is invalid`);
  return index === 0 ? "primary" : "personal";
}

function normalizeContactCountryCode(value: unknown, strict: boolean, label: string): string {
  const raw = profileEntryText(value, 8, strict, label);
  const normalized = canonicalCountryCode(raw, strict ? "" : "+1");
  if (strict && !normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizeContactPhoneNumber(
  value: unknown,
  countryCode: string,
  strict: boolean,
  label: string
): string {
  const raw = profileEntryText(value, 40, strict, label);
  if (!raw) return "";
  const canonical = normalizePhoneForStorage(raw, countryCode);
  const validationError = canonical ? validateInternationalPhone(canonical, countryCode) : "Phone number needs a country code.";
  if (strict && validationError) throw new Error(`${label}: ${validationError}`);
  return validationError ? "" : canonical;
}

function normalizeEmailEntries(value: unknown, strict = false): PersonalEmailEntry[] {
  if (!Array.isArray(value)) {
    if (strict && value !== undefined) throw new Error("Emails must be a list");
    return [];
  }
  if (strict && value.length > 16) throw new Error("A profile can store up to 16 email addresses");

  const entries: PersonalEmailEntry[] = [];
  const ids = new Set<string>();
  const addresses = new Set<string>();
  let primaryCount = 0;
  for (const [index, item] of value.slice(0, 16).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (strict) throw new Error(`Email ${index + 1} is invalid`);
      continue;
    }
    const raw = item as Record<string, unknown>;
    const address = profileEntryText(raw.address, 320, strict, `Email ${index + 1} address`);
    if (!address) {
      if (strict) throw new Error(`Email ${index + 1} needs an address`);
      continue;
    }
    if (strict && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      throw new Error(`Email ${index + 1} needs a valid address`);
    }
    const normalizedAddress = address.toLowerCase();
    if (addresses.has(normalizedAddress)) {
      if (strict) throw new Error("Each email address must be unique");
      continue;
    }
    addresses.add(normalizedAddress);
    let category = normalizeContactEntryCategory(raw.category, index, strict, "email");
    if (category === "primary") {
      primaryCount += 1;
      if (strict && primaryCount > 1) throw new Error("A profile can have only one primary email");
      if (!strict && primaryCount > 1) category = "personal";
    }
    const customLabel = profileEntryText(raw.customLabel, 80, strict, `Email ${index + 1} custom category`);
    if (strict && category === "custom" && !customLabel) {
      throw new Error(`Email ${index + 1} needs a custom category`);
    }
    entries.push({
      id: profileEntryId("email", raw.id, `${category}:${customLabel}:${normalizedAddress}`, index, ids, strict),
      category,
      customLabel: category === "custom" && customLabel ? customLabel : undefined,
      address
    });
  }
  return entries;
}

function normalizePhoneEntries(value: unknown, strict = false): PersonalPhoneEntry[] {
  if (!Array.isArray(value)) {
    if (strict && value !== undefined) throw new Error("Phone numbers must be a list");
    return [];
  }
  if (strict && value.length > 16) throw new Error("A profile can store up to 16 phone numbers");

  const entries: PersonalPhoneEntry[] = [];
  const ids = new Set<string>();
  const numbers = new Set<string>();
  let primaryCount = 0;
  for (const [index, item] of value.slice(0, 16).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (strict) throw new Error(`Phone ${index + 1} is invalid`);
      continue;
    }
    const raw = item as Record<string, unknown>;
    const countryCode = normalizeContactCountryCode(raw.countryCode, strict, `Phone ${index + 1} country code`);
    const number = normalizeContactPhoneNumber(raw.number, countryCode, strict, `Phone ${index + 1}`);
    if (!number) {
      if (strict) throw new Error(`Phone ${index + 1} needs a number`);
      continue;
    }
    if (numbers.has(number)) {
      if (strict) throw new Error("Each phone number must be unique");
      continue;
    }
    numbers.add(number);
    let category = normalizeContactEntryCategory(raw.category, index, strict, "phone");
    if (category === "primary") {
      primaryCount += 1;
      if (strict && primaryCount > 1) throw new Error("A profile can have only one primary phone number");
      if (!strict && primaryCount > 1) category = "personal";
    }
    const customLabel = profileEntryText(raw.customLabel, 80, strict, `Phone ${index + 1} custom category`);
    if (strict && category === "custom" && !customLabel) {
      throw new Error(`Phone ${index + 1} needs a custom category`);
    }
    entries.push({
      id: profileEntryId("phone", raw.id, `${category}:${customLabel}:${number}`, index, ids, strict),
      category,
      customLabel: category === "custom" && customLabel ? customLabel : undefined,
      number,
      countryCode
    });
  }
  return entries;
}

function normalizeEducationEntries(value: unknown, strict = false): PersonalEducationEntry[] {
  if (!Array.isArray(value)) {
    if (strict && value !== undefined) throw new Error("Education must be a list");
    return [];
  }
  if (strict && value.length > 16) throw new Error("A profile can store up to 16 education entries");

  const entries: PersonalEducationEntry[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.slice(0, 16).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (strict) throw new Error(`Education entry ${index + 1} is invalid`);
      continue;
    }
    const raw = item as Record<string, unknown>;
    const organizationId = profileEntryText(raw.organizationId, 80, strict, `Education entry ${index + 1} organization`);
    if (strict && organizationId && !/^personal-[0-9a-f-]{36}$/i.test(organizationId)) {
      throw new Error(`Education entry ${index + 1} organization link is invalid`);
    }
    const institution = profileEntryText(raw.institution, 240, strict, `Education entry ${index + 1} university`);
    const degree = profileEntryText(raw.degree, 240, strict, `Education entry ${index + 1} degree`);
    const fieldOfStudy = profileEntryText(raw.fieldOfStudy, 240, strict, `Education entry ${index + 1} field of study`);
    if (!institution && !organizationId && !degree && !fieldOfStudy) {
      if (strict) throw new Error(`Education entry ${index + 1} needs a university, degree, or field of study`);
      continue;
    }
    entries.push({
      id: profileEntryId("education", raw.id, `${institution}:${degree}:${fieldOfStudy}`, index, ids, strict),
      institution,
      organizationId: organizationId || undefined,
      degree: degree || undefined,
      fieldOfStudy: fieldOfStudy || undefined
    });
  }
  return entries;
}

function normalizeOccupationEntries(value: unknown, strict = false): PersonalOccupationEntry[] {
  if (!Array.isArray(value)) {
    if (strict && value !== undefined) throw new Error("Jobs must be a list");
    return [];
  }
  if (strict && value.length > 24) throw new Error("A profile can store up to 24 jobs");

  const entries: PersonalOccupationEntry[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.slice(0, 24).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (strict) throw new Error(`Job ${index + 1} is invalid`);
      continue;
    }
    const raw = item as Record<string, unknown>;
    const organizationId = profileEntryText(raw.organizationId, 80, strict, `Job ${index + 1} organization`);
    if (strict && organizationId && !/^personal-[0-9a-f-]{36}$/i.test(organizationId)) {
      throw new Error(`Job ${index + 1} organization link is invalid`);
    }
    const title = profileEntryText(raw.title, 240, strict, `Job ${index + 1} title`);
    const employer = profileEntryText(raw.employer, 240, strict, `Job ${index + 1} employer`);
    if (!title && !employer && !organizationId) {
      if (strict) throw new Error(`Job ${index + 1} needs a title or employer`);
      continue;
    }
    const rawStatus = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "current";
    if (strict && rawStatus !== "current" && rawStatus !== "past") throw new Error(`Job ${index + 1} status is invalid`);
    const status = rawStatus === "past" ? "past" : "current";
    entries.push({
      id: profileEntryId("occupation", raw.id, `${title}:${employer}:${status}`, index, ids, strict),
      title,
      employer: employer || undefined,
      organizationId: organizationId || undefined,
      status
    });
  }
  return entries;
}

function normalizeLocationEntries(value: unknown, strict = false): PersonalLocationEntry[] {
  if (!Array.isArray(value)) {
    if (strict && value !== undefined) throw new Error("Locations must be a list");
    return [];
  }
  if (strict && value.length > 16) throw new Error("A profile can store up to 16 locations");

  const entries: PersonalLocationEntry[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.slice(0, 16).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (strict) throw new Error(`Location ${index + 1} is invalid`);
      continue;
    }
    const raw = item as Record<string, unknown>;
    const label = profileEntryText(raw.label, 80, strict, `Location ${index + 1} label`);
    const location = profileEntryText(raw.location, 320, strict, `Location ${index + 1} city or region`);
    const address = profileEntryText(raw.address, 1000, strict, `Location ${index + 1} address`);
    if (!location && !address) {
      if (strict) throw new Error(`Location ${index + 1} needs a city, region, or street address`);
      continue;
    }
    entries.push({
      id: profileEntryId("location", raw.id, `${label}:${location}:${address}`, index, ids, strict),
      label: label || undefined,
      location: location || undefined,
      address: address || undefined
    });
  }
  return entries;
}

function reconcileContactProfileCollections(
  profile: PersonalContactProfile,
  options: { preferEmails?: boolean; preferPhones?: boolean } = {}
): PersonalContactProfile {
  const education = profile.education.map((entry) => ({ ...entry }));
  const occupations = profile.occupations.map((entry) => ({ ...entry }));
  const locations = profile.locations.map((entry) => ({ ...entry }));
  const emails = profile.emails.map((entry) => ({ ...entry }));
  const phones = profile.phones.map((entry) => ({ ...entry }));

  const upsertLegacyEmail = (
    category: Extract<PersonalContactEntryCategory, "primary" | "work" | "university">,
    address: string | undefined
  ) => {
    if (!address) return;
    const index = emails.findIndex((entry) => entry.category === category);
    const next: PersonalEmailEntry = {
      id: index >= 0 ? emails[index].id : deterministicProfileEntryId("email", `${category}:${address}`, emails.length),
      category,
      address
    };
    if (index >= 0) emails[index] = next;
    else emails.push(next);
  };
  if (!options.preferEmails) {
    upsertLegacyEmail("primary", profile.primaryEmail);
    upsertLegacyEmail("work", profile.workEmail);
    upsertLegacyEmail("university", profile.universityEmail);
  }

  if (!options.preferPhones && profile.phoneNumber) {
    const countryCode = normalizeContactCountryCode(profile.phoneCountryCode, false, "Phone country code");
    const number = normalizeContactPhoneNumber(profile.phoneNumber, countryCode, false, "Phone");
    if (number) {
      const index = phones.findIndex((entry) => entry.category === "primary");
      const next: PersonalPhoneEntry = {
        id: index >= 0 ? phones[index].id : deterministicProfileEntryId("phone", `primary:${number}`, phones.length),
        category: "primary",
        number,
        countryCode
      };
      if (index >= 0) phones[index] = next;
      else phones.unshift(next);
    }
  }

  if (profile.universityAffiliation) {
    if (education.length > 0) education[0] = { ...education[0], institution: profile.universityAffiliation };
    else education.push({
      id: deterministicProfileEntryId("education", profile.universityAffiliation, 0),
      institution: profile.universityAffiliation
    });
  }

  const currentJobs = occupations.filter((entry) => entry.status === "current");
  const pastJobs = occupations.filter((entry) => entry.status === "past");
  if (profile.primaryOccupation || profile.primaryEmployer) {
    const replacement: PersonalOccupationEntry = {
      id: currentJobs[0]?.id || deterministicProfileEntryId("occupation", `${profile.primaryOccupation || ""}:${profile.primaryEmployer || ""}:current`, 0),
      title: profile.primaryOccupation || currentJobs[0]?.title || "",
      employer: profile.primaryEmployer || currentJobs[0]?.employer,
      organizationId: currentJobs[0]?.organizationId,
      status: "current"
    };
    const index = currentJobs[0] ? occupations.findIndex((entry) => entry.id === currentJobs[0].id) : -1;
    if (index >= 0) occupations[index] = replacement;
    else occupations.unshift(replacement);
  }
  if (profile.secondaryOccupation || profile.secondaryEmployer) {
    const replacement: PersonalOccupationEntry = {
      id: currentJobs[1]?.id || deterministicProfileEntryId("occupation", `${profile.secondaryOccupation || ""}:${profile.secondaryEmployer || ""}:current`, 1),
      title: profile.secondaryOccupation || currentJobs[1]?.title || "",
      employer: profile.secondaryEmployer || currentJobs[1]?.employer,
      organizationId: currentJobs[1]?.organizationId,
      status: "current"
    };
    const index = currentJobs[1] ? occupations.findIndex((entry) => entry.id === currentJobs[1].id) : -1;
    if (index >= 0) occupations[index] = replacement;
    else occupations.push(replacement);
  }
  if (profile.pastOccupation || profile.pastEmployer) {
    const replacement: PersonalOccupationEntry = {
      id: pastJobs[0]?.id || deterministicProfileEntryId("occupation", `${profile.pastOccupation || ""}:${profile.pastEmployer || ""}:past`, 0),
      title: profile.pastOccupation || pastJobs[0]?.title || "",
      employer: profile.pastEmployer || pastJobs[0]?.employer,
      organizationId: pastJobs[0]?.organizationId,
      status: "past"
    };
    const index = pastJobs[0] ? occupations.findIndex((entry) => entry.id === pastJobs[0].id) : -1;
    if (index >= 0) occupations[index] = replacement;
    else occupations.push(replacement);
  }

  if (profile.livesIn || profile.address) {
    const replacement: PersonalLocationEntry = {
      id: locations[0]?.id || deterministicProfileEntryId("location", `${profile.livesIn || ""}:${profile.address || ""}`, 0),
      label: locations[0]?.label || "Primary home",
      location: profile.livesIn || locations[0]?.location,
      address: profile.address || locations[0]?.address
    };
    if (locations.length > 0) locations[0] = replacement;
    else locations.push(replacement);
  }

  const resolvedCurrentJobs = occupations.filter((entry) => entry.status === "current");
  const resolvedPastJobs = occupations.filter((entry) => entry.status === "past");
  const primaryEmail = emails.find((entry) => entry.category === "primary") || emails[0];
  const workEmail = emails.find((entry) => entry.category === "work");
  const universityEmail = emails.find((entry) => entry.category === "university");
  const primaryPhone = phones.find((entry) => entry.category === "primary") || phones[0];
  return {
    ...profile,
    primaryEmail: options.preferEmails ? primaryEmail?.address : profile.primaryEmail || primaryEmail?.address,
    workEmail: options.preferEmails ? workEmail?.address : profile.workEmail || workEmail?.address,
    universityEmail: options.preferEmails ? universityEmail?.address : profile.universityEmail || universityEmail?.address,
    phoneNumber: options.preferPhones ? primaryPhone?.number : profile.phoneNumber || primaryPhone?.number,
    phoneCountryCode: options.preferPhones
      ? primaryPhone?.countryCode || "+1"
      : profile.phoneCountryCode || primaryPhone?.countryCode || "+1",
    universityAffiliation: profile.universityAffiliation || education[0]?.institution,
    primaryOccupation: profile.primaryOccupation || resolvedCurrentJobs[0]?.title,
    primaryEmployer: profile.primaryEmployer || resolvedCurrentJobs[0]?.employer,
    secondaryOccupation: profile.secondaryOccupation || resolvedCurrentJobs[1]?.title,
    secondaryEmployer: profile.secondaryEmployer || resolvedCurrentJobs[1]?.employer,
    pastOccupation: profile.pastOccupation || resolvedPastJobs[0]?.title,
    pastEmployer: profile.pastEmployer || resolvedPastJobs[0]?.employer,
    livesIn: profile.livesIn || locations[0]?.location,
    address: profile.address || locations[0]?.address,
    education,
    occupations,
    locations,
    emails,
    phones
  };
}

function normalizeContactProfile(input: unknown, strictEntries = false): PersonalContactProfile | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const raw = input as Record<string, unknown>;
  const profile: PersonalContactProfile = {
    associatedPeople: splitProfileList(raw.associatedPeople),
    children: splitProfileList(raw.children),
    interactions: splitProfileList(raw.interactions),
    memories: normalizeMemoryEntries(raw.memories, strictEntries),
    education: normalizeEducationEntries(raw.education, strictEntries),
    occupations: normalizeOccupationEntries(raw.occupations, strictEntries),
    locations: normalizeLocationEntries(raw.locations, strictEntries),
    emails: normalizeEmailEntries(raw.emails, strictEntries),
    phones: normalizePhoneEntries(raw.phones, strictEntries)
  };

  for (const key of CONTACT_PROFILE_TEXT_KEYS) {
    const value = raw[key];
    if (typeof value === "string") {
      profile[key as ContactProfileTextKey] = value.trim();
    }
  }

  if (profile.birthday) profile.birthday = normalizeBirthday(profile.birthday, strictEntries) || undefined;
  if (profile.photoUrl && !/^\/api\/people\/photos\/personal-[0-9a-f-]{36}$/i.test(profile.photoUrl)) {
    if (strictEntries) throw new Error("Profile picture reference is invalid");
    profile.photoUrl = undefined;
  }
  if (profile.photoUpdatedAt && Number.isNaN(Date.parse(profile.photoUpdatedAt))) {
    if (strictEntries) throw new Error("Profile picture timestamp is invalid");
    profile.photoUpdatedAt = undefined;
  }
  if (profile.foundedYear && !/^\d{4}$/.test(profile.foundedYear)) {
    if (strictEntries) throw new Error("Founded year must contain four digits");
    profile.foundedYear = undefined;
  }

  return reconcileContactProfileCollections(profile, {
    preferEmails: Array.isArray(raw.emails),
    preferPhones: Array.isArray(raw.phones)
  });
}

function normalizeContactProfilePatch(input: unknown): Partial<PersonalContactProfile> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const raw = input as Record<string, unknown>;
  const patch: Partial<PersonalContactProfile> = {};

  for (const key of CONTACT_PROFILE_TEXT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      continue;
    }
    const value = raw[key];
    if (typeof value === "string") {
      patch[key] = value.trim() || undefined;
    }
  }

  if (patch.birthday) patch.birthday = normalizeBirthday(patch.birthday, true) || undefined;
  if (patch.photoUrl && !/^\/api\/people\/photos\/personal-[0-9a-f-]{36}$/i.test(patch.photoUrl)) {
    throw new Error("Profile picture reference is invalid");
  }
  if (patch.photoUpdatedAt && Number.isNaN(Date.parse(patch.photoUpdatedAt))) {
    throw new Error("Profile picture timestamp is invalid");
  }
  if (patch.foundedYear && !/^\d{4}$/.test(patch.foundedYear)) {
    throw new Error("Founded year must contain four digits");
  }

  for (const key of CONTACT_PROFILE_LIST_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      continue;
    }
    const value = raw[key];
    if (typeof value === "string" || Array.isArray(value)) {
      patch[key] = splitProfileList(value);
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, "memories")) {
    patch.memories = normalizeMemoryEntries(raw.memories, true);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "education")) {
    patch.education = normalizeEducationEntries(raw.education, true);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "occupations")) {
    patch.occupations = normalizeOccupationEntries(raw.occupations, true);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "locations")) {
    patch.locations = normalizeLocationEntries(raw.locations, true);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "emails")) {
    patch.emails = normalizeEmailEntries(raw.emails, true);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "phones")) {
    patch.phones = normalizePhoneEntries(raw.phones, true);
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}

function mergeContactProfile(
  current: PersonalContactProfile | undefined,
  patch: Partial<PersonalContactProfile> | undefined
): PersonalContactProfile | undefined {
  if (!patch) {
    return current;
  }
  const has = (key: keyof PersonalContactProfile) => Object.prototype.hasOwnProperty.call(patch, key);
  const education = (patch.education ?? current?.education ?? []).map((entry) => ({ ...entry }));
  const occupations = (patch.occupations ?? current?.occupations ?? []).map((entry) => ({ ...entry }));
  const locations = (patch.locations ?? current?.locations ?? []).map((entry) => ({ ...entry }));
  const emails = (patch.emails ?? current?.emails ?? []).map((entry) => ({ ...entry }));
  const phones = (patch.phones ?? current?.phones ?? []).map((entry) => ({ ...entry }));

  let universityAffiliation = has("universityAffiliation")
    ? patch.universityAffiliation
    : patch.education
      ? education[0]?.institution
      : current?.universityAffiliation;
  if (!patch.education && has("universityAffiliation")) {
    if (universityAffiliation) {
      if (education.length > 0) education[0] = { ...education[0], institution: universityAffiliation };
      else education.push({ id: deterministicProfileEntryId("education", universityAffiliation, 0), institution: universityAffiliation });
    } else if (education[0]) {
      education[0] = { ...education[0], institution: "" };
      if (!education[0].degree && !education[0].fieldOfStudy) education.shift();
    }
  }

  const projectedJobs = (status: PersonalOccupationEntry["status"]) => occupations
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.status === status);
  const updateProjectedJob = (
    status: PersonalOccupationEntry["status"],
    position: number,
    title: string | undefined,
    employer: string | undefined
  ) => {
    const projected = projectedJobs(status)[position];
    if (!title && !employer) {
      if (projected) occupations.splice(projected.index, 1);
      return;
    }
    const replacement: PersonalOccupationEntry = {
      id: projected?.entry.id || deterministicProfileEntryId("occupation", `${title || ""}:${employer || ""}:${status}`, position),
      title: title || "",
      employer,
      status
    };
    if (projected) occupations[projected.index] = replacement;
    else occupations.push(replacement);
  };

  let primaryOccupation = has("primaryOccupation") ? patch.primaryOccupation : current?.primaryOccupation;
  let primaryEmployer = has("primaryEmployer") ? patch.primaryEmployer : current?.primaryEmployer;
  let secondaryOccupation = has("secondaryOccupation") ? patch.secondaryOccupation : current?.secondaryOccupation;
  let secondaryEmployer = has("secondaryEmployer") ? patch.secondaryEmployer : current?.secondaryEmployer;
  let pastOccupation = has("pastOccupation") ? patch.pastOccupation : current?.pastOccupation;
  let pastEmployer = has("pastEmployer") ? patch.pastEmployer : current?.pastEmployer;
  if (patch.occupations) {
    const currentJobs = occupations.filter((entry) => entry.status === "current");
    const pastJobs = occupations.filter((entry) => entry.status === "past");
    if (!has("primaryOccupation")) primaryOccupation = currentJobs[0]?.title;
    if (!has("primaryEmployer")) primaryEmployer = currentJobs[0]?.employer;
    if (!has("secondaryOccupation")) secondaryOccupation = currentJobs[1]?.title;
    if (!has("secondaryEmployer")) secondaryEmployer = currentJobs[1]?.employer;
    if (!has("pastOccupation")) pastOccupation = pastJobs[0]?.title;
    if (!has("pastEmployer")) pastEmployer = pastJobs[0]?.employer;
  } else {
    if (has("primaryOccupation") || has("primaryEmployer")) updateProjectedJob("current", 0, primaryOccupation, primaryEmployer);
    if (has("secondaryOccupation") || has("secondaryEmployer")) updateProjectedJob("current", 1, secondaryOccupation, secondaryEmployer);
    if (has("pastOccupation") || has("pastEmployer")) updateProjectedJob("past", 0, pastOccupation, pastEmployer);
  }

  let livesIn = has("livesIn") ? patch.livesIn : current?.livesIn;
  let address = has("address") ? patch.address : current?.address;
  if (patch.locations) {
    if (!has("livesIn")) livesIn = locations[0]?.location;
    if (!has("address")) address = locations[0]?.address;
  } else if (has("livesIn") || has("address")) {
    if (livesIn || address) {
      const first = locations[0];
      const replacement: PersonalLocationEntry = {
        id: first?.id || deterministicProfileEntryId("location", `${livesIn || ""}:${address || ""}`, 0),
        label: first?.label || "Primary home",
        location: livesIn,
        address
      };
      if (first) locations[0] = replacement;
      else locations.push(replacement);
    } else if (locations.length > 0) {
      locations.shift();
    }
  }

  const updateProjectedEmail = (
    category: Extract<PersonalContactEntryCategory, "primary" | "work" | "university">,
    address: string | undefined
  ) => {
    const index = emails.findIndex((entry) => entry.category === category);
    if (!address) {
      if (index >= 0) emails.splice(index, 1);
      return;
    }
    const replacement: PersonalEmailEntry = {
      id: index >= 0 ? emails[index].id : deterministicProfileEntryId("email", `${category}:${address}`, emails.length),
      category,
      address
    };
    if (index >= 0) emails[index] = replacement;
    else emails.push(replacement);
  };

  let primaryEmail = has("primaryEmail") ? patch.primaryEmail : current?.primaryEmail;
  let workEmail = has("workEmail") ? patch.workEmail : current?.workEmail;
  let universityEmail = has("universityEmail") ? patch.universityEmail : current?.universityEmail;
  if (patch.emails) {
    if (!has("primaryEmail")) primaryEmail = (emails.find((entry) => entry.category === "primary") || emails[0])?.address;
    if (!has("workEmail")) workEmail = emails.find((entry) => entry.category === "work")?.address;
    if (!has("universityEmail")) universityEmail = emails.find((entry) => entry.category === "university")?.address;
  } else {
    if (has("primaryEmail")) updateProjectedEmail("primary", primaryEmail);
    if (has("workEmail")) updateProjectedEmail("work", workEmail);
    if (has("universityEmail")) updateProjectedEmail("university", universityEmail);
  }

  let phoneNumber = has("phoneNumber") ? patch.phoneNumber : current?.phoneNumber;
  let phoneCountryCode = has("phoneCountryCode") ? patch.phoneCountryCode : current?.phoneCountryCode;
  if (patch.phones) {
    const primaryPhone = phones.find((entry) => entry.category === "primary") || phones[0];
    if (!has("phoneNumber")) phoneNumber = primaryPhone?.number;
    if (!has("phoneCountryCode")) phoneCountryCode = primaryPhone?.countryCode || "+1";
  } else if (has("phoneNumber") || has("phoneCountryCode")) {
    const index = phones.findIndex((entry) => entry.category === "primary");
    if (!phoneNumber) {
      if (index >= 0) phones.splice(index, 1);
    } else {
      const countryCode = normalizeContactCountryCode(phoneCountryCode, false, "Phone country code");
      const normalizedNumber = normalizeContactPhoneNumber(phoneNumber, countryCode, false, "Phone") || phoneNumber;
      const replacement: PersonalPhoneEntry = {
        id: index >= 0 ? phones[index].id : deterministicProfileEntryId("phone", `primary:${normalizedNumber}`, phones.length),
        category: "primary",
        number: normalizedNumber,
        countryCode
      };
      if (index >= 0) phones[index] = replacement;
      else phones.unshift(replacement);
      phoneNumber = normalizedNumber;
      phoneCountryCode = countryCode;
    }
  }

  return reconcileContactProfileCollections({
    ...current,
    ...patch,
    universityAffiliation,
    primaryOccupation,
    primaryEmployer,
    secondaryOccupation,
    secondaryEmployer,
    pastOccupation,
    pastEmployer,
    livesIn,
    address,
    primaryEmail,
    workEmail,
    universityEmail,
    phoneNumber,
    phoneCountryCode,
    associatedPeople: patch.associatedPeople ?? current?.associatedPeople ?? [],
    children: patch.children ?? current?.children ?? [],
    interactions: patch.interactions ?? current?.interactions ?? [],
    memories: patch.memories ?? current?.memories ?? [],
    education,
    occupations,
    locations,
    emails,
    phones
  }, {
    // mergeContactProfile has already reconciled scalar compatibility fields into
    // these collections. From this point forward, the structured lists own the
    // value so an unrelated patch cannot re-add a projected scalar as a duplicate.
    preferEmails: true,
    preferPhones: true
  });
}

function sanitizeTitle(value: string): string {
  const title = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    throw new Error("Title is required");
  }
  if (title.length > 240) {
    throw new Error("Title must be 240 characters or fewer");
  }
  return title;
}

function normalizeOptionalHttpUrl(value: string): string | undefined {
  const url = value.trim();
  if (!url) {
    return undefined;
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Link must start with http:// or https://");
  }
  return url;
}

function isAllowedDomain(slug: string) {
  return Boolean(getPersonalSystemDomain(slug));
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

function buildUid(date: Date) {
  const parts = getNewYorkParts(date);
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}${pad(date.getMilliseconds(), 3)}`;
}

function formatReadableCreated(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function buildCreatedMeta(date: Date): PersonalRecordCreatedMeta {
  const parts = getNewYorkParts(date);
  const month = Number(parts.month);
  const quarter = `Q${Math.ceil(month / 3)}`;
  const isoWeek = getIsoWeek(date);
  const weekdayNumber = String((date.getDay() + 6) % 7 + 1);
  return {
    uid: buildUid(date),
    createdIso: date.toISOString(),
    created: formatReadableCreated(date),
    createdDate: `${parts.year}-${parts.month}-${parts.day}`,
    createdYear: parts.year,
    createdMonth: parts.month,
    createdYearMonth: `${parts.year}-${parts.month}`,
    createdQuarter: quarter,
    createdYearQuarter: `${parts.year}-${quarter}`,
    createdWeek: `W${pad(isoWeek.week)}`,
    createdYearWeek: `${isoWeek.year}-W${pad(isoWeek.week)}`,
    createdWeekdayName: parts.weekday,
    createdWeekdayNumber: weekdayNumber
  };
}

function sanitizeList(values: string[] | undefined, limit = 24): string[] {
  if (!values) {
    return [];
  }

  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) {
      continue;
    }
    seen.add(trimmed.toLowerCase());
    next.push(trimmed);
  }
  return next.slice(0, limit);
}

function sanitizeSubjectsForClass(
  values: string[] | undefined,
  className: PersonalRecordClass
): string[] {
  const subjects = sanitizeList(values);
  if (className !== "person" && className !== "org") {
    return subjects;
  }

  return sanitizeList(subjects.map((subject) =>
    subject.toLowerCase() === "colleague / coworker" ? "Colleague" : subject
  ));
}

function sanitizeRecordIds(values: string[] | undefined): string[] {
  return sanitizeList(values, 80);
}

function pickClass(value: string | undefined): PersonalRecordClass {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "event") return "event";
  if (normalized === "file") return "file";
  if (normalized === "decision") return "decision";
  if (normalized === "metric") return "metric";
  return PERSONAL_RECORD_CLASSES.includes(normalized as PersonalRecordClass)
    ? (normalized as PersonalRecordClass)
    : "note";
}

function pickStatus(value: string | undefined): PersonalRecordStatus {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "done") return "completed";
  if (normalized === "archived" || normalized === "waiting") return "inactive";
  return PERSONAL_RECORD_STATUSES.includes(normalized as PersonalRecordStatus)
    ? (normalized as PersonalRecordStatus)
    : "idea";
}

function pickPrivacy(value: string | undefined): PersonalRecordPrivacy {
  return value === "shared" ? "shared" : "private";
}

function pickStage(value: string | undefined): PersonalRecordStage {
  return value === "unprocessed" ? "unprocessed" : "processed";
}

function pickKnowledgeShape(value: string | undefined): PersonalRecordKnowledgeShape {
  const normalized = value?.trim().toLowerCase() || "";
  return PERSONAL_RECORD_KNOWLEDGE_SHAPES.includes(normalized as PersonalRecordKnowledgeShape)
    ? (normalized as PersonalRecordKnowledgeShape)
    : "";
}

function calculateGrowth(record: { body: string; relations?: PersonalRecordRelations }): PersonalRecordGrowth {
  const wordCount = record.body.trim().split(/\s+/).filter(Boolean).length;
  const relationCount = record.relations
    ? record.relations.north.length +
      record.relations.south.length +
      record.relations.east.length +
      record.relations.west.length +
      record.relations.related.length +
      record.relations.internalSources.length
    : 0;
  if (relationCount >= 18 || wordCount >= 5000) return "jungle";
  if (relationCount >= 10 || wordCount >= 2500) return "forest";
  if (wordCount >= 900) return "tree";
  if (wordCount >= 180) return "plant";
  return "seed";
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months, 1);
  const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, maxDay));
  return next;
}

function calculateNextReview(lastReview: string | undefined, cadence: string | undefined): string | undefined {
  const cleanCadence = cadence?.trim().toUpperCase();
  if (!cleanCadence) {
    return undefined;
  }
  const base = lastReview ? new Date(lastReview) : new Date();
  if (Number.isNaN(base.getTime())) {
    return undefined;
  }
  const match = cleanCadence.match(/^P(\d+)([DWMY])$/);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const unit = match[2];
  if (unit === "D") return dateOnly(new Date(base.getTime() + amount * 86400000));
  if (unit === "W") return dateOnly(new Date(base.getTime() + amount * 7 * 86400000));
  if (unit === "M") return dateOnly(addMonths(base, amount));
  return dateOnly(addMonths(base, amount * 12));
}

function normalizeTime(
  input: PersonalRecordTime | undefined,
  meta: PersonalRecordCreatedMeta,
  stage: PersonalRecordStage,
  className: PersonalRecordClass
): PersonalRecordTime {
  const reviewCadence = input?.reviewCadence?.trim().toUpperCase() || undefined;
  const keepsUnknownLastContact = className === "person" || className === "org";
  const lastReview = input?.lastReview?.trim() || (keepsUnknownLastContact ? undefined : meta.createdIso);
  const nextReview = input?.nextReview?.trim() || calculateNextReview(lastReview, reviewCadence);
  return {
    startDate: input?.startDate?.trim() || undefined,
    startTime: input?.startTime?.trim() || undefined,
    dueDate: input?.dueDate?.trim() || undefined,
    dueTime: input?.dueTime?.trim() || undefined,
    reviewCadence,
    nextReview,
    lastReview,
    processedOn: input?.processedOn?.trim() || (stage === "processed" ? meta.createdDate : undefined)
  };
}

function mergeTimePatch(
  current: PersonalRecordTime,
  input: Partial<PersonalRecordTime> | undefined
): PersonalRecordTime {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...current };
  }

  const raw = input as Record<string, unknown>;
  const patch: Partial<PersonalRecordTime> = {};
  for (const key of PERSONAL_RECORD_TIME_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      continue;
    }
    const value = raw[key];
    if (typeof value !== "string") {
      continue;
    }
    const normalized = key === "reviewCadence" ? value.trim().toUpperCase() : value.trim();
    if (normalized.length > 120) {
      throw new Error(`${key} must be 120 characters or fewer`);
    }
    patch[key] = normalized || undefined;
  }

  const next = { ...current, ...patch };
  const cadenceChanged = Object.prototype.hasOwnProperty.call(raw, "reviewCadence");
  const lastReviewChanged = Object.prototype.hasOwnProperty.call(raw, "lastReview");
  const nextReviewProvided = Object.prototype.hasOwnProperty.call(raw, "nextReview");
  if ((cadenceChanged || lastReviewChanged) && !nextReviewProvided) {
    if (cadenceChanged && next.reviewCadence === "NONE") {
      next.nextReview = undefined;
    } else {
      next.nextReview = calculateNextReview(next.lastReview, next.reviewCadence) || next.nextReview;
    }
  }
  return next;
}

function normalizeRelations(input: Partial<PersonalRecordRelations> | undefined): PersonalRecordRelations {
  return {
    north: sanitizeRecordIds(input?.north),
    south: sanitizeRecordIds(input?.south),
    east: sanitizeRecordIds(input?.east),
    west: sanitizeRecordIds(input?.west),
    stakeholders: sanitizeRecordIds(input?.stakeholders),
    stakeholdings: sanitizeRecordIds(input?.stakeholdings),
    internalSources: sanitizeRecordIds(input?.internalSources),
    related: sanitizeRecordIds(input?.related)
  };
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function removeValue(values: string[], value: string) {
  return values.filter((item) => item !== value);
}

function applyReciprocalRelations(records: PersonalRecord[], sourceId: string) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const source = byId.get(sourceId);
  if (!source) {
    return records;
  }

  for (const record of records) {
    if (record.id === sourceId) {
      continue;
    }
    record.relations.south = source.relations.north.includes(record.id)
      ? [...new Set([...record.relations.south, sourceId])]
      : removeValue(record.relations.south, sourceId);
    record.relations.north = source.relations.south.includes(record.id)
      ? [...new Set([...record.relations.north, sourceId])]
      : removeValue(record.relations.north, sourceId);
    record.relations.west = source.relations.east.includes(record.id)
      ? [...new Set([...record.relations.west, sourceId])]
      : removeValue(record.relations.west, sourceId);
    record.relations.east = source.relations.west.includes(record.id)
      ? [...new Set([...record.relations.east, sourceId])]
      : removeValue(record.relations.east, sourceId);
    record.relations.stakeholdings = source.relations.stakeholders.includes(record.id)
      ? [...new Set([...record.relations.stakeholdings, sourceId])]
      : removeValue(record.relations.stakeholdings, sourceId);
    if (source.relations.related.includes(record.id)) {
      addUnique(record.relations.related, sourceId);
    }
  }

  return records;
}

function normalizeRecord(raw: Partial<PersonalRecord> & Record<string, unknown>): PersonalRecord {
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const createdDate = new Date(createdAt);
  const createdMeta = raw.createdMeta || buildCreatedMeta(createdDate);
  const className = pickClass(typeof raw.className === "string" ? raw.className : typeof raw.kind === "string" ? raw.kind : undefined);
  const stage = pickStage(raw.stage as string | undefined);
  const relations = normalizeRelations(raw.relations);
  const body = typeof raw.body === "string" ? raw.body : "";
  const profile = normalizeContactProfile(raw.profile);
  const starred = raw.starred === true;
  const archivedAt = typeof raw.archivedAt === "string" && raw.archivedAt.trim() ? raw.archivedAt.trim() : undefined;
  const archiveReason = typeof raw.archiveReason === "string" && raw.archiveReason.trim()
    ? raw.archiveReason.trim().slice(0, 200)
    : undefined;
  const statusBeforeArchive = PERSONAL_RECORD_STATUSES.includes(raw.statusBeforeArchive as PersonalRecordStatus)
    ? (raw.statusBeforeArchive as PersonalRecordStatus)
    : undefined;
  const record: PersonalRecord = {
    id: typeof raw.id === "string" ? raw.id : `personal-${crypto.randomUUID()}`,
    domain: typeof raw.domain === "string" ? raw.domain : "notes-docs",
    title: typeof raw.title === "string" ? raw.title : "Untitled",
    className,
    knowledgeShape: pickKnowledgeShape(raw.knowledgeShape as string | undefined),
    privacy: pickPrivacy(raw.privacy as string | undefined),
    stage,
    status: pickStatus(raw.status as string | undefined),
    growth: "seed",
    body,
    url: typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : undefined,
    areas: sanitizeList(raw.areas as string[] | undefined),
    subjects: sanitizeSubjectsForClass(raw.subjects as string[] | undefined, className),
    projects: sanitizeList(raw.projects as string[] | undefined),
    intents: sanitizeList(raw.intents as string[] | undefined).filter((item) =>
      PERSONAL_RECORD_INTENTS.includes(item as PersonalRecordIntent)
    ) as PersonalRecordIntent[],
    externalSources: sanitizeList(raw.externalSources as string[] | undefined),
    relations,
    time: normalizeTime(raw.time, createdMeta, stage, className),
    profile,
    createdMeta,
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    ...(starred ? { starred: true } : {}),
    ...(archivedAt ? { archivedAt } : {}),
    ...(archivedAt && archiveReason ? { archiveReason } : {}),
    ...(archivedAt && statusBeforeArchive ? { statusBeforeArchive } : {})
  };
  record.growth = calculateGrowth(record);
  return record;
}

function resolveOrganizationReferences(
  profile: PersonalContactProfile | undefined,
  records: readonly PersonalRecord[],
  strict: boolean
): PersonalContactProfile | undefined {
  if (!profile) return profile;
  const organizations = records.filter((record) => record.className === "org");
  const activeOrganizations = organizations.filter((record) => !record.archivedAt);
  const byId = new Map(organizations.map((record) => [record.id, record]));
  const byName = new Map(activeOrganizations.map((record) => [record.title.trim().toLowerCase(), record]));
  const resolve = (organizationId: string | undefined, label: string | undefined, entryLabel: string) => {
    const linked = organizationId ? byId.get(organizationId) : label ? byName.get(label.trim().toLowerCase()) : undefined;
    if (strict && organizationId && !linked) throw new Error(`${entryLabel} must link to an existing Organization profile`);
    return linked;
  };
  const education = profile.education.map((entry, index) => {
    const linked = resolve(entry.organizationId, entry.institution, `Education entry ${index + 1}`);
    return linked ? { ...entry, institution: linked.title, organizationId: linked.id } : { ...entry };
  });
  const occupations = profile.occupations.map((entry, index) => {
    const linked = resolve(entry.organizationId, entry.employer, `Job ${index + 1}`);
    return linked ? { ...entry, employer: linked.title, organizationId: linked.id } : { ...entry };
  });
  const currentJobs = occupations.filter((entry) => entry.status === "current");
  const pastJobs = occupations.filter((entry) => entry.status === "past");
  return {
    ...profile,
    education,
    occupations,
    universityAffiliation: education[0]?.institution || profile.universityAffiliation,
    primaryOccupation: currentJobs[0]?.title || profile.primaryOccupation,
    primaryEmployer: currentJobs[0]?.employer || profile.primaryEmployer,
    secondaryOccupation: currentJobs[1]?.title || profile.secondaryOccupation,
    secondaryEmployer: currentJobs[1]?.employer || profile.secondaryEmployer,
    pastOccupation: pastJobs[0]?.title || profile.pastOccupation,
    pastEmployer: pastJobs[0]?.employer || profile.pastEmployer
  };
}

export async function readPersonalRecords(): Promise<PersonalRecord[]> {
  const existing = await readJsonFile<Array<Partial<PersonalRecord> & Record<string, unknown>>>(FILE_NAME, []);
  const records = existing
    .map(normalizeRecord)
    .filter((record) => isAllowedDomain(record.domain));
  return records
    .map((record) => ({ ...record, profile: resolveOrganizationReferences(record.profile, records, false) }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getRecordsForDomain(records: PersonalRecord[], domain: string): PersonalRecord[] {
  return records.filter((record) => record.domain === domain);
}

export async function createPersonalRecord(
  input: PersonalRecordInput,
  options: { requestedId?: string } = {}
): Promise<PersonalRecord[]> {
  const domain = input.domain.trim();
  if (!isAllowedDomain(domain)) {
    throw new Error("Invalid personal domain");
  }

  const title = input.title.trim();
  if (!title) {
    throw new Error("Title is required");
  }

  const url = normalizeOptionalHttpUrl(input.url || "");

  const now = new Date();
  const meta = buildCreatedMeta(now);
  const stage = pickStage(input.stage);
  const relations = normalizeRelations(input.relations);
  const profile = normalizeContactProfile(input.profile, true);
  const requestedId = options.requestedId?.trim();
  if (requestedId && !/^personal-[0-9a-f-]{36}$/i.test(requestedId)) {
    throw new Error("Invalid requested personal record id");
  }
  const className = pickClass(input.className || input.kind);
  const nextRecord: PersonalRecord = {
    id: requestedId || `personal-${crypto.randomUUID()}`,
    domain,
    title,
    className,
    knowledgeShape: pickKnowledgeShape(input.knowledgeShape),
    privacy: pickPrivacy(input.privacy),
    stage,
    status: pickStatus(input.status),
    growth: "seed",
    body: input.body?.trim() || "",
    url,
    areas: sanitizeList(input.areas),
    subjects: sanitizeSubjectsForClass(input.subjects, className),
    projects: sanitizeList(input.projects),
    intents: sanitizeList(input.intents).filter((item) =>
      PERSONAL_RECORD_INTENTS.includes(item as PersonalRecordIntent)
    ) as PersonalRecordIntent[],
    externalSources: sanitizeList(input.externalSources),
    ...(input.starred === true ? { starred: true } : {}),
    relations,
    time: normalizeTime(
      {
        ...input.time,
        dueDate: input.time?.dueDate || input.happensOn
      },
      meta,
      stage,
      className
    ),
    profile,
    createdMeta: meta,
    createdAt: meta.createdIso,
    updatedAt: meta.createdIso
  };
  nextRecord.growth = calculateGrowth(nextRecord);

  return mutateJsonFile<Array<Partial<PersonalRecord> & Record<string, unknown>>, PersonalRecord[]>(FILE_NAME, [], (stored) => {
    const existing = stored.map(normalizeRecord).filter((record) => isAllowedDomain(record.domain));
    if (existing.some((record) => record.id === nextRecord.id)) {
      return { value: stored, result: existing.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), changed: false };
    }
    nextRecord.profile = resolveOrganizationReferences(nextRecord.profile, existing, true);
    const next = applyReciprocalRelations([nextRecord, ...existing], nextRecord.id);
    return { value: next, result: next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  });
}

export async function updatePersonalRecord(
  id: string,
  patch: PersonalRecordPatch,
  options: { expectedUpdatedAt?: string } = {}
): Promise<PersonalRecord[]> {
  return mutateJsonFile<Array<Partial<PersonalRecord> & Record<string, unknown>>, PersonalRecord[]>(FILE_NAME, [], (stored) => {
  const existing = stored.map(normalizeRecord).filter((record) => isAllowedDomain(record.domain));
  const idx = existing.findIndex((record) => record.id === id);
  if (idx === -1) {
    throw new Error("Record not found");
  }

  const now = new Date().toISOString();
  const next = [...existing];
  const current = next[idx];
  if (options.expectedUpdatedAt && current.updatedAt !== options.expectedUpdatedAt) {
    throw new Error("This record changed after it was opened. Refresh before saving so newer work is not overwritten.");
  }
  if (current.archivedAt && patch.action !== "restore") {
    throw new Error("Restore this profile from Recently Deleted before editing it.");
  }
  if ((patch.action === "archive" || patch.action === "restore") && current.className !== "person" && current.className !== "org") {
    throw new Error("Only People profiles can use this lifecycle action.");
  }
  if (patch.action === "restore" && !current.archivedAt) {
    throw new Error("This profile is not in Recently Deleted.");
  }
  const time = mergeTimePatch(current.time, patch.time);
  const profilePatch = normalizeContactProfilePatch(patch.profile);
  for (const profileUrl of [profilePatch?.website, profilePatch?.linkedin]) {
    if (profileUrl) normalizeOptionalHttpUrl(profileUrl);
  }
  const url = typeof patch.url === "string" ? normalizeOptionalHttpUrl(patch.url) : current.url;
  if (patch.action === "review") {
    time.lastReview = now;
    time.nextReview = calculateNextReview(now, time.reviewCadence) || time.nextReview;
  }
  const archiveReason = typeof patch.archiveReason === "string" ? patch.archiveReason.trim().slice(0, 200) : "";
  if (patch.action === "archive" && !archiveReason) {
    throw new Error("A delete reason is required so this profile can be recovered safely.");
  }
  const nextStatus = patch.action === "archive"
    ? "inactive"
    : patch.action === "restore"
      ? current.statusBeforeArchive || "active"
      : PERSONAL_RECORD_STATUSES.includes(patch.status as PersonalRecordStatus)
        ? (patch.status as PersonalRecordStatus)
        : current.status;
  const nextStarred = typeof patch.starred === "boolean" ? patch.starred : current.starred === true;

  const nextProfile = resolveOrganizationReferences(mergeContactProfile(current.profile, profilePatch), existing, true);
  next[idx] = {
    ...current,
    title: typeof patch.title === "string" ? sanitizeTitle(patch.title) : current.title,
    body: typeof patch.body === "string" ? patch.body.trim() : current.body,
    url,
    areas: Array.isArray(patch.areas) ? sanitizeList(patch.areas) : current.areas,
    subjects: Array.isArray(patch.subjects)
      ? sanitizeSubjectsForClass(patch.subjects, current.className)
      : current.subjects,
    projects: Array.isArray(patch.projects) ? sanitizeList(patch.projects) : current.projects,
    externalSources: Array.isArray(patch.externalSources)
      ? sanitizeList(patch.externalSources)
      : current.externalSources,
    status: nextStatus,
    time,
    profile: nextProfile,
    updatedAt: now,
    ...(nextStarred ? { starred: true } : { starred: undefined }),
    ...(patch.action === "archive"
      ? {
          archivedAt: now,
          archiveReason,
          statusBeforeArchive: current.status
        }
      : patch.action === "restore"
        ? {
            archivedAt: undefined,
            archiveReason: undefined,
            statusBeforeArchive: undefined
          }
        : {})
  };

  return { value: next, result: next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  });
}
