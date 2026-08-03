"use client";

import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { MutationError, MutationErrorCode, MutationResult } from "../../native-objects/mutation-result";
import {
  NOTE_LINKS_SCHEMA_VERSION,
  type NoteLink,
  type NoteLinkCreateInput,
  type NoteLinkMutationPayload,
  type NoteLinkPatch,
  type NoteLinksState
} from "./links-types";

type Fetcher = typeof fetch;
type ApiPayload = Record<string, unknown>;

export type NoteLinksRepository = {
  readState(): Promise<MutationResult<NoteLinksState>>;
  create(input: NoteLinkCreateInput): Promise<MutationResult<NoteLinkMutationPayload>>;
  patch(
    id: string,
    expectedUpdatedAt: string,
    patch: NoteLinkPatch
  ): Promise<MutationResult<NoteLinkMutationPayload>>;
};

export type NoteLinksRepositoryOptions = {
  endpoint?: string;
  fetcher?: Fetcher;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorCode(status: number, payload: ApiPayload): MutationErrorCode {
  if (payload.code === "stale") return "stale";
  if (payload.code === "conflict") return "conflict";
  if (payload.code === "validation") return "validation";
  if (payload.code === "not_found") return "not_found";
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "unknown";
}

function fieldErrors(value: unknown): Readonly<Record<string, readonly string[]>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string[]] =>
    Array.isArray(entry[1]) && entry[1].every((message) => typeof message === "string")
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function failure<Data = never>(
  code: MutationErrorCode,
  message: string,
  options: { status?: number; fieldErrors?: Readonly<Record<string, readonly string[]>> } = {}
): MutationResult<Data> {
  const error: MutationError = {
    code,
    message,
    retryable: code === "network" || code === "server",
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.status ? { details: { status: options.status } } : {})
  };
  return { ok: false, error };
}

async function requestPayload(
  fetcher: Fetcher,
  url: string,
  init?: RequestInit
): Promise<MutationResult<ApiPayload>> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    return failure(
      "network",
      error instanceof Error ? error.message : "Unable to reach the NoteLinks repository"
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The NoteLinks repository returned an invalid response",
      { status: response.status }
    );
  }
  if (!isRecord(payload)) {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The NoteLinks repository returned an invalid response",
      { status: response.status }
    );
  }
  if (!response.ok || payload.ok !== true) {
    return failure(
      errorCode(response.status, payload),
      typeof payload.error === "string" ? payload.error : "The NoteLinks request failed",
      { status: response.status, fieldErrors: fieldErrors(payload.fieldErrors) }
    );
  }
  return { ok: true, data: payload };
}

function isNativeRef(value: unknown): boolean {
  return Boolean(
    isRecord(value) &&
    typeof value.module === "string" &&
    typeof value.objectType === "string" &&
    typeof value.objectId === "string" &&
    typeof value.label === "string" &&
    typeof value.route === "string"
  );
}

function isLink(value: unknown): value is NoteLink {
  return Boolean(
    isRecord(value) &&
    typeof value.id === "string" &&
    isNativeRef(value.noteRef) &&
    isNativeRef(value.targetRef) &&
    typeof value.relationship === "string" &&
    typeof value.state === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isState(value: unknown): value is NoteLinksState {
  return Boolean(
    isRecord(value) &&
    value.schemaVersion === NOTE_LINKS_SCHEMA_VERSION &&
    Array.isArray(value.links) &&
    value.links.every(isLink) &&
    Array.isArray(value.auditEvents)
  );
}

function mutationPayload(payload: ApiPayload): NoteLinkMutationPayload | null {
  if (!isLink(payload.item) || !isState(payload.state)) return null;
  return {
    item: payload.item,
    state: payload.state,
    ...(typeof payload.created === "boolean" ? { created: payload.created } : {})
  };
}

export function createNoteLinksRepository(
  options: NoteLinksRepositoryOptions = {}
): NoteLinksRepository {
  const endpoint = options.endpoint || "/api/notes/links";
  const fetcher = options.fetcher || fetch;
  return {
    async readState() {
      const result = await requestPayload(fetcher, endpoint, { cache: "no-store" });
      if (!result.ok) return result;
      return isState(result.data.state)
        ? { ok: true, data: result.data.state }
        : failure("unknown", "The NoteLinks response did not include a valid state");
    },

    async create(input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ input })
      });
      if (!result.ok) return result;
      const payload = mutationPayload(result.data);
      return payload
        ? {
            ok: true,
            data: payload,
            ...(typeof result.data.auditEventId === "string"
              ? { auditEventId: result.data.auditEventId }
              : {})
          }
        : failure("unknown", "The created NoteLink was missing from the response");
    },

    async patch(id, expectedUpdatedAt, patch) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ id, expectedUpdatedAt, patch })
      });
      if (!result.ok) return result;
      const payload = mutationPayload(result.data);
      return payload
        ? {
            ok: true,
            data: payload,
            ...(typeof result.data.auditEventId === "string"
              ? { auditEventId: result.data.auditEventId }
              : {})
          }
        : failure("unknown", "The updated NoteLink was missing from the response");
    }
  };
}
