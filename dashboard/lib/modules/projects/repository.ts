"use client";

import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { AuditEvent } from "../../native-objects/audit";
import type { MutationError, MutationErrorCode } from "../../native-objects/mutation-result";
import type {
  LegacyProjectPromotionInput,
  Project,
  ProjectObjectFamily,
  ProjectsCreateInputByFamily,
  ProjectsCreateResult,
  ProjectsLegacyMapping,
  ProjectsMutationResult,
  ProjectsObjectByFamily,
  ProjectsState,
  ProjectsUpdateInputByFamily,
  ProjectsUpdateResult,
  ProjectTimelineEvent
} from "./types";

type Fetcher = typeof fetch;
type ApiPayload = Record<string, unknown>;

export type ProjectsRepository = {
  readState(): Promise<ProjectsMutationResult<ProjectsState>>;
  list<Family extends ProjectObjectFamily>(
    family: Family,
    options?: { projectId?: string }
  ): Promise<ProjectsMutationResult<ProjectsObjectByFamily[Family][]>>;
  get<Family extends ProjectObjectFamily>(
    family: Family,
    id: string
  ): Promise<ProjectsMutationResult<ProjectsObjectByFamily[Family]>>;
  promoteLegacy(
    input: LegacyProjectPromotionInput
  ): Promise<ProjectsMutationResult<ProjectsCreateResult<"projects">>>;
  create<Family extends ProjectObjectFamily>(
    family: Family,
    input: ProjectsCreateInputByFamily[Family]
  ): Promise<ProjectsMutationResult<ProjectsCreateResult<Family>>>;
  update<Family extends ProjectObjectFamily>(
    family: Family,
    id: string,
    patch: ProjectsUpdateInputByFamily[Family],
    expectedUpdatedAt: string
  ): Promise<ProjectsMutationResult<ProjectsUpdateResult<Family>>>;
};

export type ProjectsRepositoryOptions = {
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
  if (payload.code === "read_only") return "read_only";
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
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string[]] =>
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
): ProjectsMutationResult<Data> {
  const error: MutationError = {
    code,
    message,
    retryable: options.retryable ?? (code === "network" || code === "server"),
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.status ? { details: { status: options.status } } : {})
  };
  return { ok: false, error };
}

function forwardFailure<Data>(
  result: Extract<ProjectsMutationResult<unknown>, { ok: false }>
): ProjectsMutationResult<Data> {
  return { ok: false, error: result.error };
}

async function requestPayload(
  fetcher: Fetcher,
  url: string,
  init?: RequestInit
): Promise<ProjectsMutationResult<ApiPayload>> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    return failure(
      "network",
      error instanceof Error ? error.message : "Unable to reach the Projects repository",
      { retryable: true }
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Projects repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }
  if (!isRecord(raw)) {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Projects repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }
  if (!response.ok || raw.ok !== true) {
    const code = errorCode(response.status, raw);
    return failure(
      code,
      typeof raw.error === "string" ? raw.error : "The Projects request failed",
      {
        status: response.status,
        retryable: response.status >= 500,
        fieldErrors: fieldErrors(raw.fieldErrors)
      }
    );
  }
  return { ok: true, data: raw };
}

