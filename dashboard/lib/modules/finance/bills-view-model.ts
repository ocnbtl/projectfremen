import type {
  FinanceAccount,
  FinanceBill,
  FinanceBillStatus,
  FinanceFixtureDataset,
  FinanceRecurringCadence
} from "./types";

export type FinanceBillsFilter =
  | "all"
  | "overdue"
  | "due"
  | "due-or-overdue"
  | "due-this-week"
  | "scheduled"
  | "paid"
  | "recurring"
  | "manual"
  | "autopay";

export type FinanceBillsSort =
  | "urgency"
  | "due-soon"
  | "amount-desc"
  | "amount-asc"
  | "name-asc";

export interface FinanceBillsViewInput {
  readonly query?: string;
  readonly filter?: string;
  readonly sort?: string;
  readonly selectedId?: string;
}

export interface FinanceBillRowViewModel {
  readonly bill: FinanceBill;
  readonly monthlyEquivalent: number;
}

export interface FinanceBillAccountFixtureMatch {
  /** Equality is against a fixture display name, not an account reference ID. */
  readonly matchBasis: "fixture-display-name";
  readonly durableLink: false;
  readonly billAccountDisplayName: string;
  readonly account: FinanceAccount | null;
}

export interface FinanceBillsViewModel {
  readonly query: string;
  readonly filter: FinanceBillsFilter;
  readonly sort: FinanceBillsSort;
  readonly sourceCount: number;
  readonly visibleCount: number;
  readonly rows: readonly FinanceBillRowViewModel[];
  readonly selectedId: string | null;
  readonly selected: FinanceBillRowViewModel | null;
  readonly selectedAccountFixtureMatch: FinanceBillAccountFixtureMatch | null;
  readonly selectionBasis: "requested-visible-id" | "highest-urgency-unresolved" | "first-visible" | null;
  readonly counts: {
    readonly overdue: number;
    readonly due: number;
    readonly dueThisWeek: number;
    readonly scheduled: number;
    readonly paid: number;
    readonly recurring: number;
    readonly autopay: number;
    readonly manual: number;
  };
  readonly totals: {
    readonly nominalAmount: number;
    readonly monthlyRecurring: number;
  };
}

const DEFAULT_FILTER: FinanceBillsFilter = "all";
const DEFAULT_SORT: FinanceBillsSort = "urgency";

function normalizeFilter(value: string | undefined): FinanceBillsFilter {
  if (
    value === "overdue"
    || value === "due"
    || value === "due-or-overdue"
    || value === "due-this-week"
    || value === "scheduled"
    || value === "paid"
    || value === "recurring"
    || value === "manual"
    || value === "autopay"
  ) {
    return value;
  }
  return DEFAULT_FILTER;
}

function normalizeSort(value: string | undefined): FinanceBillsSort {
  if (
    value === "due-soon"
    || value === "amount-desc"
    || value === "amount-asc"
    || value === "name-asc"
  ) {
    return value;
  }
  return DEFAULT_SORT;
}

/**
 * Converts a recurring fixture amount to a monthly equivalent. The conversion
 * is explicit for every cadence; non-recurring (`null`) rows contribute zero.
 */
export function getFinanceBillMonthlyEquivalent(
  bill: Pick<FinanceBill, "amount" | "recurring">
): number {
  const cadence: FinanceRecurringCadence = bill.recurring;
  switch (cadence) {
    case "monthly":
      return bill.amount;
    case "annual":
      return bill.amount / 12;
    case "weekly":
      return bill.amount * 52 / 12;
    case null:
      return 0;
    default: {
      const exhaustiveCadence: never = cadence;
      return exhaustiveCadence;
    }
  }
}

function billStatusPriority(status: FinanceBillStatus): number {
  if (status === "overdue") return 0;
  if (status === "due") return 1;
  if (status === "soon") return 2;
  if (status === "scheduled") return 3;
  return 4;
}

function isDueThisWeek(bill: FinanceBill): boolean {
  return bill.status !== "paid"
    && bill.status !== "overdue"
    && bill.dueIn >= 0
    && bill.dueIn <= 7;
}

