import type { MutationErrorCode } from "../../native-objects/mutation-result";
import type { PersonalRecord } from "../../personal-records-store";
import { legacyPersonalRecordsToResources } from "./legacy-adapter";
import type {
  ResourceRecord,
  ResourcesRepositoryError,
  ResourcesRepositoryResult
} from "./types";

type Fetcher = typeof fetch;

type PersonalRecordsResponse = {
  ok?: unknown;
  items?: unknown;
  error?: unknown;
};

/** Read-only while the native Resources persistence topology is unresolved. */
export type ResourcesRepository = {
  list(): Promise<ResourcesRepositoryResult<ResourceRecord[]>>;
  get(id: string): Promise<ResourcesRepositoryResult<ResourceRecord>>;
};

export type ResourcesRepositoryOptions = {
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
): ResourcesRepositoryResult<never> {
  const error: ResourcesRepositoryError = {
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values
): value is Values[number] {
  return typeof value === "string" && values.includes(value);
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
    typeof value.body === "string" &&
    isOneOf(value.status, ["idea", "draft", "active", "completed", "blocked", "inactive", "next"] as const) &&
    isOneOf(value.stage, ["processed", "unprocessed"] as const) &&
    isOneOf(value.privacy, ["private", "shared"] as const) &&
    isOneOf(
      value.knowledgeShape,
      ["", "observation", "claim", "procedure", "process", "collection", "reference"] as const
    ) &&
    isOneOf(value.growth, ["seed", "plant", "tree", "forest", "jungle"] as const) &&
    isStringArray(value.areas) &&
    isStringArray(value.subjects) &&
    isStringArray(value.projects) &&
    isStringArray(value.intents) &&
    isStringArray(value.externalSources) &&
    isRecord(relations) &&
    isStringArray(relations.north) &&
    isStringArray(relations.south) &&
    isStringArray(relations.east) &&
    isStringArray(relations.west) &&
    isStringArray(relations.stakeholders) &&
    isStringArray(relations.stakeholdings) &&
    isStringArray(relations.internalSources) &&
    isStringArray(relations.related) &&
    isRecord(time) &&
    isRecord(createdMeta) &&
    typeof createdMeta.uid === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

async function requestRecords(
  fetcher: Fetcher,
  endpoint: string
): Promise<ResourcesRepositoryResult<PersonalRecord[]>> {
  let response: Response;
  try {
    response = await fetcher(endpoint, { method: "GET", cache: "no-store" });
  } catch (error) {
    return failure(
      "network",
      error instanceof Error ? error.message : "Unable to reach the Resources repository",
      { retryable: true }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Resources repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!isRecord(rawPayload)) {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Resources repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  const payload = rawPayload as PersonalRecordsResponse;
  if (!response.ok || payload.ok !== true) {
    return failure(
      errorCode(response.status),
      typeof payload.error === "string" ? payload.error : "The Resources request failed",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!Array.isArray(payload.items) || !payload.items.every(isPersonalRecord)) {
    return failure("unknown", "The Resources repository response did not include valid records", {
      status: response.status
    });
  }

  return { ok: true, data: payload.items };
}

export function createResourcesRepository(
  options: ResourcesRepositoryOptions = {}
): ResourcesRepository {
  const endpoint = options.endpoint || "/api/personal/records";
  const fetcher = options.fetcher || fetch;

  async function list(): Promise<ResourcesRepositoryResult<ResourceRecord[]>> {
    const result = await requestRecords(fetcher, endpoint);
    return result.ok
      ? { ok: true, data: legacyPersonalRecordsToResources(result.data) }
      : result;
  }

  return {
    list,
    async get(id) {
      const normalizedId = id.trim();
      if (!normalizedId) {
        return failure("validation", "Resource id is required");
      }

      const result = await list();
      if (!result.ok) return result;
      const resource = result.data.find((item) => item.id === normalizedId);
      return resource
        ? { ok: true, data: resource }
        : failure("not_found", "Resource was not found", { status: 404 });
    }
  };
}
