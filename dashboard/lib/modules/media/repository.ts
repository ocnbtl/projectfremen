import type { MutationErrorCode } from "../../native-objects/mutation-result";
import type { PersonalRecord } from "../../personal-records-store";
import { legacyPersonalRecordsToMediaAssets } from "./legacy-adapter";
import type {
  MediaAsset,
  MediaRepositoryError,
  MediaRepositoryResult
} from "./types";

type Fetcher = typeof fetch;

type PersonalRecordsResponse = {
  ok?: unknown;
  items?: unknown;
  error?: unknown;
};

export type MediaRepository = {
  list(): Promise<MediaRepositoryResult<MediaAsset[]>>;
  get(id: string): Promise<MediaRepositoryResult<MediaAsset>>;
};

export type MediaRepositoryOptions = {
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
): MediaRepositoryResult<never> {
  const error: MediaRepositoryError = {
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
    typeof value.className === "string" &&
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
    isRecord(value.time) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

async function requestRecords(
  fetcher: Fetcher,
  endpoint: string
): Promise<MediaRepositoryResult<PersonalRecord[]>> {
  let response: Response;
  try {
    response = await fetcher(endpoint, { method: "GET", cache: "no-store" });
  } catch (error) {
    return failure(
      "network",
      error instanceof Error ? error.message : "Unable to reach the Media repository",
      { retryable: true }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Media repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!isRecord(rawPayload)) {
    return failure(
      response.status >= 500 ? "server" : "unknown",
      "The Media repository returned an invalid response",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  const payload = rawPayload as PersonalRecordsResponse;
  if (!response.ok || payload.ok !== true) {
    return failure(
      errorCode(response.status),
      typeof payload.error === "string" ? payload.error : "The Media request failed",
      { status: response.status, retryable: response.status >= 500 }
    );
  }

  if (!Array.isArray(payload.items) || !payload.items.every(isPersonalRecord)) {
    return failure("unknown", "The Media repository response did not include valid records", {
      status: response.status
    });
  }

  return { ok: true, data: payload.items };
}

export function createMediaRepository(options: MediaRepositoryOptions = {}): MediaRepository {
  const endpoint = options.endpoint || "/api/personal/records";
  const fetcher = options.fetcher || fetch;

  async function list(): Promise<MediaRepositoryResult<MediaAsset[]>> {
    const result = await requestRecords(fetcher, endpoint);
    return result.ok
      ? { ok: true, data: legacyPersonalRecordsToMediaAssets(result.data) }
      : result;
  }

  return {
    list,
    async get(id) {
      const normalizedId = id.trim();
      if (!normalizedId) {
        return failure("validation", "Media asset id is required");
      }

      const result = await list();
      if (!result.ok) return result;
      const asset = result.data.find((item) => item.id === normalizedId);
      return asset
        ? { ok: true, data: asset }
        : failure("not_found", "Media asset was not found", { status: 404 });
    }
  };
}
