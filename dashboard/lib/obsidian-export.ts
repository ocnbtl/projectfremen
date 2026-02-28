import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { readKpis } from "./kpis-store";
import { getReviewFields } from "./review-templates";
import { readReviews } from "./reviews-store";
import type { ReviewEntry } from "./types";

type ExportMode = "dry-run" | "write";
type ExportItemKind = "weekly" | "monthly" | "kpi_snapshot";

export type ObsidianExportItem = {
  kind: ExportItemKind;
  sourceId: string;
  targetPath: string;
};

export type ObsidianExportResult = {
  mode: ExportMode;
  rootDir: string;
  items: ObsidianExportItem[];
};

function sanitizeFileToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}

function exportRootDir(): string {
  const configured = process.env.OBSIDIAN_EXPORT_DIR?.trim();
  if (configured) {
    return configured;
  }
  return path.join(process.cwd(), "data", "exports", "obsidian");
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveUniquePath(basePath: string): Promise<string> {
  if (!(await fileExists(basePath))) {
    return basePath;
  }

  const ext = path.extname(basePath);
  const stem = basePath.slice(0, -ext.length);
  for (let version = 2; version < 10_000; version += 1) {
    const candidate = `${stem}__v${version}${ext}`;
    if (!(await fileExists(candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to allocate unique export filename");
}

function reviewFrontmatter(entry: ReviewEntry): string {
  const exportedAt = new Date().toISOString();
  return [
    "---",
    `kind: ${entry.kind}`,
    `scheduled_for: ${entry.scheduledFor}`,
    'source: "project-fremen-dashboard"',
    `source_entry_id: "${escapeYaml(entry.id)}"`,
    `exported_at: "${exportedAt}"`,
    'projects: ["Project Fremen"]',
    'subjects: ["Operations", "Review"]',
    "---"
  ].join("\n");
}

function renderReviewBody(entry: ReviewEntry): string {
  const fields = getReviewFields(entry.kind);
  const sectionLines: string[] = [];

  for (const field of fields) {
    const value = (entry.values[field.id] || "").trim();
    if (!value) {
      continue;
    }

    sectionLines.push(`## ${field.label}`);
    sectionLines.push("");
    sectionLines.push(value);
    sectionLines.push("");
  }

  const knownFieldIds = new Set(fields.map((field) => field.id));
  const extras = Object.entries(entry.values).filter(
    ([key, value]) => !knownFieldIds.has(key) && String(value || "").trim()
  );
  if (extras.length > 0) {
    sectionLines.push("## Additional Fields");
    sectionLines.push("");
    for (const [key, value] of extras) {
      sectionLines.push(`### ${key}`);
      sectionLines.push("");
      sectionLines.push(String(value || "").trim());
      sectionLines.push("");
    }
  }

  if (sectionLines.length === 0) {
    sectionLines.push("No review values captured yet.");
    sectionLines.push("");
  }

  return sectionLines.join("\n").trimEnd();
}

function kpiFrontmatter(snapshotDate: string): string {
  const exportedAt = new Date().toISOString();
  return [
    "---",
    "kind: kpi_snapshot",
    `snapshot_date: ${snapshotDate}`,
    'source: "project-fremen-dashboard"',
    `exported_at: "${exportedAt}"`,
    'projects: ["Project Fremen"]',
    'subjects: ["Operations", "KPI"]',
    "---"
  ].join("\n");
}

function renderKpiBody(): Promise<string> {
  return readKpis().then((kpis) => {
    const lines: string[] = [];
    lines.push("# KPI Snapshot");
    lines.push("");
    lines.push("| Entity | KPI | Value | Updated |");
    lines.push("|---|---|---|---|");
    for (const item of kpis) {
      const entity = item.entity.replace(/\|/g, "\\|");
      const name = item.name.replace(/\|/g, "\\|");
      const value = item.value.replace(/\|/g, "\\|");
      const updated = item.updatedAt.replace(/\|/g, "\\|");
      lines.push(`| ${entity} | ${name} | ${value} | ${updated} |`);
    }
    lines.push("");
    return lines.join("\n");
  });
}

async function plannedReviewTargets(rootDir: string): Promise<
  Array<{ entry: ReviewEntry; kind: ExportItemKind; targetPath: string; content: string }>
> {
  const reviews = await readReviews();
  const plan: Array<{ entry: ReviewEntry; kind: ExportItemKind; targetPath: string; content: string }> = [];

  for (const entry of reviews) {
    const subdir = path.join(rootDir, "reviews", entry.kind);
    const baseName = `${entry.scheduledFor}__${sanitizeFileToken(entry.id)}.md`;
    const basePath = path.join(subdir, baseName);
    const targetPath = await resolveUniquePath(basePath);
    const content = `${reviewFrontmatter(entry)}\n\n${renderReviewBody(entry)}\n`;
    plan.push({
      entry,
      kind: entry.kind,
      targetPath,
      content
    });
  }

  return plan;
}

async function plannedKpiTarget(rootDir: string): Promise<{
  sourceId: string;
  targetPath: string;
  content: string;
}> {
  const snapshotDate = todayIsoDate();
  const subdir = path.join(rootDir, "kpis");
  const basePath = path.join(subdir, `${snapshotDate}__kpi-snapshot.md`);
  const targetPath = await resolveUniquePath(basePath);
  const body = await renderKpiBody();
  const content = `${kpiFrontmatter(snapshotDate)}\n\n${body}`;
  return {
    sourceId: `kpi_snapshot:${snapshotDate}`,
    targetPath,
    content
  };
}

export async function runObsidianExport(mode: ExportMode): Promise<ObsidianExportResult> {
  const rootDir = exportRootDir();
  const reviewPlan = await plannedReviewTargets(rootDir);
  const kpiPlan = await plannedKpiTarget(rootDir);

  const items: ObsidianExportItem[] = [
    ...reviewPlan.map((item) => ({
      kind: item.kind,
      sourceId: item.entry.id,
      targetPath: item.targetPath
    })),
    {
      kind: "kpi_snapshot",
      sourceId: kpiPlan.sourceId,
      targetPath: kpiPlan.targetPath
    }
  ];

  if (mode === "write") {
    for (const item of reviewPlan) {
      await mkdir(path.dirname(item.targetPath), { recursive: true });
      await writeFile(item.targetPath, item.content, "utf8");
    }
    await mkdir(path.dirname(kpiPlan.targetPath), { recursive: true });
    await writeFile(kpiPlan.targetPath, kpiPlan.content, "utf8");
  }

  return {
    mode,
    rootDir,
    items
  };
}

