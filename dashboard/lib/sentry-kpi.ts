import type { EntityName } from "./types";

const DEFAULT_API_BASE_URL = "https://sentry.io/api/0";
const DEFAULT_QUERY = "is:unresolved";
const DEFAULT_ENTITY: EntityName = "pngwn";
const DEFAULT_KPI_NAME = "Errors Reported in Sentry";
const MAX_PAGES = 20;

const ALLOWED_ENTITIES: EntityName[] = ["Unigentamos", "pngwn", "Diyesu Decor"];

type SentryConfig = {
  apiBaseUrl: string;
  token: string;
  orgSlug: string;
  projectSlug: string;
  query: string;
  entity: EntityName;
  kpiName: string;
};

export type SentryKpiConfigStatus = {
  configured: boolean;
  missing: string[];
  entity: EntityName;
  kpiName: string;
};

export type SentryKpiSyncResult =
  | {
      ok: false;
      configured: false;
      missing: string[];
      entity: EntityName;
      kpiName: string;
    }
  | {
      ok: true;
      configured: true;
      entity: EntityName;
      kpiName: string;
      value: string;
      issueCount: number;
      pages: number;
      link: string;
      query: string;
    };

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  const base = trimmed || DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, "");
}

function parseEntity(value: string | undefined): EntityName {
  const raw = value?.trim() || "";
  return ALLOWED_ENTITIES.includes(raw as EntityName) ? (raw as EntityName) : DEFAULT_ENTITY;
}

function parseConfig(): { config: SentryConfig | null; missing: string[] } {
  const token = process.env.SENTRY_AUTH_TOKEN?.trim() || "";
  const orgSlug = process.env.SENTRY_ORG_SLUG?.trim() || "";
  const projectSlug = process.env.SENTRY_PROJECT_SLUG?.trim() || "";

  const missing: string[] = [];
  if (!token) missing.push("SENTRY_AUTH_TOKEN");
  if (!orgSlug) missing.push("SENTRY_ORG_SLUG");
  if (!projectSlug) missing.push("SENTRY_PROJECT_SLUG");

  const entity = parseEntity(process.env.SENTRY_KPI_ENTITY);
  const kpiName = process.env.SENTRY_KPI_NAME?.trim() || DEFAULT_KPI_NAME;
  if (missing.length > 0) {
    return { config: null, missing };
  }

  return {
    config: {
      apiBaseUrl: normalizeBaseUrl(process.env.SENTRY_API_BASE_URL || ""),
      token,
      orgSlug,
      projectSlug,
      query: process.env.SENTRY_KPI_QUERY?.trim() || DEFAULT_QUERY,
      entity,
      kpiName
    },
    missing
  };
}

function parseNextLink(linkHeader: string | null): { nextUrl: string | null; hasMore: boolean } {
  if (!linkHeader) {
    return { nextUrl: null, hasMore: false };
  }

  const segments = linkHeader.split(",");
  for (const segment of segments) {
    const pieces = segment.split(";").map((part) => part.trim());
    const urlPart = pieces.find((part) => part.startsWith("<") && part.endsWith(">"));
    const relPart = pieces.find((part) => part.startsWith("rel="));
    const resultsPart = pieces.find((part) => part.startsWith("results="));

    const isNext = relPart?.includes('"next"') ?? false;
    if (!isNext || !urlPart) {
      continue;
    }

    const nextUrl = urlPart.slice(1, -1);
    const hasMore = resultsPart?.includes('"true"') ?? false;
    return { nextUrl, hasMore };
  }

  return { nextUrl: null, hasMore: false };
}

function resolveNextUrl(baseUrl: string, candidate: string): string {
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return candidate;
  }
  return `${baseUrl}${candidate.startsWith("/") ? "" : "/"}${candidate}`;
}

function buildIssuesUiLink(orgSlug: string, projectSlug: string): string {
  return `https://sentry.io/organizations/${orgSlug}/issues/?project=${encodeURIComponent(projectSlug)}`;
}

export function getSentryKpiConfigStatus(): SentryKpiConfigStatus {
  const { config, missing } = parseConfig();
  return {
    configured: Boolean(config),
    missing,
    entity: config?.entity ?? parseEntity(process.env.SENTRY_KPI_ENTITY),
    kpiName: config?.kpiName ?? (process.env.SENTRY_KPI_NAME?.trim() || DEFAULT_KPI_NAME)
  };
}

export async function syncSentryErrorsKpi(): Promise<SentryKpiSyncResult> {
  const { config, missing } = parseConfig();
  if (!config) {
    return {
      ok: false,
      configured: false,
      missing,
      entity: parseEntity(process.env.SENTRY_KPI_ENTITY),
      kpiName: process.env.SENTRY_KPI_NAME?.trim() || DEFAULT_KPI_NAME
    };
  }

  const mergedQuery = `project:${config.projectSlug} ${config.query}`.trim();
  const firstUrl =
    `${config.apiBaseUrl}/organizations/${encodeURIComponent(config.orgSlug)}` +
    `/issues/?limit=100&query=${encodeURIComponent(mergedQuery)}`;

  let nextUrl: string | null = firstUrl;
  let pageCount = 0;
  let issueCount = 0;

  while (nextUrl && pageCount < MAX_PAGES) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Sentry request failed (${response.status})`);
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error("Unexpected Sentry response shape");
    }

    issueCount += payload.length;
    pageCount += 1;

    const { nextUrl: nextCandidate, hasMore } = parseNextLink(response.headers.get("link"));
    if (!nextCandidate || !hasMore) {
      nextUrl = null;
    } else {
      nextUrl = resolveNextUrl(config.apiBaseUrl, nextCandidate);
    }
  }

  return {
    ok: true,
    configured: true,
    entity: config.entity,
    kpiName: config.kpiName,
    value: String(issueCount),
    issueCount,
    pages: pageCount,
    link: buildIssuesUiLink(config.orgSlug, config.projectSlug),
    query: config.query
  };
}

