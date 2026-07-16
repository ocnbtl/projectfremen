import type {
  FinanceAccount,
  FinanceFixtureDataset,
  FinanceTransaction,
  FinanceTransactionDirection
} from "./types";

export type FinanceTransactionsFilter =
  | "all"
  | "pending"
  | "cleared"
  | "income"
  | "expense"
  | "transfer"
  | "savings"
  | "reimbursable"
  | "receipt-missing";

export type FinanceTransactionsSort =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "merchant-asc";

export interface FinanceTransactionsViewInput {
  readonly query?: string;
  readonly filter?: string;
  readonly sort?: string;
  readonly selectedId?: string;
}

export interface FinanceTransactionAccountFixtureMatch {
  /** Equality is against a fixture display name, not an account reference ID. */
  readonly matchBasis: "fixture-display-name";
  readonly durableLink: false;
  readonly transactionAccountDisplayName: string;
  readonly account: FinanceAccount | null;
}

export interface FinanceTransactionsViewModel {
  readonly query: string;
  readonly filter: FinanceTransactionsFilter;
  readonly sort: FinanceTransactionsSort;
  readonly sourceCount: number;
  readonly visibleCount: number;
  readonly rows: readonly FinanceTransaction[];
  readonly selectedId: string | null;
  readonly selected: FinanceTransaction | null;
  readonly selectedAccountFixtureMatch: FinanceTransactionAccountFixtureMatch | null;
  readonly selectionBasis: "requested-visible-id" | "first-pending-in-fixture-order" | "first-visible-in-fixture-order" | null;
  readonly counts: {
    readonly pending: number;
    readonly cleared: number;
    readonly income: number;
    readonly expense: number;
    readonly transfer: number;
    readonly savings: number;
    readonly reimbursable: number;
    readonly receiptMissing: number;
  };
  readonly totals: {
    readonly income: number;
    readonly spending: number;
    readonly transferMovement: number;
    readonly savingsMovement: number;
    readonly net: number;
  };
}

const DEFAULT_FILTER: FinanceTransactionsFilter = "all";
const DEFAULT_SORT: FinanceTransactionsSort = "date-desc";

function normalizeFilter(value: string | undefined): FinanceTransactionsFilter {
  if (
    value === "pending"
    || value === "cleared"
    || value === "income"
    || value === "expense"
    || value === "transfer"
    || value === "savings"
    || value === "reimbursable"
    || value === "receipt-missing"
  ) {
    return value;
  }
  return DEFAULT_FILTER;
}

function normalizeSort(value: string | undefined): FinanceTransactionsSort {
  if (
    value === "date-asc"
    || value === "amount-desc"
    || value === "amount-asc"
    || value === "merchant-asc"
  ) {
    return value;
  }
  return DEFAULT_SORT;
}

function matchesFilter(transaction: FinanceTransaction, filter: FinanceTransactionsFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pending" || filter === "cleared") return transaction.status === filter;
  if (filter === "reimbursable") return transaction.reimbursable;
  if (filter === "receipt-missing") return !transaction.receipt.trim();
  return transaction.io === filter;
}

function transactionSearchText(transaction: FinanceTransaction): string {
  return [
    transaction.id,
    transaction.date,
    transaction.quarter,
    transaction.quarterYear,
    transaction.week,
    transaction.weekYear,
    transaction.weekdayName,
    transaction.entity,
    transaction.merchant,
    transaction.account,
    transaction.accountType,
    transaction.category,
    transaction.spendCategory,
    transaction.amount,
    transaction.io,
    transaction.memo,
    transaction.receipt,
    transaction.incomeSource,
    transaction.status,
    transaction.reimbursable ? "reimbursable" : ""
  ].join(" ").toLowerCase();
}

function sumDirection(
  rows: readonly FinanceTransaction[],
  direction: FinanceTransactionDirection
): number {
  return rows
    .filter((transaction) => transaction.io === direction)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function buildFinanceTransactionsViewModel(
  dataset: FinanceFixtureDataset,
  input: FinanceTransactionsViewInput = {}
): FinanceTransactionsViewModel {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filter = normalizeFilter(input.filter);
  const sort = normalizeSort(input.sort);
  const visibleWithSourceOrder = dataset.transactions
    .map((transaction, sourceIndex) => ({ transaction, sourceIndex }))
    .filter(({ transaction }) => matchesFilter(transaction, filter))
    .filter(({ transaction }) => !query || transactionSearchText(transaction).includes(query))
    .sort((left, right) => {
      if (sort === "date-asc") return right.sourceIndex - left.sourceIndex;
      if (sort === "amount-desc") {
        return right.transaction.amount - left.transaction.amount || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "amount-asc") {
        return left.transaction.amount - right.transaction.amount || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "merchant-asc") {
        return left.transaction.merchant.localeCompare(right.transaction.merchant)
          || left.sourceIndex - right.sourceIndex;
      }
      return left.sourceIndex - right.sourceIndex;
    });
  const rows = visibleWithSourceOrder.map(({ transaction }) => transaction);
  const hasRequestedSelection = input.selectedId !== undefined;
  const requestedSelection = input.selectedId
    ? rows.find((transaction) => transaction.id === input.selectedId) ?? null
    : null;
  const pendingSelection = dataset.transactions.find(
    (transaction) => transaction.status === "pending" && rows.some((row) => row.id === transaction.id)
  ) ?? null;
  const firstSourceSelection = dataset.transactions.find(
    (transaction) => rows.some((row) => row.id === transaction.id)
  ) ?? null;
  const selected = hasRequestedSelection
    ? requestedSelection
    : pendingSelection ?? firstSourceSelection;
  const selectionBasis = requestedSelection
    ? "requested-visible-id" as const
    : hasRequestedSelection
      ? null
      : pendingSelection
      ? "first-pending-in-fixture-order" as const
      : firstSourceSelection
        ? "first-visible-in-fixture-order" as const
        : null;
  const selectedAccountFixtureMatch = selected
    ? {
        matchBasis: "fixture-display-name" as const,
        durableLink: false as const,
        transactionAccountDisplayName: selected.account,
        account: dataset.accounts.find((account) => account.name === selected.account) ?? null
      }
    : null;

  return {
    query,
    filter,
    sort,
    sourceCount: dataset.transactions.length,
    visibleCount: rows.length,
    rows,
    selectedId: selected?.id ?? null,
    selected,
    selectedAccountFixtureMatch,
    selectionBasis,
    counts: {
      pending: rows.filter((transaction) => transaction.status === "pending").length,
      cleared: rows.filter((transaction) => transaction.status === "cleared").length,
      income: rows.filter((transaction) => transaction.io === "income").length,
      expense: rows.filter((transaction) => transaction.io === "expense").length,
      transfer: rows.filter((transaction) => transaction.io === "transfer").length,
      savings: rows.filter((transaction) => transaction.io === "savings").length,
      reimbursable: rows.filter((transaction) => transaction.reimbursable).length,
      receiptMissing: rows.filter((transaction) => !transaction.receipt.trim()).length
    },
    totals: {
      income: sumDirection(rows, "income"),
      spending: rows
        .filter((transaction) => transaction.io === "expense")
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
      transferMovement: sumDirection(rows, "transfer"),
      savingsMovement: sumDirection(rows, "savings"),
      net: rows.reduce((sum, transaction) => sum + transaction.amount, 0)
    }
  };
}
