"use client";

import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { MutationError, MutationErrorCode, MutationResult } from "../../native-objects/mutation-result";
import type {
  ReviewLegacyMapping,
  ReviewRun,
  ReviewRunCreateInput,
  ReviewRunPatch,
  ReviewRunView,
  ReviewsState
} from "./types";

type Fetcher = typeof fetch;
type ApiPayload = Record<string, unknown>;

export type ReviewRunCollection = {
  state: ReviewsState;
  items: ReviewRunView[];
};

export type ReviewRunMutationPayload = {
  item: ReviewRun;
  view: ReviewRunView;
};

export type LegacyReviewConversionPayload = ReviewRunMutationPayload & {
  mapping: ReviewLegacyMapping;
  created: boolean;
};

export type ReviewsRepository = {
  readState(options?: { includeArchived?: boolean }): Promise<MutationResult<ReviewRunCollection>>;
  getRun(id: string): Promise<MutationResult<ReviewRunMutationPayload>>;
  createRun(input: ReviewRunCreateInput): Promise<MutationResult<ReviewRunMutationPayload>>;
  convertLegacyRun(legacyReviewEntryId: string): Promise<MutationResult<LegacyReviewConversionPayload>>;
  patchRun(
    id: string,
    expectedUpdatedAt: string,
    patch: ReviewRunPatch
  ): Promise<MutationResult<ReviewRunMutationPayload>>;
};

export type ReviewsRepositoryOptions = {
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
    return failure("network", error instanceof Error ? error.message : "Unable to reach the Reviews repository");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failure(response.status >= 500 ? "server" : "unknown", "The Reviews repository returned an invalid response", { status: response.status });
  }
  if (!isRecord(payload)) {
    return failure(response.status >= 500 ? "server" : "unknown", "The Reviews repository returned an invalid response", { status: response.status });
  }
  if (!response.ok || payload.ok !== true) {
    return failure(
      errorCode(response.status, payload),
      typeof payload.error === "string" ? payload.error : "The Reviews request failed",
      { status: response.status, fieldErrors: fieldErrors(payload.fieldErrors) }
    );
  }
  return { ok: true, data: payload };
}

function isRun(value: unknown): value is ReviewRun {
  return Boolean(
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.checklist) &&
    Array.isArray(value.evidence) &&
    Array.isArray(value.decisions) &&
    Array.isArray(value.followUps) &&
    Array.isArray(value.carryForward)
  );
}

function isView(value: unknown): value is ReviewRunView {
  return Boolean(
    isRecord(value) &&
    isRun(value.run) &&
    Array.isArray(value.blockers) &&
    isRecord(value.counts) &&
    typeof value.canComplete === "boolean"
  );
}

function isState(value: unknown): value is ReviewsState {
  return Boolean(
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.runs) &&
    value.runs.every(isRun) &&
    Array.isArray(value.auditEvents) &&
    Array.isArray(value.legacyMappings)
  );
}

function isMapping(value: unknown): value is ReviewLegacyMapping {
  return Boolean(
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.legacyReviewEntryId === "string" &&
    typeof value.nativeReviewRunId === "string"
  );
}

function mutationPayload(payload: ApiPayload): ReviewRunMutationPayload | null {
  return isRun(payload.item) && isView(payload.view)
    ? { item: payload.item, view: payload.view }
    : null;
}

function withParams(endpoint: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query.toString()}`;
}

export function createReviewsRepository(options: ReviewsRepositoryOptions = {}): ReviewsRepository {
  const endpoint = options.endpoint || "/api/reviews/runs";
  const fetcher = options.fetcher || fetch;
  return {
    async readState(readOptions = {}) {
      const result = await requestPayload(
        fetcher,
        readOptions.includeArchived ? withParams(endpoint, { includeArchived: "1" }) : endpoint,
        { cache: "no-store" }
      );
      if (!result.ok) return result;
      if (!isState(result.data.state) || !Array.isArray(result.data.items) || !result.data.items.every(isView)) {
        return failure("unknown", "The Reviews response did not include a valid state");
      }
      return { ok: true, data: { state: result.data.state, items: result.data.items } };
    },

    async getRun(id) {
      const result = await requestPayload(fetcher, withParams(endpoint, { id }), { cache: "no-store" });
      if (!result.ok) return result;
      const payload = mutationPayload(result.data);
      return payload
        ? { ok: true, data: payload }
        : failure("unknown", "The Reviews response did not include the requested ReviewRun");
    },

    async createRun(input) {
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
            ...(typeof result.data.auditEventId === "string" ? { auditEventId: result.data.auditEventId } : {})
          }
        : failure("unknown", "The created ReviewRun was missing from the response");
    },

    async convertLegacyRun(legacyReviewEntryId) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ action: "convert_legacy", legacyReviewEntryId })
      });
      if (!result.ok) return result;
      const payload = mutationPayload(result.data);
      if (!payload || !isMapping(result.data.mapping) || typeof result.data.created !== "boolean") {
        return failure("unknown", "The converted ReviewRun was missing from the response");
      }
      return {
        ok: true,
        data: { ...payload, mapping: result.data.mapping, created: result.data.created },
        ...(typeof result.data.auditEventId === "string" ? { auditEventId: result.data.auditEventId } : {})
      };
    },

    async patchRun(id, expectedUpdatedAt, patch) {
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
            ...(typeof result.data.auditEventId === "string" ? { auditEventId: result.data.auditEventId } : {})
          }
        : failure("unknown", "The updated ReviewRun was missing from the response");
    }
  };
}

