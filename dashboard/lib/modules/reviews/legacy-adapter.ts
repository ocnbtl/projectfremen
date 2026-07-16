import type { ReviewEntry } from "../../types";
import type {
  LegacyReviewRunProjection,
  ReviewCadence,
  ReviewRunCreateInput,
  ReviewStructuredSummary
} from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function localDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number): string {
  const parsed = localDate(value);
  if (!parsed) return value;
  parsed.setDate(parsed.getDate() + days);
  return iso(parsed);
}

function parseWeekRange(value: string | undefined): { start: string; end: string } | null {
  const match = value?.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(?:to|–|—|-)\s+(\d{4}-\d{2}-\d{2})$/i);
  if (!match || !localDate(match[1]) || !localDate(match[2]) || match[1] > match[2]) return null;
  return { start: match[1], end: match[2] };
}

function parseMonth(value: string | undefined): { start: string; end: string } | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = new Date(`1 ${normalized}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
  return { start: iso(start), end: iso(end) };
}

export function legacyReviewPeriod(entry: ReviewEntry): { start: string; end: string } {
  if (entry.kind === "weekly") {
    return parseWeekRange(entry.values.weekRange) || {
      start: addDays(entry.scheduledFor, -7),
      end: addDays(entry.scheduledFor, -1)
    };
  }

  const explicitMonth = parseMonth(entry.values.month);
  if (explicitMonth) return explicitMonth;
  const scheduled = localDate(entry.scheduledFor);
  if (!scheduled) return { start: entry.scheduledFor, end: entry.scheduledFor };
  const start = new Date(scheduled.getFullYear(), scheduled.getMonth() - 1, 1);
  const end = new Date(scheduled.getFullYear(), scheduled.getMonth(), 0);
  return { start: iso(start), end: iso(end) };
}

function labelledValues(entry: ReviewEntry): string {
  return Object.entries(entry.values)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${key}: ${value.trim()}`)
    .join("\n\n");
}

export function legacyReviewSummary(entry: ReviewEntry): ReviewStructuredSummary {
  if (entry.kind === "weekly") {
    const projectFocus = [
      entry.values.projectFremenGoal,
      entry.values.projectIceflakeGoal,
      entry.values.projectPintGoal
    ].filter(Boolean).join("\n");
    return {
      summary: entry.values.topOutcomes?.trim() || labelledValues(entry),
      wins: entry.values.topOutcomes?.trim() || "",
      blockers: entry.values.blockers?.trim() || "",
      decisions: entry.values.decisions?.trim() || "",
      carryForward: entry.values.carryToMonthly?.trim() || "",
      nextFocus: projectFocus
    };
  }

  return {
    summary: entry.values.notes?.trim() || labelledValues(entry),
    wins: entry.values.wins?.trim() || "",
    blockers: [entry.values.misses, entry.values.rootCauses].filter(Boolean).join("\n"),
    decisions: "",
    carryForward: "",
    nextFocus: entry.values.nextOutcomes?.trim() || ""
  };
}

export function legacyReviewToProjection(entry: ReviewEntry): LegacyReviewRunProjection {
  const period = legacyReviewPeriod(entry);
  const summary = legacyReviewSummary(entry);
  return {
    reviewId: `legacy:${entry.id}`,
    legacyReviewEntryId: entry.id,
    cadence: entry.kind,
    title: entry.kind === "weekly" ? "Weekly Review" : "Monthly Review",
    scheduledFor: entry.scheduledFor,
    periodStart: period.start,
    periodEnd: period.end,
    summary: summary.summary,
    rawValues: { ...entry.values },
    lifecycle: "legacy_read_only",
    updatedAt: entry.updatedAt,
    route: `/admin/reviews/${entry.kind}/${encodeURIComponent(entry.id)}`
  };
}

export function legacyReviewsToProjections(entries: ReviewEntry[]): LegacyReviewRunProjection[] {
  return entries.map(legacyReviewToProjection);
}

export function legacyReviewToCreateInput(entry: ReviewEntry): ReviewRunCreateInput {
  const period = legacyReviewPeriod(entry);
  return {
    cadence: entry.kind as ReviewCadence,
    title: entry.kind === "weekly" ? "Weekly Review" : "Monthly Review",
    periodStart: period.start,
    periodEnd: period.end,
    dueAt: entry.scheduledFor,
    ownerId: entry.values.reviewer?.trim() || "admin",
    current: false
  };
}