function withParams(endpoint: string, params: Record<string, string | undefined>): string {
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) urlParams.set(key, value);
  });
  const query = urlParams.toString();
  return query ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}` : endpoint;
}

function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    value.objectType === "project" &&
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.updatedAt === "string"
  );
}

function expectedObjectType(family: ProjectObjectFamily) {
  return family === "projects"
    ? "project"
    : family === "milestones"
      ? "milestone"
      : family === "blockers"
        ? "blocker"
        : "project_link";
}

function isObjectForFamily<Family extends ProjectObjectFamily>(
  value: unknown,
  family: Family
): value is ProjectsObjectByFamily[Family] {
  return (
    isRecord(value) &&
    value.objectType === expectedObjectType(family) &&
    typeof value.id === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isState(value: unknown): value is ProjectsState {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.projects) &&
    Array.isArray(value.milestones) &&
    Array.isArray(value.blockers) &&
    Array.isArray(value.links) &&
    Array.isArray(value.timelineEvents) &&
    Array.isArray(value.auditEvents) &&
    Array.isArray(value.legacyMappings)
  );
}

function optionalMapping(value: unknown): ProjectsLegacyMapping | undefined {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string"
    ? (value as ProjectsLegacyMapping)
    : undefined;
}

function optionalAuditEvent(value: unknown): AuditEvent | undefined {
  return isRecord(value) && typeof value.id === "string" && typeof value.action === "string"
    ? (value as AuditEvent)
    : undefined;
}

function optionalTimelineEvent(value: unknown): ProjectTimelineEvent | undefined {
  return isRecord(value) && value.objectType === "timeline_event" && typeof value.id === "string"
    ? (value as ProjectTimelineEvent)
    : undefined;
}

function createResult<Family extends ProjectObjectFamily>(
  payload: ApiPayload,
  family: Family
): ProjectsMutationResult<ProjectsCreateResult<Family>> {
  if (
    !isObjectForFamily(payload.item, family) ||
    !isProject(payload.project) ||
    typeof payload.created !== "boolean"
  ) {
    return failure("unknown", "The Projects response did not include a valid created object");
  }
  return {
    ok: true,
    data: {
      item: payload.item,
      project: payload.project,
      created: payload.created,
      ...(optionalMapping(payload.mapping) ? { mapping: optionalMapping(payload.mapping) } : {}),
      ...(optionalAuditEvent(payload.auditEvent) ? { auditEvent: optionalAuditEvent(payload.auditEvent) } : {}),
      ...(optionalTimelineEvent(payload.timelineEvent)
        ? { timelineEvent: optionalTimelineEvent(payload.timelineEvent) }
        : {})
    }
  };
}

function updateResult<Family extends ProjectObjectFamily>(
  payload: ApiPayload,
  family: Family
): ProjectsMutationResult<ProjectsUpdateResult<Family>> {
  const auditEvent = optionalAuditEvent(payload.auditEvent);
  const timelineEventValue = optionalTimelineEvent(payload.timelineEvent);
  if (
    !isObjectForFamily(payload.item, family) ||
    !isProject(payload.project) ||
    !auditEvent ||
    !timelineEventValue
  ) {
    return failure("unknown", "The Projects response did not include a valid updated object");
  }
  return {
    ok: true,
    data: {
      item: payload.item,
      project: payload.project,
      auditEvent,
      timelineEvent: timelineEventValue
    }
  };
}

export function createProjectsRepository(
  options: ProjectsRepositoryOptions = {}
): ProjectsRepository {
  const endpoint = options.endpoint || "/api/projects";
  const fetcher = options.fetcher || fetch;

  return {
    async readState() {
      const result = await requestPayload(fetcher, endpoint, { cache: "no-store" });
      if (!result.ok) return forwardFailure<ProjectsState>(result);
      return isState(result.data.state)
        ? { ok: true, data: result.data.state }
        : failure("unknown", "The Projects response did not include a valid state");
    },

    async list(family, options = {}) {
      const result = await requestPayload(
        fetcher,
        withParams(endpoint, { family, projectId: options.projectId }),
        { cache: "no-store" }
      );
      if (!result.ok) return forwardFailure<ProjectsObjectByFamily[typeof family][]>(result);
      return Array.isArray(result.data.items) &&
        result.data.items.every((item) => isObjectForFamily(item, family))
        ? { ok: true, data: result.data.items }
        : failure("unknown", "The Projects response did not include valid objects");
    },

    async get(family, id) {
      const result = await requestPayload(fetcher, withParams(endpoint, { family, id }), {
        cache: "no-store"
      });
      if (!result.ok) return forwardFailure<ProjectsObjectByFamily[typeof family]>(result);
      return isObjectForFamily(result.data.item, family)
        ? { ok: true, data: result.data.item }
        : failure("unknown", "The Projects response did not include the requested object");
    },

    async promoteLegacy(input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "promote_legacy", input })
      });
      if (!result.ok) return forwardFailure<ProjectsCreateResult<"projects">>(result);
      return createResult(result.data, "projects");
    },

    async create(family, input) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ operation: "create", family, input })
      });
      if (!result.ok) return forwardFailure<ProjectsCreateResult<typeof family>>(result);
      return createResult(result.data, family);
    },

    async update(family, id, patch, expectedUpdatedAt) {
      const result = await requestPayload(fetcher, endpoint, {
        method: "PATCH",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ family, id, patch, expectedUpdatedAt })
      });
      if (!result.ok) return forwardFailure<ProjectsUpdateResult<typeof family>>(result);
      return updateResult(result.data, family);
    }
  };
}
