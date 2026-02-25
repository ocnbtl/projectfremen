import type { ReviewKind } from "./types";

export type ReviewField = {
  id: string;
  label: string;
  description: string;
  placeholder?: string;
  rows?: number;
};

const WEEKLY_FIELDS: ReviewField[] = [
  {
    id: "reviewer",
    label: "Reviewer",
    description: "Who completed this review (usually you).",
    placeholder: "Me",
    rows: 1
  },
  {
    id: "weekRange",
    label: "Week Range",
    description: "The date range this review covers.",
    placeholder: "YYYY-MM-DD to YYYY-MM-DD",
    rows: 1
  },
  {
    id: "topOutcomes",
    label: "Top 3 Outcomes This Week",
    description: "The most important things you got done this week.",
    placeholder: "1) ...\n2) ...\n3) ...",
    rows: 4
  },
  {
    id: "projectFremenGoal",
    label: "Project Fremen Goal",
    description: "Main goal for Unigentamos this week and current status.",
    placeholder: "Goal + result",
    rows: 3
  },
  {
    id: "projectIceflakeGoal",
    label: "Project Iceflake Goal",
    description: "Main goal for pngwn this week and current status.",
    placeholder: "Goal + result",
    rows: 3
  },
  {
    id: "projectPintGoal",
    label: "Project Pint Goal",
    description: "Main goal for Diyesu Decor this week and current status.",
    placeholder: "Goal + result",
    rows: 3
  },
  {
    id: "blockers",
    label: "Blockers",
    description: "Anything slowing progress down right now.",
    placeholder: "List current blockers",
    rows: 4
  },
  {
    id: "decisions",
    label: "Decisions Made",
    description: "Important calls you made this week and why.",
    placeholder: "List key decisions",
    rows: 4
  },
  {
    id: "carryToMonthly",
    label: "Notes to Carry Into Monthly Review",
    description: "Weekly notes that should be remembered at month-end.",
    placeholder: "What should carry forward",
    rows: 4
  }
];

const MONTHLY_FIELDS: ReviewField[] = [
  {
    id: "reviewer",
    label: "Reviewer",
    description: "Who completed this monthly review.",
    placeholder: "Me",
    rows: 1
  },
  {
    id: "month",
    label: "Month",
    description: "The month this review is summarizing.",
    placeholder: "March 2026",
    rows: 1
  },
  {
    id: "wins",
    label: "Top 3 Wins",
    description: "Biggest positive outcomes from this month.",
    placeholder: "1) ...\n2) ...\n3) ...",
    rows: 4
  },
  {
    id: "misses",
    label: "Top 3 Misses",
    description: "Main things that did not go as planned.",
    placeholder: "1) ...\n2) ...\n3) ...",
    rows: 4
  },
  {
    id: "rootCauses",
    label: "Root Causes Found",
    description: "Why those misses happened (not just what happened).",
    placeholder: "Cause + evidence",
    rows: 4
  },
  {
    id: "nextOutcomes",
    label: "Next Month Outcomes",
    description: "Top priorities for next month.",
    placeholder: "1) ...\n2) ...\n3) ...",
    rows: 4
  },
  {
    id: "ownership",
    label: "Ownership Plan (Me / AI Agent / Auto)",
    description: "Who owns each next-month outcome.",
    placeholder: "Outcome -> Owner",
    rows: 4
  },
  {
    id: "notes",
    label: "Notes",
    description: "Anything else you want to keep for future reference.",
    placeholder: "Anything else",
    rows: 4
  }
];

export function getReviewFields(kind: ReviewKind): ReviewField[] {
  return kind === "weekly" ? WEEKLY_FIELDS : MONTHLY_FIELDS;
}
