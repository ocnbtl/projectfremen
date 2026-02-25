import { readJsonFile, writeJsonFile } from "./file-store";
import { formatLocalIsoDate, getNextFirstSunday, getNextSunday } from "./review-schedule";
import type { ReviewEntry, ReviewKind } from "./types";

const FILE_NAME = "reviews.json";

type ReviewsState = {
  items: ReviewEntry[];
};

type LegacyReviewEntry = {
  id: string;
  kind: ReviewKind;
  scheduledFor: string;
  createdAt: string;
  updatedAt?: string;
  values?: Record<string, string>;
};

const EMPTY_STATE: ReviewsState = {
  items: []
};

function normalizeScheduledFor(kind: ReviewKind, scheduledFor?: string): string {
  if (scheduledFor && /^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    return scheduledFor;
  }

  const next = kind === "weekly" ? getNextSunday() : getNextFirstSunday();
  return formatLocalIsoDate(next);
}

function normalizeEntry(entry: LegacyReviewEntry): ReviewEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    scheduledFor: entry.scheduledFor,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt || entry.createdAt,
    values: entry.values || {}
  };
}

async function readState(): Promise<ReviewsState> {
  const raw = await readJsonFile<{ items?: LegacyReviewEntry[] }>(FILE_NAME, EMPTY_STATE);
  const normalizedItems = (raw.items || []).map(normalizeEntry);

  return { items: normalizedItems };
}

function sortEntries(items: ReviewEntry[]): ReviewEntry[] {
  return [...items].sort((a, b) => {
    if (a.scheduledFor !== b.scheduledFor) {
      return b.scheduledFor.localeCompare(a.scheduledFor);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function readReviews(kind?: ReviewKind): Promise<ReviewEntry[]> {
  const state = await readState();
  const items = kind ? state.items.filter((item) => item.kind === kind) : state.items;
  return sortEntries(items);
}

export async function readReviewEntry(id: string, kind?: ReviewKind): Promise<ReviewEntry | null> {
  const state = await readState();
  const item = state.items.find((entry) => entry.id === id && (!kind || entry.kind === kind));
  return item || null;
}

export async function createReviewEntry(input: {
  kind: ReviewKind;
  scheduledFor?: string;
}): Promise<{ item: ReviewEntry; items: ReviewEntry[] }> {
  const state = await readState();
  const now = new Date().toISOString();

  const newEntry: ReviewEntry = {
    id: `review-${crypto.randomUUID()}`,
    kind: input.kind,
    scheduledFor: normalizeScheduledFor(input.kind, input.scheduledFor),
    createdAt: now,
    updatedAt: now,
    values: {}
  };

  const nextState: ReviewsState = {
    items: [newEntry, ...state.items]
  };

  await writeJsonFile(FILE_NAME, nextState);
  return {
    item: newEntry,
    items: await readReviews(input.kind)
  };
}

export async function updateReviewEntry(input: {
  id: string;
  kind: ReviewKind;
  scheduledFor?: string;
  values?: Record<string, string>;
}): Promise<{ item: ReviewEntry | null; items: ReviewEntry[] }> {
  const state = await readState();
  const idx = state.items.findIndex((entry) => entry.id === input.id && entry.kind === input.kind);

  if (idx < 0) {
    return { item: null, items: await readReviews(input.kind) };
  }

  const current = state.items[idx];
  const updated: ReviewEntry = {
    ...current,
    scheduledFor: normalizeScheduledFor(input.kind, input.scheduledFor || current.scheduledFor),
    values: input.values ? { ...input.values } : current.values,
    updatedAt: new Date().toISOString()
  };

  const nextState: ReviewsState = {
    items: [...state.items]
  };
  nextState.items[idx] = updated;

  await writeJsonFile(FILE_NAME, nextState);
  return {
    item: updated,
    items: await readReviews(input.kind)
  };
}

export async function deleteReviewEntry(input: {
  id: string;
  kind: ReviewKind;
}): Promise<{ deleted: boolean; items: ReviewEntry[] }> {
  const state = await readState();
  const nextItems = state.items.filter((entry) => !(entry.id === input.id && entry.kind === input.kind));
  const deleted = nextItems.length !== state.items.length;

  if (deleted) {
    await writeJsonFile(FILE_NAME, { items: nextItems });
  }

  return {
    deleted,
    items: await readReviews(input.kind)
  };
}
