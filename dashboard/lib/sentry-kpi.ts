import type { EntityName } from "./types";

const DEFAULT_API_BASE_URL = "https://sentry.io/api/0";
const DEFAULT_QUERY = "is:unresolved";
const DEFAULT_KPI_NAME = "Errors Reported in Sentry";
const MAX_PAGES = 20;

type SentryConfig = {
  apiBaseUrl: string;
  token: string;
  orgSlug: string;
  query: string;
  targets: Array<{
    entity: EntityName;
    projectSlug: string;
    kpiName: string;
  }>;
};

export type SentryKpiConfigStatus = {
  configured: boolean;
  missing: string[];
  targets: Array<{ entity: EntityName; kpiName: string }>;
};

export type SentryKpiSyncResult =
  | {
      ok: false;
      configured: false;
      missing: string[];
      targets: Array<{ entity: EntityName; kpiName: string }>;
    }
  | {
      ok: true;
      configured: true;
      synced: Array<{
        entity: EntityName;
        kpiName: string;
        value: string;
        issueCount: number;
        pages: number;
        link: string;
        projectSlug: string;
      }>;
    };

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  const base = trimmed || DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, "");
}

function parseConfig(): { config: SentryConfig | null; missing: string[] } {
  const token = process.env.SENTRY_AUTH_TOKEN?.trim() || "";
  const orgSlug = process.env.SENTRY_ORG_SLUG?.trim() || "";
  const pngwnProjectSlug =
    process.env.SENTRY_PROJECT_SLUG_PNGWN?.trim() || process.env.SENTRY_PROJECT_SLUG?.trim() || "";
  const diyesuProjectSlug = process.env.SENTRY_PROJECT_SLUG_DIYESU?.trim() || "";

  const missing: string[] = [];
  if (!token) missing.push("SENTRY_AUTH_TOKEN");
  if (!orgSlug) missing.push("SENTRY_ORG_SLUG");
  if (!pngwnProjectSlug) missing.push("SENTRY_PROJECT_SLUG_PNGWN");
  if (!diyesuProjectSlug) missing.push("SENTRY_PROJECT_SLUG_DIYESU");

  if (missing.length > 0) {
    return { config: null, missing };
  }

  return {
    config: {
      apiBaseUrl: normalizeBaseUrl(process.env.SENTRY_API_BASE_URL || ""),
      token,
      orgSlug,
      query: process.env.SENTRY_KPI_QUERY?.trim() || DEFAULT_QUERY,
      targets: [
        {
          entity: "pngwn",
          projectSlug: pngwnProjectSlug,
          kpiName: process.env.SENTRY_KPI_NAME_PNGWN?.trim() || DEFAULT_KPI_NAME
        },
        {
          entity: "Diyesu Decor",
          projectSlug: diyesuProjectSlug,
          kpiName: process.env.SENTRY_KPI_NAME_DIYESU?.trim() || DEFAULT_KPI_NAME
        }
      ]
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
  const fallbackTargets: Array<{ entity: EntityName; kpiName: string }> = [
    {
      entity: "pngwn",
      kpiName: process.env.SENTRY_KPI_NAME_PNGWN?.trim() || DEFAULT_KPI_NAME
    },
    {
      entity: "Diyesu Decor",
      kpiName: process.env.SENTRY_KPI_NAME_DIYESU?.trim() || DEFAULT_KPI_NAME
    }
  ];

  return {
    configured: Boolean(config),
    missing,
    targets: config
      ? config.targets.map((target) => ({ entity: target.entity, kpiName: target.kpiName }))
      : fallbackTargets
  };
}

export async function syncSentryErrorsKpi(): Promise<SentryKpiSyncResult> {
  const { config, missing } = parseConfig();
  if (!config) {
    return {
      ok: false,
      configured: false,
      missing,
      targets: [
        {
          entity: "pngwn",
          kpiName: process.env.SENTRY_KPI_NAME_PNGWN?.trim() || DEFAULT_KPI_NAME
        },
        {
          entity: "Diyesu Decor",
          kpiName: process.env.SENTRY_KPI_NAME_DIYESU?.trim() || DEFAULT_KPI_NAME
        }
      ]
    };
  }

  const synced: Array<{
    entity: EntityName;
    kpiName: string;
    value: string;
    issueCount: number;
    pages: number;
    link: string;
    projectSlug: string;
  }> = [];

  for (const target of config.targets) {
    const mergedQuery = `project:${target.projectSlug} ${config.query}`.trim();
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
        throw new Error(`Sentry request failed (${response.status}) for ${target.projectSlug}`);
      }

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        throw new Error(`Unexpected Sentry response shape for ${target.projectSlug}`);
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

    synced.push({
      entity: target.entity,
      kpiName: target.kpiName,
      value: String(issueCount),
      issueCount,
      pages: pageCount,
      link: buildIssuesUiLink(config.orgSlug, target.projectSlug),
      projectSlug: target.projectSlug
    });
  }

  return {
    ok: true,
    configured: true,
    synced
  };
}
