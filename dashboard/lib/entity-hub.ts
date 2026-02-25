import type { DocsIndexItem, EntityName, KpiEntry } from "./types";

export type EntitySlug = "unigentamos" | "pngwn" | "diyesu-decor";

export type EntityHubConfig = {
  slug: EntitySlug;
  entity: EntityName;
  heading: string;
  shortDescription: string;
  projectLabel: string;
  repos: string[];
  docKeywords: string[];
  defaultGoals: string[];
  kpiOrder: string[];
};

export const ENTITY_HUBS: EntityHubConfig[] = [
  {
    slug: "unigentamos",
    entity: "Unigentamos",
    heading: "Unigentamos Hub",
    shortDescription: "Umbrella operations, documentation, and execution health.",
    projectLabel: "Project Fremen",
    repos: ["ocnbtl/projectfremen"],
    docKeywords: ["unigentamos", "project fremen", "fremen"],
    defaultGoals: [
      "Keep all 12 Unigentamos documentation areas current.",
      "Reduce active blockers every week.",
      "Keep dashboards and workflows easy to run."
    ],
    kpiOrder: ["Documentation Coverage", "Open Blockers"]
  },
  {
    slug: "pngwn",
    entity: "pngwn",
    heading: "pngwn Hub",
    shortDescription: "Growth and reliability for Project Iceflake.",
    projectLabel: "Project Iceflake",
    repos: ["pngwn-zero/pngwn-web", "pngwn-zero/pngwn"],
    docKeywords: ["pngwn", "project iceflake", "iceflake"],
    defaultGoals: [
      "Grow waitlist signups consistently.",
      "Keep website impressions trending up.",
      "Keep errors and unread inbox load low."
    ],
    kpiOrder: [
      "Waitlist Signups (Total)",
      "Waitlist Signups (Past 7 Days)",
      "Total Website Impressions",
      "Errors Reported in Sentry",
      "Unread Emails (Zoho)"
    ]
  },
  {
    slug: "diyesu-decor",
    entity: "Diyesu Decor",
    heading: "Diyesu Decor Hub",
    shortDescription: "Content and audience growth for Project Pint.",
    projectLabel: "Project Pint",
    repos: ["ocnbtl/projectpint"],
    docKeywords: ["diyesu", "diyesu decor", "project pint", "pint"],
    defaultGoals: [
      "Ship weekly pins and blogs on plan.",
      "Increase outbound clicks and impressions.",
      "Grow newsletter signups week over week."
    ],
    kpiOrder: [
      "Pins Published This Week",
      "Blogs Published This Week",
      "Outbound Clicks from Pinterest",
      "Total Website Impressions",
      "Total Email Newsletter Signups",
      "Email Newsletter Signups (Past 7 Days)",
      "Unread Emails (Zoho)"
    ]
  }
];

export function getEntityHubBySlug(slug: string): EntityHubConfig | null {
  return ENTITY_HUBS.find((item) => item.slug === slug) || null;
}

export function sortEntityKpis(kpis: KpiEntry[], config: EntityHubConfig): KpiEntry[] {
  return [...kpis].sort((a, b) => {
    const aIdx = config.kpiOrder.findIndex((name) => name.toLowerCase() === a.name.toLowerCase());
    const bIdx = config.kpiOrder.findIndex((name) => name.toLowerCase() === b.name.toLowerCase());

    const aSort = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
    const bSort = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;

    if (aSort !== bSort) {
      return aSort - bSort;
    }
    return a.name.localeCompare(b.name);
  });
}

export function filterDocsForEntity(items: DocsIndexItem[], config: EntityHubConfig): DocsIndexItem[] {
  const keywords = config.docKeywords.map((item) => item.toLowerCase());

  return items
    .filter((item) => {
      const byRepo = config.repos.includes(item.repo);
      if (byRepo) {
        return true;
      }

      const projectsText = (item.projects || []).join(" ").toLowerCase();
      const subjectsText = (item.subjects || []).join(" ").toLowerCase();
      const titleText = item.title.toLowerCase();
      const pathText = item.path.toLowerCase();

      return keywords.some((keyword) =>
        projectsText.includes(keyword) ||
        subjectsText.includes(keyword) ||
        titleText.includes(keyword) ||
        pathText.includes(keyword)
      );
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
