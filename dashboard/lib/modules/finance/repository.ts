"use client";

import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import { mirrorFinanceRecord } from "../../local-first/domain-mirror";
import type { MutationError, MutationErrorCode, MutationResult } from "../../native-objects/mutation-result";
import { FINANCE_SCHEMA_VERSION, type FinanceImportPreview, type FinanceState } from "./native-types";

type Fetcher = typeof fetch;
type ApiPayload = Record<string, unknown>;

export type FinanceMutationPayload = {
  state: FinanceState;
  item: Record<string, unknown>;
  created?: boolean;
};

export type FinanceRepository = {
  readState(): Promise<MutationResult<FinanceState>>;
  create(input: Record<string, unknown>, idempotencyKey: string): Promise<MutationResult<FinanceMutationPayload>>;
  patch(input: Record<string, unknown>): Promise<MutationResult<FinanceMutationPayload>>;
  previewImport(input: Record<string, unknown>): Promise<MutationResult<FinanceImportPreview>>;
  confirmImport(input: Record<string, unknown>, idempotencyKey: string): Promise<MutationResult<FinanceMutationPayload>>;
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

async function requestPayload(fetcher: Fetcher, url: string, init?: RequestInit): Promise<MutationResult<ApiPayload>> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    return failure("network", error instanceof Error ? error.message : "Unable to reach Finance");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failure(response.status >= 500 ? "server" : "unknown", "Finance returned an invalid response", { status: response.status });
  }
  if (!isRecord(payload)) return failure("unknown", "Finance returned an invalid response", { status: response.status });
  if (!response.ok || payload.ok !== true) {
    return failure(
      errorCode(response.status, payload),
      typeof payload.error === "string" ? payload.error : "Finance request failed",
      { status: response.status, fieldErrors: fieldErrors(payload.fieldErrors) }
    );
  }
  return { ok: true, data: payload };
}

function isState(value: unknown): value is FinanceState {
  return Boolean(
    isRecord(value) && value.schemaVersion === FINANCE_SCHEMA_VERSION &&
    Array.isArray(value.accounts) && Array.isArray(value.transactions) && Array.isArray(value.transfers) &&
    Array.isArray(value.savingsMovements) && Array.isArray(value.bills) && Array.isArray(value.budgets) &&
    Array.isArray(value.closePeriods) && Array.isArray(value.rules) && Array.isArray(value.importPreviews) && Array.isArray(value.importBatches) &&
    Array.isArray(value.auditEvents)
  );
}

function mutationPayload(payload: ApiPayload): FinanceMutationPayload | null {
  if (!isState(payload.state) || !isRecord(payload.item)) return null;
  return {
    state: payload.state,
    item: payload.item,
    ...(typeof payload.created === "boolean" ? { created: payload.created } : {})
  };
}

function mutationHeaders(idempotencyKey?: string): Record<string, string> {
  return {
    ...buildJsonHeadersWithCsrf(),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
  };
}

export function createFinanceRepository(options: { endpoint?: string; fetcher?: Fetcher } = {}): FinanceRepository {
  const endpoint = options.endpoint || "/api/finance";
  const fetcher = options.fetcher || fetch;
  const createRequest = async (
    operation: "create" | "confirm_import",
    input: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<MutationResult<FinanceMutationPayload>> => {
    const result = await requestPayload(fetcher, endpoint, {
      method: "POST",
      headers: mutationHeaders(idempotencyKey),
      body: JSON.stringify({ operation, input })
    });
    if (!result.ok) return result;
    const payload = mutationPayload(result.data);
    if (payload) await mirrorFinanceRecord(operation === "confirm_import" ? "import_batch" : input.kind, payload.item);
    return payload
      ? { ok: true, data: payload, ...(typeof result.data.auditEventId === "string" ? { auditEventId: result.data.auditEventId } : {}) }
      : failure("unknown", "Finance mutation response did not include valid state");
  };
  return {
    async readState() {
      const result = await requestPayload(fetcher, endpoint, { cache: "no-store" });
      if (!result.ok) return result;
      return isState(result.data.state)
        ? { ok: true, data: result.data.state }
        : failure("unknown", "Finance response did not include valid state");
    },
    async create(input, idempotencyKey) {
      return createRequest("create", input, idempotencyKey);
    },
    async patch(input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "PATCH",
        headers: mutationHeaders(),
        body: JSON.stringify({ input })
      });
      if (!result.ok) return result;
      const payload = mutationPayload(result.data);
      if (payload) await mirrorFinanceRecord(input.kind, payload.item);
      return payload
        ? { ok: true, data: payload, ...(typeof result.data.auditEventId === "string" ? { auditEventId: result.data.auditEventId } : {}) }
        : failure("unknown", "Finance update response did not include valid state");
    },
    async previewImport(input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ operation: "preview_import", input })
      });
      if (!result.ok) return result;
      return isRecord(result.data.preview)
        ? { ok: true, data: result.data.preview as unknown as FinanceImportPreview }
        : failure("unknown", "Finance import preview was missing");
    },
    async confirmImport(input, idempotencyKey) {
      return createRequest("confirm_import", input, idempotencyKey);
    }
  };
}
