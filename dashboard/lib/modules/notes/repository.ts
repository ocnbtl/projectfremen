"use client";

import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { MutationErrorCode } from "../../native-objects/mutation-result";
import type { PersonalRecord } from "../../personal-records-store";
import {
  legacyPersonalRecordsToNotes,
  noteCreateInputToLegacy,
  noteUpdateInputToLegacy
} from "./legacy-adapter";
import type {
  NoteCreateInput,
  NoteMutationError,
  NoteMutationResult,
  NoteRecord,
  NoteUpdateInput
} from "./types";

type Fetcher = typeof fetch;

type PersonalRecordsResponse = {
  ok?: unknown;
  items?: unknown;
  error?: unknown;
};

export type NotesRepository = {
  list(): Promise<NoteMutationResult<NoteRecord[]>>;
  get(id: string): Promise<NoteMutationResult<NoteRecord>>;
  create(input: NoteCreateInput): Promise<NoteMutationResult<NoteRecord>>;
  update(id: string, input: NoteUpdateInput): Promise<NoteMutationResult<NoteRecord>>;
};

export type NotesRepositoryOptions = {
  endpoint?: string;
  fetcher?: Fetcher;
  now?: () => Date;
};

function errorCode(status: number): MutationErrorCode {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "unknown";
}

function failure(
  code: MutationErrorCode,
  message: string,
  options: { status?: number; retryable?: boolean } = {}
): NoteMutationResult<never> {
  const error: NoteMutationError = {
    code,
    message,
    retryable: options.retryable ?? (code === "network" || code === "server"),
    ...(options.status ? { details: { status: options.status } } : {})
  };
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPersonalRecord(value: unknown): value is PersonalRecord {
  if (!isRecord(value)) return false;
  const relations = value.relations;
  const time = value.time;
  const createdMeta = value.createdMeta;
  return (
    typeof value.id === "string" &&
    typeof value.domain === "string" &&
    typeof value.title === "string" &&
    typeof value.className === "string" &&
    typeof value.status === "string" &&
    typeof value.body === "string" &&
    Array.isArray(value.areas) &&
    Array.isArray(value.subjects) &&
    Array.isArray(value.projects) &&
    Array.isArray(value.intents) &&
    Array.isArray(value.externalSources) &&
    isRecord(relations) &&
    Array.isArray(relations.north) &&
    Array.isArray(relations.south) &&
    Array.isArray(relations.east) &&
    Array.isArray(relations.west) &&
    Array.isArray(relations.stakeholders) &&
    Array.isArray(relations.stakeholdings) &&
    Array.isArray(relations.internalSources) &&
    Array.isArray(relations.related) &&
    isRecord(time) &&
    isRecord(createdMeta) &&
    typeof createdMeta.uid === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

async function requestRecords(
  fetcher: Fetcher,
  endpoint: string,
  init?: RequestInit
): Promise<NoteMutationResult<PersonalRecord[]>> {
  let response: Response;
  try {
    response = await fetcher(endpoint, init);
  } catch (error) {
    return failure(
      "network",
      error instanceof Error ? error.message : "Unable to reach the Notes repository",
      { retryable: true }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Notes repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!isRecord(rawPayload)) {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Notes repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  const payload = rawPayload as PersonalRecordsResponse;
  if (!response.ok || payload.ok !== true) {
    return failure(
      errorCode(response.status),
      typeof payload.error === "string" ? payload.error : "The Notes request failed",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!Array.isArray(payload.items) || !payload.items.every(isPersonalRecord)) {
    return failure("unknown", "The Notes repository response did not include valid records", {
      status: response.status
    });
  }

  return { ok: true, data: payload.items };
}

function domainEndpoint(endpoint: string): string {
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}domain=notes-docs`;
}

export function createNotesRepository(options: NotesRepositoryOptions = {}): NotesRepository {
  const endpoint = options.endpoint || "/api/personal/records";
  const fetcher = options.fetcher || fetch;
  const now = options.now || (() => new Date());
  const toNotes = (records: PersonalRecord[]) =>
    legacyPersonalRecordsToNotes(records, { now: now() });

  return {
    async list() {
      const result = await requestRecords(fetcher, domainEndpoint(endpoint), { cache: "no-store" });
      return result.ok ? { ok: true, data: toNotes(result.data) } : result;
    },

    async get(id) {
      const result = await requestRecords(fetcher, domainEndpoint(endpoint), { cache: "no-store" });
      if (!result.ok) return result;
      const note = toNotes(result.data).find((item) => item.id === id);
      return note
        ? { ok: true, data: note }
        : failure("not_found", "The requested Note was not found", { status: 404 });
    },

    async create(input) {
      const result = await requestRecords(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify(noteCreateInputToLegacy(input))
      });
      if (!result.ok) return result;

      const notes = toNotes(result.data);
      const normalizedTitle = input.title.trim();
      const normalizedBody = input.body?.trim() || "";
      const created =
        notes.find((note) => note.title === normalizedTitle && note.body === normalizedBody) ||
        notes[0];
      return created
        ? { ok: true, data: created }
        : failure("unknown", "The created Note was missing from the response");
    },

    async update(id, input) {
      const result = await requestRecords(fetcher, endpoint, {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ id, ...noteUpdateInputToLegacy(input) })
      });
      if (!result.ok) return result;

      const updated = toNotes(result.data).find((note) => note.id === id);
      return updated
        ? { ok: true, data: updated }
        : failure("not_found", "The updated Note was missing from the response", { status: 404 });
    }
  };
}

