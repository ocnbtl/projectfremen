import { readJsonFile, writeJsonFile } from "./file-store";
import { getPersonalSystemDomain, PERSONAL_SYSTEM_DOMAINS } from "./personal-systems";

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
export type PersonalRecordPriority = "P1" | "P2" | "P3";
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

export type PersonalRecord = {
  id: string;
  domain: string;
  title: string;
  className: PersonalRecordClass;
  knowledgeShape: PersonalRecordKnowledgeShape;
  privacy: PersonalRecordPrivacy;
  stage: PersonalRecordStage;
  status: PersonalRecordStatus;
  priority: PersonalRecordPriority;
  growth: PersonalRecordGrowth;
  body: string;
  url?: string;
  tags: string[];
  areas: string[];
  subjects: string[];
  projects: string[];
  intents: PersonalRecordIntent[];
  externalSources: string[];
  relatedDomains: string[];
  relations: PersonalRecordRelations;
  time: PersonalRecordTime;
  createdMeta: PersonalRecordCreatedMeta;
  createdAt: string;
  updatedAt: string;
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
  priority?: string;
  body?: string;
  happensOn?: string;
  url?: string;
  tags?: string[];
  areas?: string[];
  subjects?: string[];
  projects?: string[];
  intents?: string[];
  externalSources?: string[];
  relatedDomains?: string[];
  relations?: Partial<PersonalRecordRelations>;
  time?: PersonalRecordTime;
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
export const PERSONAL_RECORD_PRIORITIES: PersonalRecordPriority[] = ["P1", "P2", "P3"];
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

function sanitizeRecordIds(values: string[] | undefined): string[] {
  return sanitizeList(values, 80);
}

function sanitizeRelatedDomains(primaryDomain: string, values: string[] | undefined): string[] {
  return sanitizeList(values)
    .filter((slug) => slug !== primaryDomain && isAllowedDomain(slug))
    .slice(0, PERSONAL_SYSTEM_DOMAINS.length - 1);
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

function pickPriority(value: string | undefined): PersonalRecordPriority {
  return PERSONAL_RECORD_PRIORITIES.includes(value as PersonalRecordPriority)
    ? (value as PersonalRecordPriority)
    : "P2";
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

function normalizeTime(input: PersonalRecordTime | undefined, meta: PersonalRecordCreatedMeta, stage: PersonalRecordStage): PersonalRecordTime {
  const reviewCadence = input?.reviewCadence?.trim().toUpperCase() || undefined;
  const lastReview = input?.lastReview?.trim() || meta.createdIso;
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
  const record: PersonalRecord = {
    id: typeof raw.id === "string" ? raw.id : `personal-${crypto.randomUUID()}`,
    domain: typeof raw.domain === "string" ? raw.domain : "notes-docs",
    title: typeof raw.title === "string" ? raw.title : "Untitled",
    className,
    knowledgeShape: pickKnowledgeShape(raw.knowledgeShape as string | undefined),
    privacy: pickPrivacy(raw.privacy as string | undefined),
    stage,
    status: pickStatus(raw.status as string | undefined),
    priority: pickPriority(raw.priority as string | undefined),
    growth: "seed",
    body,
    url: typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : undefined,
    tags: sanitizeList(raw.tags as string[] | undefined),
    areas: sanitizeList(raw.areas as string[] | undefined),
    subjects: sanitizeList(raw.subjects as string[] | undefined),
    projects: sanitizeList(raw.projects as string[] | undefined),
    intents: sanitizeList(raw.intents as string[] | undefined).filter((item) =>
      PERSONAL_RECORD_INTENTS.includes(item as PersonalRecordIntent)
    ) as PersonalRecordIntent[],
    externalSources: sanitizeList(raw.externalSources as string[] | undefined),
    relatedDomains: sanitizeRelatedDomains(typeof raw.domain === "string" ? raw.domain : "notes-docs", raw.relatedDomains as string[] | undefined),
    relations,
    time: normalizeTime(raw.time, createdMeta, stage),
    createdMeta,
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt
  };
  record.growth = calculateGrowth(record);
  return record;
}

export async function readPersonalRecords(): Promise<PersonalRecord[]> {
  const existing = await readJsonFile<Array<Partial<PersonalRecord> & Record<string, unknown>>>(FILE_NAME, []);
  return existing
    .map(normalizeRecord)
    .filter((record) => isAllowedDomain(record.domain))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getRecordsForDomain(records: PersonalRecord[], domain: string): PersonalRecord[] {
  return records.filter((record) => record.domain === domain || record.relatedDomains.includes(domain));
}

export async function createPersonalRecord(input: PersonalRecordInput): Promise<PersonalRecord[]> {
  const domain = input.domain.trim();
  if (!isAllowedDomain(domain)) {
    throw new Error("Invalid personal domain");
  }

  const title = input.title.trim();
  if (!title) {
    throw new Error("Title is required");
  }

  const url = input.url?.trim() || "";
  if (url && !/^https?:\/\//i.test(url)) {
    throw new Error("Link must start with http:// or https://");
  }

  const now = new Date();
  const meta = buildCreatedMeta(now);
  const stage = pickStage(input.stage);
  const relations = normalizeRelations(input.relations);
  const nextRecord: PersonalRecord = {
    id: `personal-${crypto.randomUUID()}`,
    domain,
    title,
    className: pickClass(input.className || input.kind),
    knowledgeShape: pickKnowledgeShape(input.knowledgeShape),
    privacy: pickPrivacy(input.privacy),
    stage,
    status: pickStatus(input.status),
    priority: pickPriority(input.priority),
    growth: "seed",
    body: input.body?.trim() || "",
    url: url || undefined,
    tags: sanitizeList(input.tags),
    areas: sanitizeList(input.areas),
    subjects: sanitizeList(input.subjects),
    projects: sanitizeList(input.projects),
    intents: sanitizeList(input.intents).filter((item) =>
      PERSONAL_RECORD_INTENTS.includes(item as PersonalRecordIntent)
    ) as PersonalRecordIntent[],
    externalSources: sanitizeList(input.externalSources),
    relatedDomains: sanitizeRelatedDomains(domain, input.relatedDomains),
    relations,
    time: normalizeTime(
      {
        ...input.time,
        dueDate: input.time?.dueDate || input.happensOn
      },
      meta,
      stage
    ),
    createdMeta: meta,
    createdAt: meta.createdIso,
    updatedAt: meta.createdIso
  };
  nextRecord.growth = calculateGrowth(nextRecord);

  const next = applyReciprocalRelations([nextRecord, ...(await readPersonalRecords())], nextRecord.id);
  await writeJsonFile(FILE_NAME, next);
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updatePersonalRecord(
  id: string,
  patch: Partial<Pick<PersonalRecord, "status" | "priority">> & { action?: "review" }
): Promise<PersonalRecord[]> {
  const existing = await readPersonalRecords();
  const idx = existing.findIndex((record) => record.id === id);
  if (idx === -1) {
    throw new Error("Record not found");
  }

  const now = new Date().toISOString();
  const next = [...existing];
  const current = next[idx];
  const time = { ...current.time };
  if (patch.action === "review") {
    time.lastReview = now;
    time.nextReview = calculateNextReview(now, time.reviewCadence) || time.nextReview;
  }

  next[idx] = {
    ...current,
    status: PERSONAL_RECORD_STATUSES.includes(patch.status as PersonalRecordStatus)
      ? (patch.status as PersonalRecordStatus)
      : current.status,
    priority: PERSONAL_RECORD_PRIORITIES.includes(patch.priority as PersonalRecordPriority)
      ? (patch.priority as PersonalRecordPriority)
      : current.priority,
    time,
    updatedAt: now
  };

  await writeJsonFile(FILE_NAME, next);
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