function matchesFilter(bill: FinanceBill, filter: FinanceBillsFilter): boolean {
  if (filter === "all") return true;
  if (filter === "due-or-overdue") return bill.status === "due" || bill.status === "overdue";
  if (filter === "due-this-week") return isDueThisWeek(bill);
  if (filter === "recurring") return bill.recurring !== null;
  if (filter === "manual") return !bill.autopay;
  if (filter === "autopay") return bill.autopay;
  return bill.status === filter;
}

function billSearchText(bill: FinanceBill): string {
  return `${bill.id} ${bill.name} ${bill.amount} ${bill.due} ${bill.status} ${bill.account} ${bill.category} ${bill.recurring ?? "not recurring"} ${bill.autopay ? "autopay" : "manual"}`.toLowerCase();
}

export function buildFinanceBillsViewModel(
  dataset: FinanceFixtureDataset,
  input: FinanceBillsViewInput = {}
): FinanceBillsViewModel {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filter = normalizeFilter(input.filter);
  const sort = normalizeSort(input.sort);
  const visibleWithSourceOrder = dataset.bills
    .map((bill, sourceIndex) => ({
      row: { bill, monthlyEquivalent: getFinanceBillMonthlyEquivalent(bill) } satisfies FinanceBillRowViewModel,
      sourceIndex
    }))
    .filter(({ row }) => matchesFilter(row.bill, filter))
    .filter(({ row }) => !query || billSearchText(row.bill).includes(query))
    .sort((left, right) => {
      if (sort === "due-soon") {
        return left.row.bill.dueIn - right.row.bill.dueIn || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "amount-desc") {
        return right.row.bill.amount - left.row.bill.amount || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "amount-asc") {
        return left.row.bill.amount - right.row.bill.amount || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "name-asc") {
        return left.row.bill.name.localeCompare(right.row.bill.name) || left.sourceIndex - right.sourceIndex;
      }
      return billStatusPriority(left.row.bill.status) - billStatusPriority(right.row.bill.status)
        || left.row.bill.dueIn - right.row.bill.dueIn
        || left.sourceIndex - right.sourceIndex;
    });
  const rows = visibleWithSourceOrder.map(({ row }) => row);
  const hasRequestedSelection = input.selectedId !== undefined;
  const requestedSelection = input.selectedId
    ? rows.find((row) => row.bill.id === input.selectedId) ?? null
    : null;
  const urgencySelection = [...visibleWithSourceOrder]
    .filter(({ row }) => row.bill.status !== "paid")
    .sort((left, right) => (
      billStatusPriority(left.row.bill.status) - billStatusPriority(right.row.bill.status)
      || left.row.bill.dueIn - right.row.bill.dueIn
      || left.sourceIndex - right.sourceIndex
    ))[0]?.row ?? null;
  const selected = hasRequestedSelection
    ? requestedSelection
    : urgencySelection ?? rows[0] ?? null;
  const selectionBasis = requestedSelection
    ? "requested-visible-id" as const
    : hasRequestedSelection
      ? null
      : urgencySelection
      ? "highest-urgency-unresolved" as const
      : selected
        ? "first-visible" as const
        : null;
  const selectedAccountFixtureMatch = selected
    ? {
        matchBasis: "fixture-display-name" as const,
        durableLink: false as const,
        billAccountDisplayName: selected.bill.account,
        account: dataset.accounts.find((account) => account.name === selected.bill.account) ?? null
      }
    : null;

  return {
    query,
    filter,
    sort,
    sourceCount: dataset.bills.length,
    visibleCount: rows.length,
    rows,
    selectedId: selected?.bill.id ?? null,
    selected,
    selectedAccountFixtureMatch,
    selectionBasis,
    counts: {
      overdue: rows.filter(({ bill }) => bill.status === "overdue").length,
      due: rows.filter(({ bill }) => bill.status === "due").length,
      dueThisWeek: rows.filter(({ bill }) => isDueThisWeek(bill)).length,
      scheduled: rows.filter(({ bill }) => bill.status === "scheduled").length,
      paid: rows.filter(({ bill }) => bill.status === "paid").length,
      recurring: rows.filter(({ bill }) => bill.recurring !== null).length,
      autopay: rows.filter(({ bill }) => bill.autopay).length,
      manual: rows.filter(({ bill }) => !bill.autopay).length
    },
    totals: {
      nominalAmount: rows.reduce((sum, { bill }) => sum + bill.amount, 0),
      monthlyRecurring: rows.reduce((sum, row) => sum + row.monthlyEquivalent, 0)
    }
  };
}
