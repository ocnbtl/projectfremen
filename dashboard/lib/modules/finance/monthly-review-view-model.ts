import type {
  FinanceFixtureDataset,
  FinanceReminder,
  FinanceReviewItem
} from "./types";

export type FinanceMonthlyReviewFilter = "all" | "open" | "complete";
export type FinanceMonthlyReviewSort = "open-first" | "source-order" | "label-asc";

export interface FinanceMonthlyReviewViewInput {
  readonly query?: string;
  readonly filter?: string;
  readonly sort?: string;
  readonly selectedId?: string;
}

export interface FinanceCloseChecklistRowViewModel {
  readonly item: FinanceReviewItem;
  readonly isComplete: boolean;
  /** The fixture has only a literal done flag; it has no required/optional field. */
  readonly isLiteralBlocker: boolean;
  readonly blockerBasis: "incomplete-fixture-checklist-item" | null;
}

export interface FinanceMonthlyReviewViewModel {
  readonly query: string;
  readonly filter: FinanceMonthlyReviewFilter;
  readonly sort: FinanceMonthlyReviewSort;
  readonly sourceCount: number;
  readonly visibleCount: number;
  readonly rows: readonly FinanceCloseChecklistRowViewModel[];
  readonly selectedId: string | null;
  readonly selected: FinanceCloseChecklistRowViewModel | null;
  readonly selectionBasis: "requested-visible-id" | "first-open-in-fixture-order" | "first-visible-in-fixture-order" | null;
  /** Completion is a literal count, not a weighted readiness score. */
  readonly completion: {
    readonly complete: number;
    readonly open: number;
    readonly total: number;
    readonly ratioLabel: string;
  };
  /** Visible-scope counts after query/filter; never presented as overall close completion. */
  readonly visibleCompletion: {
    readonly complete: number;
    readonly open: number;
    readonly total: number;
    readonly ratioLabel: string;
  };
  /** Overall blockers remain visible even if the checklist is locally filtered. */
  readonly overallLiteralBlockers: readonly FinanceCloseChecklistRowViewModel[];
  readonly savings: {
    readonly actualSnapshotMovement: {
      readonly amount: number;
      readonly source: "fixture-snapshot-month-saved";
    };
    readonly proposalReminders: {
      readonly source: "fixture-reminder-text-match";
      readonly persistedMovement: false;
      readonly rows: readonly FinanceReminder[];
    };
  };
}

const DEFAULT_FILTER: FinanceMonthlyReviewFilter = "all";
const DEFAULT_SORT: FinanceMonthlyReviewSort = "open-first";

function normalizeFilter(value: string | undefined): FinanceMonthlyReviewFilter {
  if (value === "open" || value === "complete") return value;
  return DEFAULT_FILTER;
}

function normalizeSort(value: string | undefined): FinanceMonthlyReviewSort {
  if (value === "source-order" || value === "label-asc") return value;
  return DEFAULT_SORT;
}

function toRow(item: FinanceReviewItem): FinanceCloseChecklistRowViewModel {
  return {
    item,
    isComplete: item.done,
    isLiteralBlocker: !item.done,
    blockerBasis: item.done ? null : "incomplete-fixture-checklist-item"
  };
}

function matchesFilter(row: FinanceCloseChecklistRowViewModel, filter: FinanceMonthlyReviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return !row.isComplete;
  return row.isComplete;
}

function isSavingsProposalReminder(reminder: FinanceReminder): boolean {
  const text = reminder.text.toLowerCase();
  return reminder.kind === "action"
    && (text.includes("surplus") || text.includes("savings"))
    && (text.includes("reserve") || text.includes("move") || text.includes("transfer"));
}

export function buildFinanceMonthlyReviewViewModel(
  dataset: FinanceFixtureDataset,
  input: FinanceMonthlyReviewViewInput = {}
): FinanceMonthlyReviewViewModel {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filter = normalizeFilter(input.filter);
  const sort = normalizeSort(input.sort);
  const allRowsWithSourceOrder = dataset.reviewItems.map((item, sourceIndex) => ({
    row: toRow(item),
    sourceIndex
  }));
  const visibleWithSourceOrder = allRowsWithSourceOrder
    .filter(({ row }) => matchesFilter(row, filter))
    .filter(({ row }) => !query || `${row.item.id} ${row.item.label}`.toLowerCase().includes(query))
    .sort((left, right) => {
      if (sort === "source-order") return left.sourceIndex - right.sourceIndex;
      if (sort === "label-asc") {
        return left.row.item.label.localeCompare(right.row.item.label)
          || left.sourceIndex - right.sourceIndex;
      }
      return Number(left.row.isComplete) - Number(right.row.isComplete)
        || left.sourceIndex - right.sourceIndex;
    });
  const rows = visibleWithSourceOrder.map(({ row }) => row);
  const hasRequestedSelection = input.selectedId !== undefined;
  const requestedSelection = input.selectedId
    ? rows.find((row) => row.item.id === input.selectedId) ?? null
    : null;
  const openSelection = allRowsWithSourceOrder.find(
    ({ row }) => row.isLiteralBlocker && rows.some((visibleRow) => visibleRow.item.id === row.item.id)
  )?.row ?? null;
  const firstSourceSelection = allRowsWithSourceOrder.find(
    ({ row }) => rows.some((visibleRow) => visibleRow.item.id === row.item.id)
  )?.row ?? null;
  const selected = hasRequestedSelection
    ? requestedSelection
    : openSelection ?? firstSourceSelection;
  const visibleComplete = rows.filter((row) => row.isComplete).length;
  const overallComplete = allRowsWithSourceOrder.filter(({ row }) => row.isComplete).length;

  return {
    query,
    filter,
    sort,
    sourceCount: dataset.reviewItems.length,
    visibleCount: rows.length,
    rows,
    selectedId: selected?.item.id ?? null,
    selected,
    selectionBasis: requestedSelection
      ? "requested-visible-id"
      : hasRequestedSelection
        ? null
        : openSelection
        ? "first-open-in-fixture-order"
        : firstSourceSelection
          ? "first-visible-in-fixture-order"
          : null,
    completion: {
      complete: overallComplete,
      open: allRowsWithSourceOrder.length - overallComplete,
      total: allRowsWithSourceOrder.length,
      ratioLabel: `${overallComplete} / ${allRowsWithSourceOrder.length}`
    },
    visibleCompletion: {
      complete: visibleComplete,
      open: rows.length - visibleComplete,
      total: rows.length,
      ratioLabel: `${visibleComplete} / ${rows.length}`
    },
    overallLiteralBlockers: allRowsWithSourceOrder
      .filter(({ row }) => row.isLiteralBlocker)
      .map(({ row }) => row),
    savings: {
      actualSnapshotMovement: {
        amount: dataset.snapshot.monthSaved,
        source: "fixture-snapshot-month-saved"
      },
      proposalReminders: {
        source: "fixture-reminder-text-match",
        persistedMovement: false,
        rows: dataset.reminders.filter(isSavingsProposalReminder)
      }
    }
  };
}
