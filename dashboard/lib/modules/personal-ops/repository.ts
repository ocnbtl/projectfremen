"use client";

import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { MutationError, MutationErrorCode } from "../../native-objects/mutation-result";
import type {
  CaptureProcessingPreview,
  CaptureProcessingPreviewInput,
  ConfirmCaptureProcessingInput,
  ConfirmCaptureProcessingResult,
  ConfirmRoutineRunInput,
  ConfirmRoutineRunResult,
  CreatePersonalOpsResult,
  CreatePersonalOpsSecondaryResult,
  InstantiateTemplateInput,
  InstantiateTemplateResult,
  PersonalOpsCreateInputByFamily,
  PersonalOpsFamily,
  PersonalOpsLegacyMapping,
  PersonalOpsMutationResult,
  PersonalOpsObjectByFamily,
  PersonalOpsSecondaryCreateInputByFamily,
  PersonalOpsSecondaryFamily,
  PersonalOpsSecondaryObjectByFamily,
  PersonalOpsSecondaryUpdateInputByFamily,
  PersonalOpsState,
  PersonalOpsUpdateInputByFamily,
  RoutineRunPreview,
  RoutineRunPreviewInput,
  TemplateTestInput,
  TemplateTestPreview
} from "./types";

type Fetcher = typeof fetch;

type ApiPayload = Record<string, unknown>;

export type PersonalOpsRepository = {
  readState(): Promise<PersonalOpsMutationResult<PersonalOpsState>>;
  list<Family extends PersonalOpsFamily>(
    family: Family
  ): Promise<PersonalOpsMutationResult<PersonalOpsObjectByFamily[Family][]>>;
  get<Family extends PersonalOpsFamily>(
    family: Family,
    id: string
  ): Promise<PersonalOpsMutationResult<PersonalOpsObjectByFamily[Family]>>;
  create<Family extends PersonalOpsFamily>(
    family: Family,
    input: PersonalOpsCreateInputByFamily[Family]
  ): Promise<PersonalOpsMutationResult<CreatePersonalOpsResult<Family>>>;
  update<Family extends PersonalOpsFamily>(
    family: Family,
    id: string,
    patch: PersonalOpsUpdateInputByFamily[Family],
    expectedUpdatedAt: string
  ): Promise<PersonalOpsMutationResult<PersonalOpsObjectByFamily[Family]>>;
  listSecondary<Family extends PersonalOpsSecondaryFamily>(
    family: Family
  ): Promise<PersonalOpsMutationResult<PersonalOpsSecondaryObjectByFamily[Family][]>>;
  getSecondary<Family extends PersonalOpsSecondaryFamily>(
    family: Family,
    id: string
  ): Promise<PersonalOpsMutationResult<PersonalOpsSecondaryObjectByFamily[Family]>>;
  createSecondary<Family extends PersonalOpsSecondaryFamily>(
    family: Family,
    input: PersonalOpsSecondaryCreateInputByFamily[Family]
  ): Promise<PersonalOpsMutationResult<CreatePersonalOpsSecondaryResult<Family>>>;
  updateSecondary<Family extends PersonalOpsSecondaryFamily>(
    family: Family,
    id: string,
    patch: PersonalOpsSecondaryUpdateInputByFamily[Family],
    expectedUpdatedAt: string
  ): Promise<PersonalOpsMutationResult<PersonalOpsSecondaryObjectByFamily[Family]>>;
  previewRoutineRun(
    id: string,
    input: RoutineRunPreviewInput
  ): Promise<PersonalOpsMutationResult<RoutineRunPreview>>;
  confirmRoutineRun(
    id: string,
    input: ConfirmRoutineRunInput
  ): Promise<PersonalOpsMutationResult<ConfirmRoutineRunResult>>;
  previewCaptureProcessing(
    id: string,
    input: CaptureProcessingPreviewInput
  ): Promise<PersonalOpsMutationResult<CaptureProcessingPreview>>;
  confirmCaptureProcessing(
    id: string,
    input: ConfirmCaptureProcessingInput
  ): Promise<PersonalOpsMutationResult<ConfirmCaptureProcessingResult>>;
  testTemplate(
    id: string,
    input: TemplateTestInput
  ): Promise<PersonalOpsMutationResult<TemplateTestPreview>>;
  instantiateTemplate(
    id: string,
    input: InstantiateTemplateInput
  ): Promise<PersonalOpsMutationResult<InstantiateTemplateResult>>;
  getLegacyMappings(
    legacyPersonalRecordId: string
  ): Promise<PersonalOpsMutationResult<PersonalOpsLegacyMapping[]>>;
};

