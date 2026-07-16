import type { FinanceBudget, FinanceFixtureDataset } from "./types";

export type FinanceBudgetsFilter = "all" | "over-budget" | "at-or-under-budget";
export type FinanceBudgetsSort =
  | "attention"
  | "spent-desc"
  | "limit-desc"
  | "remaining-asc"
  | "category-asc";

export interface FinanceBudgetsViewInput {
  readonly query?: string;
  readonly filter?: string;
  readonly sort?: string;
  readonly selectedId?: string;
}

export interface FinanceBudgetRowViewModel {
  readonly budget: FinanceBudget;
  readonly remaining: number;
  /** Exact ratio for display formatting; null when the cap is zero. */
  readonly usedPercent: number | null;
  /** No approved fixture forecast formula exists. */
  readonly forecast: null;
}

export interface FinanceBudgetsViewModel {
  readonly query: string;
  readonly filter: FinanceBudgetsFilter;
  readonly sort: FinanceBudgetsSort;
  readonly sourceCount: number;
  readonly visibleCount: number;
  readonly rows: readonly FinanceBudgetRowViewModel[];
  readonly selectedId: string | null;
  readonly selected: FinanceBudgetRowViewModel | null;
  readonly selectionBasis: "requested-visible-id" | "highest-literal-utilization" | null;
  readonly counts: {
    readonly overBudget: number;
    readonly atOrUnderBudget: number;
  };
  readonly totals: {
    readonly spent: number;
    readonly limit: number;
    readonly remaining: number;
    readonly usedPercent: number | null;
    readonly forecast: null;
  };
}

const DEFAULT_FILTER: FinanceBudgetsFilter = "all";
const DEFAULT_SORT: FinanceBudgetsSort = "attention";

function normalizeFilter(value: string | undefined): FinanceBudgetsFilter {
  if (value === "over-budget" || value === "at-or-under-budget") return value;
  return DEFAULT_FILTER;
}

function normalizeSort(value: string | undefined): FinanceBudgetsSort {
  if (
    value === "spent-desc"
    || value === "limit-desc"
    || value === "remaining-asc"
    || value === "category-asc"
  ) {
    return value;
  }
  return DEFAULT_SORT;
}

function toRow(budget: FinanceBudget): FinanceBudgetRowViewModel {
  return {
    budget,
    remaining: budget.limit - budget.spent,
    usedPercent: budget.limit === 0 ? null : budget.spent / budget.limit * 100,
    forecast: null
  };
}

function matchesFilter(row: FinanceBudgetRowViewModel, filter: FinanceBudgetsFilter): boolean {
  if (filter === "all") return true;
  if (filter === "over-budget") return row.remaining < 0;
  return row.remaining >= 0;
}

function budgetSearchText(row: FinanceBudgetRowViewModel): string {
  return `${row.budget.id} ${row.budget.category} ${row.budget.spent} ${row.budget.limit} ${row.remaining}`.toLowerCase();
}

function literalUtilization(row: FinanceBudgetRowViewModel): number {
  if (row.usedPercent !== null) return row.usedPercent;
  return row.budget.spent > 0 ? Number.MAX_VALUE : 0;
}

export function buildFinanceBudgetsViewModel(
  dataset: FinanceFixtureDataset,
  input: FinanceBudgetsViewInput = {}
): FinanceBudgetsViewModel {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filter = normalizeFilter(input.filter);
  const sort = normalizeSort(input.sort);
  const visibleWithSourceOrder = dataset.budgets
    .map((budget, sourceIndex) => ({ row: toRow(budget), sourceIndex }))
    .filter(({ row }) => matchesFilter(row, filter))
    .filter(({ row }) => !query || budgetSearchText(row).includes(query))
    .sort((left, right) => {
      if (sort === "spent-desc") {
        return right.row.budget.spent - left.row.budget.spent || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "limit-desc") {
        return right.row.budget.limit - left.row.budget.limit || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "remaining-asc") {
        return left.row.remaining - right.row.remaining || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "category-asc") {
        return left.row.budget.category.localeCompare(right.row.budget.category)
          || left.sourceIndex - right.sourceIndex;
      }
      return literalUtilization(right.row) - literalUtilization(left.row)
        || left.sourceIndex - right.sourceIndex;
    });
  const rows = visibleWithSourceOrder.map(({ row }) => row);
  const hasRequestedSelection = input.selectedId !== undefined;
  const requestedSelection = input.selectedId
    ? rows.find((row) => row.budget.id === input.selectedId) ?? null
    : null;
  const utilizationSelection = [...visibleWithSourceOrder]
    .sort((left, right) => literalUtilization(right.row) - literalUtilization(left.row)
      || left.sourceIndex - right.sourceIndex)[0]?.row ?? null;
  const selected = hasRequestedSelection ? requestedSelection : utilizationSelection;
  const totalSpent = rows.reduce((sum, row) => sum + row.budget.spent, 0);
  const totalLimit = rows.reduce((sum, row) => sum + row.budget.limit, 0);

  return {
    query,
    filter,
    sort,
    sourceCount: dataset.budgets.length,
    visibleCount: rows.length,
    rows,
    selectedId: selected?.budget.id ?? null,
    selected,
    selectionBasis: requestedSelection
      ? "requested-visible-id"
      : hasRequestedSelection
        ? null
        : utilizationSelection
        ? "highest-literal-utilization"
        : null,
    counts: {
      overBudget: rows.filter((row) => row.remaining < 0).length,
      atOrUnderBudget: rows.filter((row) => row.remaining >= 0).length
    },
    totals: {
      spent: totalSpent,
      limit: totalLimit,
      remaining: totalLimit - totalSpent,
      usedPercent: totalLimit === 0 ? null : totalSpent / totalLimit * 100,
      forecast: null
    }
  };
}
