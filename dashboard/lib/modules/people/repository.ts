"use client";

import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { PersonalRecord } from "../../personal-records-store";
import type { MutationErrorCode } from "../../native-objects/mutation-result";
import {
  legacyPersonalRecordsToPeople,
  peopleCreateInputToLegacy,
  peopleUpdateInputToLegacy
} from "./legacy-adapter";
import type {
  PeopleCreateInput,
  PeopleMutationError,
  PeopleMutationResult,
  PeopleRecord,
  PeopleUpdateInput
} from "./types";

type Fetcher = typeof fetch;

type PersonalRecordsResponse = {
  ok?: unknown;
  items?: unknown;
  error?: unknown;
};

export type PeopleRepository = {
  list(): Promise<PeopleMutationResult<PeopleRecord[]>>;
  create(input: PeopleCreateInput): Promise<PeopleMutationResult<PeopleRecord>>;
  update(id: string, input: PeopleUpdateInput): Promise<PeopleMutationResult<PeopleRecord>>;
};

export type PeopleRepositoryOptions = {
  endpoint?: string;
  fetcher?: Fetcher;
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
): PeopleMutationResult<never> {
  const error: PeopleMutationError = {
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
  return (
    typeof value.id === "string" &&
    typeof value.domain === "string" &&
    typeof value.title === "string" &&
    (value.className === "person" || value.className === "org" || typeof value.className === "string") &&
    Array.isArray(value.areas) &&
    Array.isArray(value.subjects) &&
    Array.isArray(value.projects) &&
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
    isRecord(value.time) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

async function requestRecords(
  fetcher: Fetcher,
  endpoint: string,
  init?: RequestInit
): Promise<PeopleMutationResult<PersonalRecord[]>> {
  let response: Response;
  try {
    response = await fetcher(endpoint, init);
  } catch (error) {
    return failure(
      "network",
      error instanceof Error ? error.message : "Unable to reach the People repository",
      { retryable: true }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The People repository returned an invalid response",
      {
        status: response.status,
        retryable: response.status >= 500
      }
    );
  }

  if (!isRecord(rawPayload)) {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The People repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }
  const payload = rawPayload as PersonalRecordsResponse;

  if (!response.ok || payload.ok !== true) {
    const message = typeof payload.error === "string" ? payload.error : "The People request failed";
    return failure(errorCode(response.status), message, {
      status: response.status,
      retryable: response.status >= 500
    });
  }

  if (!Array.isArray(payload.items) || !payload.items.every(isPersonalRecord)) {
    return failure("unknown", "The People repository response did not include valid records", {
      status: response.status
    });
  }

  return { ok: true, data: payload.items };
}

export function createPeopleRepository(options: PeopleRepositoryOptions = {}): PeopleRepository {
  const endpoint = options.endpoint || "/api/personal/records";
  const fetcher = options.fetcher || fetch;

  return {
    async list() {
      const result = await requestRecords(fetcher, endpoint, { cache: "no-store" });
      return result.ok
        ? { ok: true, data: legacyPersonalRecordsToPeople(result.data) }
        : result;
    },

    async create(input) {
      const result = await requestRecords(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify(peopleCreateInputToLegacy(input))
      });
      if (!result.ok) return result;

      const people = legacyPersonalRecordsToPeople(result.data);
      const created = people.find((person) => person.fullName === input.fullName) || people[0];
      return created
        ? { ok: true, data: created }
        : failure("unknown", "The created person was missing from the response");
    },

    async update(id, input) {
      const result = await requestRecords(fetcher, endpoint, {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ id, ...peopleUpdateInputToLegacy(input) })
      });
      if (!result.ok) return result;

      const updated = legacyPersonalRecordsToPeople(result.data).find((person) => person.id === id);
      return updated
        ? { ok: true, data: updated }
        : failure("not_found", "The updated person was missing from the response", { status: 404 });
    }
  };
}
