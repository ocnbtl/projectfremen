import { readJsonFile, writeJsonFile } from "./file-store";
import type { KpiEntry } from "./types";

const FILE_NAME = "kpis.json";

const DEFAULT_KPIS: KpiEntry[] = [
  {
    id: "kpi-unigentamos-doc-coverage",
    entity: "Unigentamos",
    name: "Documentation Coverage",
    value: "0 / 12 areas complete",
    priority: "P1",
    updatedAt: new Date().toISOString()
  },
  {
    id: "kpi-pngwn-waitlist",
    entity: "pngwn",
    name: "Waitlist Signups (Weekly)",
    value: "TBD",
    priority: "P1",
    updatedAt: new Date().toISOString()
  },
  {
    id: "kpi-diyesu-content",
    entity: "Diyesu Decor",
    name: "Content Shipped (Weekly)",
    value: "TBD",
    priority: "P1",
    updatedAt: new Date().toISOString()
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
      updatedAt: now
    };
  } else {
    next.push({
      id: `kpi-${crypto.randomUUID()}`,
      updatedAt: now,
      ...input
    });
  }

  await writeJsonFile(FILE_NAME, next);
  return next;
}