export type PersonalOpsRepositoryOptions = {
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
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every((message) => typeof message === "string")
    );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function failure<Data = never>(
  code: MutationErrorCode,
  message: string,
  options: {
    status?: number;
    retryable?: boolean;
    fieldErrors?: Readonly<Record<string, readonly string[]>>;
  } = {}
): PersonalOpsMutationResult<Data> {
  const error: MutationError = {
    code,
    message,
    retryable: options.retryable ?? (code === "network" || code === "server"),
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.status ? { details: { status: options.status } } : {})
  };
  return { ok: false, error };
}

async function requestPayload(
  fetcher: Fetcher,
  url: string,
  init?: RequestInit
): Promise<PersonalOpsMutationResult<ApiPayload>> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    return failure(
      "network",
      error instanceof Error ? error.message : "Unable to reach the Personal Ops repository",
      { retryable: true }
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Personal Ops repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!isRecord(raw)) {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Personal Ops repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!response.ok || raw.ok !== true) {
    const code = errorCode(response.status, raw);
    return failure(
      code,
      typeof raw.error === "string" ? raw.error : "The Personal Ops request failed",
      {
        status: response.status,
        retryable: response.status >= 500,
        fieldErrors: fieldErrors(raw.fieldErrors)
      }
    );
  }

  return { ok: true, data: raw };
}

