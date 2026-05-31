import { readJsonFile, writeJsonFile } from "./file-store";
import { getPersonalSystemDomain, PERSONAL_SYSTEM_DOMAINS } from "./personal-systems";

export type PersonalRecordKind = "note" | "task" | "event" | "file" | "decision" | "metric";
export type PersonalRecordStatus = "active" | "waiting" | "done" | "archived";
export type PersonalRecordPriority = "P1" | "P2" | "P3";

export type PersonalRecord = {
  id: string;
  domain: string;
  title: string;
  kind: PersonalRecordKind;
  status: PersonalRecordStatus;
  priority: PersonalRecordPriority;
  body: string;
  happensOn?: string;
  url?: string;
  tags: string[];
  relatedDomains: string[];
  createdAt: string;
  updatedAt: string;
};

export type PersonalRecordInput = {
  domain: string;
  title: string;
  kind?: string;
  status?: string;
  priority?: string;
  body?: string;
  happensOn?: string;
  url?: string;
  tags?: string[];
  relatedDomains?: string[];
};

const FILE_NAME = "personal-records.json";
const KINDS: PersonalRecordKind[] = ["note", "task", "event", "file", "decision", "metric"];
const STATUSES: PersonalRecordStatus[] = ["active", "waiting", "done", "archived"];
const PRIORITIES: PersonalRecordPriority[] = ["P1", "P2", "P3"];

function isAllowedDomain(slug: string) {
  return Boolean(getPersonalSystemDomain(slug));
}

function sanitizeList(values: string[] | undefined): string[] {
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
  return next.slice(0, 12);
}

function sanitizeRelatedDomains(primaryDomain: string, values: string[] | undefined): string[] {
  return sanitizeList(values)
    .filter((slug) => slug !== primaryDomain && isAllowedDomain(slug))
    .slice(0, PERSONAL_SYSTEM_DOMAINS.length - 1);
}

function normalizeRecord(record: PersonalRecord): PersonalRecord {
  return {
    ...record,
    tags: sanitizeList(record.tags),
    relatedDomains: sanitizeRelatedDomains(record.domain, record.relatedDomains)
  };
}

export async function readPersonalRecords(): Promise<PersonalRecord[]> {
  const existing = await readJsonFile<PersonalRecord[]>(FILE_NAME, []);
  return existing
    .filter((record) => isAllowedDomain(record.domain))
    .map(normalizeRecord)
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

  const kind = KINDS.includes(input.kind as PersonalRecordKind)
    ? (input.kind as PersonalRecordKind)
    : "note";
  const status = STATUSES.includes(input.status as PersonalRecordStatus)
    ? (input.status as PersonalRecordStatus)
    : "active";
  const priority = PRIORITIES.includes(input.priority as PersonalRecordPriority)
    ? (input.priority as PersonalRecordPriority)
    : "P2";
  const url = input.url?.trim() || "";
  if (url && !/^https?:\/\//i.test(url)) {
    throw new Error("Link must start with http:// or https://");
  }

  const now = new Date().toISOString();
  const next = [
    {
      id: `personal-${crypto.randomUUID()}`,
      domain,
      title,
      kind,
      status,
      priority,
      body: input.body?.trim() || "",
      happensOn: input.happensOn?.trim() || undefined,
      url: url || undefined,
      tags: sanitizeList(input.tags),
      relatedDomains: sanitizeRelatedDomains(domain, input.relatedDomains),
      createdAt: now,
      updatedAt: now
    },
    ...(await readPersonalRecords())
  ];

  await writeJsonFile(FILE_NAME, next);
  return next;
}

export async function updatePersonalRecord(
  id: string,
  patch: Partial<Pick<PersonalRecord, "status" | "priority">>
): Promise<PersonalRecord[]> {
  const existing = await readPersonalRecords();
  const idx = existing.findIndex((record) => record.id === id);
  if (idx === -1) {
    throw new Error("Record not found");
  }

  const next = [...existing];
  next[idx] = {
    ...next[idx],
    status: STATUSES.includes(patch.status as PersonalRecordStatus)
      ? (patch.status as PersonalRecordStatus)
      : next[idx].status,
    priority: PRIORITIES.includes(patch.priority as PersonalRecordPriority)
      ? (patch.priority as PersonalRecordPriority)
      : next[idx].priority,
    updatedAt: new Date().toISOString()
  };

  await writeJsonFile(FILE_NAME, next);
  return next;
}
