import { readJsonFile, writeJsonFile } from "./file-store";
import type { KpiEntry } from "./types";

const FILE_NAME = "kpis.json";
const seedTimestamp = new Date().toISOString();

const DEFAULT_KPIS: KpiEntry[] = [
  {
    id: "kpi-unigentamos-doc-coverage",
    entity: "Unigentamos",
    name: "Documentation Coverage",
    value: "0 / 12",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-unigentamos-open-blockers",
    entity: "Unigentamos",
    name: "Open Blockers",
    value: "0",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-pngwn-waitlist-total",
    entity: "pngwn",
    name: "Waitlist Signups (Total)",
    value: "0",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-pngwn-waitlist-7d",
    entity: "pngwn",
    name: "Waitlist Signups (Past 7 Days)",
    value: "0 (↔ 0%)",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-pngwn-sentry-errors",
    entity: "pngwn",
    name: "Errors Reported in Sentry",
    value: "0",
    priority: "P1",
    link: "https://sentry.io/",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-pngwn-zoho-unread",
    entity: "pngwn",
    name: "Unread Emails (Zoho)",
    value: "0",
    priority: "P1",
    link: "https://mail.zoho.com/",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-pngwn-impressions-total",
    entity: "pngwn",
    name: "Total Website Impressions",
    value: "0 (↔ 0%)",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-diyesu-pins-week",
    entity: "Diyesu Decor",
    name: "Pins Published This Week",
    value: "0 / 25",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-diyesu-blogs-week",
    entity: "Diyesu Decor",
    name: "Blogs Published This Week",
    value: "0 / 3",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-diyesu-pinterest-outbound",
    entity: "Diyesu Decor",
    name: "Outbound Clicks from Pinterest",
    value: "0 (↔ 0%)",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-diyesu-impressions-total",
    entity: "Diyesu Decor",
    name: "Total Website Impressions",
    value: "0 (↔ 0%)",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-diyesu-newsletter-total",
    entity: "Diyesu Decor",
    name: "Total Email Newsletter Signups",
    value: "0",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-diyesu-newsletter-7d",
    entity: "Diyesu Decor",
    name: "Email Newsletter Signups (Past 7 Days)",
    value: "0 (↔ 0%)",
    priority: "P1",
    updatedAt: seedTimestamp
  },
  {
    id: "kpi-diyesu-zoho-unread",
    entity: "Diyesu Decor",
    name: "Unread Emails (Zoho)",
    value: "0",
    priority: "P1",
    link: "https://mail.zoho.com/",
    updatedAt: seedTimestamp
  }
];

export async function readKpis(): Promise<KpiEntry[]> {
  return readJsonFile<KpiEntry[]>(FILE_NAME, DEFAULT_KPIS);
}

export async function upsertKpi(
  input: Omit<KpiEntry, "id" | "updatedAt">
): Promise<KpiEntry[]> {
  const existing = await readKpis();
  const key = `${input.entity}::${input.name}`.toLowerCase();
  const now = new Date().toISOString();

  const next = [...existing];
  const idx = next.findIndex(
    (kpi) => `${kpi.entity}::${kpi.name}`.toLowerCase() === key
  );

  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      value: input.value,
      priority: input.priority,
      link: input.link?.trim() || undefined,
      updatedAt: now
    };
  } else {
    next.push({
      id: `kpi-${crypto.randomUUID()}`,
      updatedAt: now,
      ...input,
      link: input.link?.trim() || undefined
    });
  }

  await writeJsonFile(FILE_NAME, next);
  return next;
}