function withParams(endpoint: string, params: Record<string, string>): string {
  const urlParams = new URLSearchParams(params);
  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${urlParams.toString()}`;
}

function isObjectForFamily<Family extends PersonalOpsFamily>(
  value: unknown,
  family: Family
): value is PersonalOpsObjectByFamily[Family] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.updatedAt !== "string") {
    return false;
  }
  const expectedType =
    family === "goals"
      ? "goal"
      : family === "decisions"
        ? "decision"
        : family === "obligations"
          ? "obligation"
          : "follow_up";
  return value.objectType === expectedType;
}

function isState(value: unknown): value is PersonalOpsState {
  return (
    isRecord(value) &&
    value.schemaVersion === 2 &&
    Array.isArray(value.goals) &&
    Array.isArray(value.decisions) &&
    Array.isArray(value.obligations) &&
    Array.isArray(value.followUps) &&
    Array.isArray(value.routines) &&
    Array.isArray(value.captures) &&
    Array.isArray(value.templates) &&
    Array.isArray(value.auditEvents) &&
    Array.isArray(value.legacyMappings)
  );
}

function isSecondaryObjectForFamily<Family extends PersonalOpsSecondaryFamily>(
  value: unknown,
  family: Family
): value is PersonalOpsSecondaryObjectByFamily[Family] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.updatedAt !== "string") {
    return false;
  }
  const expectedType = family === "routines" ? "routine" : family === "captures" ? "capture_item" : "template";
  return value.objectType === expectedType;
}

function isRoutineRunPreview(value: unknown): value is RoutineRunPreview {
  return (
    isRecord(value) &&
    typeof value.routineId === "string" &&
    typeof value.routineUpdatedAt === "string" &&
    Array.isArray(value.entries) &&
    typeof value.confirmableCount === "number" &&
    typeof value.disabledCount === "number"
  );
}

function isCaptureProcessingPreview(value: unknown): value is CaptureProcessingPreview {
  return (
    isRecord(value) &&
    typeof value.captureId === "string" &&
    typeof value.captureUpdatedAt === "string" &&
    typeof value.rawText === "string" &&
    Array.isArray(value.entries)
  );
}

function isTemplateTestPreview(value: unknown): value is TemplateTestPreview {
  return (
    isRecord(value) &&
    typeof value.templateId === "string" &&
    typeof value.templateUpdatedAt === "string" &&
    Array.isArray(value.entries) &&
    isRecord(value.values) &&
    isRecord(value.fieldErrors)
  );
}

function isLegacyMapping(value: unknown): value is PersonalOpsLegacyMapping {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.legacyPersonalRecordId === "string" &&
    typeof value.conversionKey === "string" &&
    isRecord(value.nativeRef)
  );
}

export function createPersonalOpsRepository(
  options: PersonalOpsRepositoryOptions = {}
): PersonalOpsRepository {
  const endpoint = options.endpoint || "/api/personal/ops";
  const fetcher = options.fetcher || fetch;

  return {
    async readState() {
      const result = await requestPayload(fetcher, endpoint, { cache: "no-store" });
      if (!result.ok) return result;
      return isState(result.data.state)
        ? { ok: true, data: result.data.state }
        : failure("unknown", "The Personal Ops response did not include a valid state");
    },

    async list(family) {
      const result = await requestPayload(fetcher, withParams(endpoint, { family }), {
        cache: "no-store"
      });
      if (!result.ok) return result;
      const items = result.data.items;
      return Array.isArray(items) && items.every((item) => isObjectForFamily(item, family))
        ? { ok: true, data: items }
        : failure("unknown", "The Personal Ops response did not include valid objects");
    },

    async get(family, id) {
      const result = await requestPayload(fetcher, withParams(endpoint, { family, id }), {
        cache: "no-store"
      });
      if (!result.ok) return result;
      return isObjectForFamily(result.data.item, family)
        ? { ok: true, data: result.data.item }
        : failure("unknown", "The Personal Ops response did not include the requested object");
    },

    async create(family, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ family, input })
      });
      if (!result.ok) return result;
      if (!isObjectForFamily(result.data.item, family) || typeof result.data.created !== "boolean") {
        return failure("unknown", "The created Personal Ops object was missing from the response");
      }
      const mapping = isLegacyMapping(result.data.mapping) ? result.data.mapping : undefined;
      return {
        ok: true,
        data: {
          item: result.data.item,
          created: result.data.created,
          ...(mapping ? { mapping } : {})
        },
        ...(typeof result.data.auditEventId === "string"
          ? { auditEventId: result.data.auditEventId }
          : {})
      };
    },

    async update(family, id, patch, expectedUpdatedAt) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ family, id, expectedUpdatedAt, patch })
      });
      if (!result.ok) return result;
      return isObjectForFamily(result.data.item, family)
        ? {
            ok: true,
            data: result.data.item,
            ...(typeof result.data.auditEventId === "string"
              ? { auditEventId: result.data.auditEventId }
              : {})
          }
        : failure("unknown", "The updated Personal Ops object was missing from the response");
    },

    async listSecondary(family) {
      const result = await requestPayload(
        fetcher,
        withParams(endpoint, { secondaryFamily: family }),
        { cache: "no-store" }
      );
      if (!result.ok) return result;
      const items = result.data.items;
      return Array.isArray(items) && items.every((item) => isSecondaryObjectForFamily(item, family))
        ? { ok: true, data: items }
        : failure("unknown", "The Personal Ops response did not include valid secondary objects");
    },

    async getSecondary(family, id) {
      const result = await requestPayload(
        fetcher,
        withParams(endpoint, { secondaryFamily: family, id }),
        { cache: "no-store" }
      );
      if (!result.ok) return result;
      return isSecondaryObjectForFamily(result.data.item, family)
        ? { ok: true, data: result.data.item }
        : failure("unknown", "The Personal Ops response did not include the requested secondary object");
    },

    async createSecondary(family, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ secondaryFamily: family, input })
      });
      if (!result.ok) return result;
      if (!isSecondaryObjectForFamily(result.data.item, family) || result.data.created !== true) {
        return failure("unknown", "The created Personal Ops secondary object was missing from the response");
      }
      return {
        ok: true,
        data: { item: result.data.item, created: true },
        ...(typeof result.data.auditEventId === "string"
          ? { auditEventId: result.data.auditEventId }
          : {})
      };
    },

    async updateSecondary(family, id, patch, expectedUpdatedAt) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ secondaryFamily: family, id, patch, expectedUpdatedAt })
      });
      if (!result.ok) return result;
      return isSecondaryObjectForFamily(result.data.item, family)
        ? {
            ok: true,
            data: result.data.item,
            ...(typeof result.data.auditEventId === "string"
              ? { auditEventId: result.data.auditEventId }
              : {})
          }
        : failure("unknown", "The updated Personal Ops secondary object was missing from the response");
    },

    async previewRoutineRun(id, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "routine.preview_run", id, input })
      });
      if (!result.ok) return result;
      return isRoutineRunPreview(result.data.preview)
        ? { ok: true, data: result.data.preview }
        : failure("unknown", "The routine preview was missing from the response");
    },

    async confirmRoutineRun(id, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "routine.confirm_run", id, input })
      });
      if (!result.ok) return result;
      if (
        !isSecondaryObjectForFamily(result.data.item, "routines") ||
        !isRecord(result.data.run) ||
        typeof result.data.created !== "boolean"
      ) {
        return failure("unknown", "The confirmed routine run was missing from the response");
      }
      return {
        ok: true,
        data: {
          item: result.data.item,
          run: result.data.run as ConfirmRoutineRunResult["run"],
          created: result.data.created
        }
      };
    },

    async previewCaptureProcessing(id, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "capture.preview_processing", id, input })
      });
      if (!result.ok) return result;
      return isCaptureProcessingPreview(result.data.preview)
        ? { ok: true, data: result.data.preview }
        : failure("unknown", "The capture processing preview was missing from the response");
    },

    async confirmCaptureProcessing(id, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "capture.confirm_processing", id, input })
      });
      if (!result.ok) return result;
      if (
        !isSecondaryObjectForFamily(result.data.item, "captures") ||
        !isRecord(result.data.action) ||
        typeof result.data.created !== "boolean"
      ) {
        return failure("unknown", "The confirmed capture processing result was missing from the response");
      }
      return {
        ok: true,
        data: {
          item: result.data.item,
          action: result.data.action as ConfirmCaptureProcessingResult["action"],
          created: result.data.created
        }
      };
    },

    async testTemplate(id, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "template.test", id, input })
      });
      if (!result.ok) return result;
      return isTemplateTestPreview(result.data.preview)
        ? { ok: true, data: result.data.preview }
        : failure("unknown", "The template test preview was missing from the response");
    },

    async instantiateTemplate(id, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "template.instantiate", id, input })
      });
      if (!result.ok) return result;
      if (
        !isSecondaryObjectForFamily(result.data.item, "templates") ||
        !isRecord(result.data.usage) ||
        typeof result.data.created !== "boolean"
      ) {
        return failure("unknown", "The template instantiation result was missing from the response");
      }
      return {
        ok: true,
        data: {
          item: result.data.item,
          usage: result.data.usage as InstantiateTemplateResult["usage"],
          created: result.data.created
        }
      };
    },

    async getLegacyMappings(legacyPersonalRecordId) {
      const result = await requestPayload(
        fetcher,
        withParams(endpoint, { legacyPersonalRecordId }),
        { cache: "no-store" }
      );
      if (!result.ok) return result;
      const mappings = result.data.mappings;
      return Array.isArray(mappings) && mappings.every(isLegacyMapping)
        ? { ok: true, data: mappings }
        : failure("unknown", "The Personal Ops response did not include valid legacy mappings");
    }
  };
}
