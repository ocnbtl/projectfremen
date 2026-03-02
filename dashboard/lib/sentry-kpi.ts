import type { EntityName } from "./types";

const DEFAULT_API_BASE_URL = "https://sentry.io/api/0";
const DEFAULT_QUERY = "is:unresolved";
const DEFAULT_KPI_NAME = "Errors Reported in Sentry";
const MAX_PAGES = 20;

type SentryTargetConfig = {
  entity: EntityName;
  orgSlug: string;
  projectSlug: string;
  kpiName: string;
};

type SentryConfig = {
  apiBaseUrl: string;
  token: string;
  query: string;
  targets: SentryTargetConfig[];
};

type SentryProjectSummary = {
  id: string;
  slug: string;
  name: string;
  organizationSlug: string;
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

function normalizeProjectInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")
    .filter(Boolean)
    .pop() || "";
}

function slugifyToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseConfig(): { config: SentryConfig | null; missing: string[] } {
  const token = process.env.SENTRY_AUTH_TOKEN?.trim() || "";
  const defaultOrgSlug = process.env.SENTRY_ORG_SLUG?.trim() || "";
  const pngwnOrgSlug = process.env.SENTRY_ORG_SLUG_PNGWN?.trim() || defaultOrgSlug;
  const diyesuOrgSlug = process.env.SENTRY_ORG_SLUG_DIYESU?.trim() || defaultOrgSlug;

  const pngwnProjectSlug =
    process.env.SENTRY_PROJECT_SLUG_PNGWN?.trim() || process.env.SENTRY_PROJECT_SLUG?.trim() || "";
  const diyesuProjectSlug = process.env.SENTRY_PROJECT_SLUG_DIYESU?.trim() || "";

  const missing: string[] = [];
  if (!token) missing.push("SENTRY_AUTH_TOKEN");
  if (!pngwnOrgSlug) missing.push("SENTRY_ORG_SLUG_PNGWN or SENTRY_ORG_SLUG");
  if (!diyesuOrgSlug) missing.push("SENTRY_ORG_SLUG_DIYESU or SENTRY_ORG_SLUG");
  if (!pngwnProjectSlug) missing.push("SENTRY_PROJECT_SLUG_PNGWN");
  if (!diyesuProjectSlug) missing.push("SENTRY_PROJECT_SLUG_DIYESU");

  if (missing.length > 0) {
    return { config: null, missing };
  }

  return {
    config: {
      apiBaseUrl: normalizeBaseUrl(process.env.SENTRY_API_BASE_URL || ""),
      token,
      query: process.env.SENTRY_KPI_QUERY?.trim() || DEFAULT_QUERY,
      targets: [
        {
          entity: "pngwn",
          orgSlug: pngwnOrgSlug,
          projectSlug: pngwnProjectSlug,
          kpiName: process.env.SENTRY_KPI_NAME_PNGWN?.trim() || DEFAULT_KPI_NAME
        },
        {
          entity: "Diyesu Decor",
          orgSlug: diyesuOrgSlug,
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

    return {
      nextUrl: urlPart.slice(1, -1),
      hasMore: resultsPart?.includes('"true"') ?? false
    };
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

async function fetchVisibleProjects(config: SentryConfig): Promise<SentryProjectSummary[]> {
  const firstUrl = `${config.apiBaseUrl}/projects/?per_page=200`;
  const projects: SentryProjectSummary[] = [];
  let nextUrl: string | null = firstUrl;
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_PAGES) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      break;
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      break;
    }

    for (const rawProject of payload) {
      if (!rawProject || typeof rawProject !== "object") {
        continue;
      }
      const project = rawProject as {
        id?: unknown;
        slug?: unknown;
        name?: unknown;
        organization?: unknown;
      };

      const slug = typeof project.slug === "string" ? project.slug.trim() : "";
      if (!slug) {
        continue;
      }

      const id = typeof project.id === "string" ? project.id.trim() : "";
      const name = typeof project.name === "string" ? project.name.trim() : "";
      let organizationSlug = "";

      if (project.organization && typeof project.organization === "object") {
        const orgObject = project.organization as { slug?: unknown };
        organizationSlug = typeof orgObject.slug === "string" ? orgObject.slug.trim() : "";
      } else if (typeof project.organization === "string") {
        organizationSlug = project.organization.trim();
      }

      projects.push({
        id,
        slug,
        name,
        organizationSlug
      });
    }

    pageCount += 1;
    const { nextUrl: nextCandidate, hasMore } = parseNextLink(response.headers.get("link"));
    if (!nextCandidate || !hasMore) {
      nextUrl = null;
    } else {
      nextUrl = resolveNextUrl(config.apiBaseUrl, nextCandidate);
    }
  }

  return projects;
}

function pickBestProject(
  target: SentryTargetConfig,
  projects: SentryProjectSummary[]
): SentryProjectSummary | null {
  if (projects.length === 0) {
    return null;
  }

  const requested = normalizeProjectInput(target.projectSlug);
  if (!requested) {
    return null;
  }

  const token = slugifyToken(requested);
  const preferred = projects.filter(
    (project) => !project.organizationSlug || project.organizationSlug === target.orgSlug
  );
  const pool = preferred.length > 0 ? preferred : projects;

  const exact = pool.find((project) => {
    const slug = project.slug.toLowerCase();
    const name = project.name.toLowerCase();
    return (
      slug === requested ||
      slug === token ||
      name === requested ||
      name === token ||
      project.id === requested
    );
  });
  if (exact) {
    return exact;
  }

  const fuzzy = pool.filter((project) => {
    const slug = project.slug.toLowerCase();
    const name = project.name.toLowerCase();
    return slug.includes(token) || token.includes(slug) || name.includes(requested);
  });
  if (fuzzy.length === 1) {
    return fuzzy[0];
  }

  return null;
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

  const visibleProjects = await fetchVisibleProjects(config).catch(() => []);
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
    const match = pickBestProject(target, visibleProjects);
    const resolvedOrgSlug = match?.organizationSlug || target.orgSlug;
    const resolvedProjectSlug = match?.slug || target.projectSlug.trim();

    const firstUrl =
      `${config.apiBaseUrl}/projects/${encodeURIComponent(resolvedOrgSlug)}` +
      `/${encodeURIComponent(resolvedProjectSlug)}/issues/?limit=100&query=${encodeURIComponent(config.query)}`;

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
        const raw = await response.text().catch(() => "");
        const detail = raw.replace(/\s+/g, " ").trim().slice(0, 180);
        throw new Error(
          detail
            ? `Sentry request failed (${response.status}) for ${target.entity} [${resolvedOrgSlug}/${resolvedProjectSlug}]: ${detail}`
            : `Sentry request failed (${response.status}) for ${target.entity} [${resolvedOrgSlug}/${resolvedProjectSlug}]`
        );
      }

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        throw new Error(
          `Unexpected Sentry response shape for ${target.entity} [${resolvedOrgSlug}/${resolvedProjectSlug}]`
        );
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
      link: buildIssuesUiLink(resolvedOrgSlug, resolvedProjectSlug),
      projectSlug: resolvedProjectSlug
    });
  }

  return {
    ok: true,
    configured: true,
    synced
  };
}
