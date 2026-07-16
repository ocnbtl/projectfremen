import { getFinanceBillMonthlyEquivalent } from "./bills-view-model";
import type {
  FinanceAccount,
  FinanceAccountKind,
  FinanceBill,
  FinanceFixtureDataset,
  FinanceTransaction
} from "./types";

export type FinanceAccountsFilter =
  | "all"
  | "cash-and-deposits"
  | "credit-and-liabilities"
  | "investments-and-business";

export type FinanceAccountsSort =
  | "role"
  | "name-asc"
  | "balance-desc"
  | "balance-asc"
  | "change-desc";

export interface FinanceAccountsViewInput {
  readonly query?: string;
  readonly filter?: string;
  readonly sort?: string;
  readonly selectedId?: string;
}

export type FinanceAccountGroup =
  | "cash-and-deposits"
  | "credit-and-liabilities"
  | "investments-and-business";

export interface FinanceFixtureAccountActivity {
  /** Fixture rows carry display names rather than durable account IDs. */
  readonly matchBasis: "fixture-display-name";
  readonly durableLink: false;
  readonly accountDisplayName: string;
  readonly transactions: readonly FinanceTransaction[];
  readonly bills: readonly FinanceBill[];
  readonly totals: {
    readonly transactionNet: number;
    readonly income: number;
    readonly spending: number;
    readonly transfers: number;
    readonly savingsMovement: number;
    readonly monthlyRecurring: number;
  };
}

export interface FinanceAccountRowViewModel {
  readonly account: FinanceAccount;
  readonly group: FinanceAccountGroup;
  readonly fixtureActivity: FinanceFixtureAccountActivity;
}

export interface FinanceAccountsViewModel {
  readonly query: string;
  readonly filter: FinanceAccountsFilter;
  readonly sort: FinanceAccountsSort;
  readonly sourceCount: number;
  readonly visibleCount: number;
  readonly rows: readonly FinanceAccountRowViewModel[];
  readonly selectedId: string | null;
  readonly selected: FinanceAccountRowViewModel | null;
  readonly selectionBasis: "requested-visible-id" | "primary-operating-fixture-id" | "first-visible" | null;
  readonly totals: {
    readonly assets: number;
    /** Signed liability balance; debt remains negative in the fixture contract. */
    readonly liabilities: number;
    readonly debtOwed: number;
    readonly net: number;
    readonly liquid: number;
  };
}

const DEFAULT_FILTER: FinanceAccountsFilter = "all";
const DEFAULT_SORT: FinanceAccountsSort = "role";

function normalizeFilter(value: string | undefined): FinanceAccountsFilter {
  if (
    value === "cash-and-deposits"
    || value === "credit-and-liabilities"
    || value === "investments-and-business"
  ) {
    return value;
  }
  return DEFAULT_FILTER;
}

function normalizeSort(value: string | undefined): FinanceAccountsSort {
  if (
    value === "name-asc"
    || value === "balance-desc"
    || value === "balance-asc"
    || value === "change-desc"
  ) {
    return value;
  }
  return DEFAULT_SORT;
}

function accountGroup(kind: FinanceAccountKind): FinanceAccountGroup {
  switch (kind) {
    case "Checking":
    case "Savings":
    case "Cash":
      return "cash-and-deposits";
    case "Credit":
      return "credit-and-liabilities";
    case "Brokerage":
    case "Business":
      return "investments-and-business";
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

function isLiquidAccount(kind: FinanceAccountKind): boolean {
  switch (kind) {
    case "Checking":
    case "Savings":
    case "Cash":
    case "Business":
      return true;
    case "Credit":
    case "Brokerage":
      return false;
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

function buildFixtureActivity(
  dataset: FinanceFixtureDataset,
  account: FinanceAccount
): FinanceFixtureAccountActivity {
  const transactions = dataset.transactions.filter((transaction) => transaction.account === account.name);
  const bills = dataset.bills.filter((bill) => bill.account === account.name);

  return {
    matchBasis: "fixture-display-name",
    durableLink: false,
    accountDisplayName: account.name,
    transactions,
    bills,
    totals: {
      transactionNet: transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      income: transactions
        .filter((transaction) => transaction.io === "income")
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      spending: transactions
        .filter((transaction) => transaction.io === "expense")
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
      transfers: transactions
        .filter((transaction) => transaction.io === "transfer")
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      savingsMovement: transactions
        .filter((transaction) => transaction.io === "savings")
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      monthlyRecurring: bills.reduce(
        (sum, bill) => sum + getFinanceBillMonthlyEquivalent(bill),
        0
      )
    }
  };
}

function accountSearchText(row: FinanceAccountRowViewModel): string {
  const { account } = row;
  return `${account.id} ${account.name} ${account.kind} ${account.inst} ${account.mask}`.toLowerCase();
}

export function buildFinanceAccountsViewModel(
  dataset: FinanceFixtureDataset,
  input: FinanceAccountsViewInput = {}
): FinanceAccountsViewModel {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filter = normalizeFilter(input.filter);
  const sort = normalizeSort(input.sort);
  const rowsWithSourceOrder = dataset.accounts.map((account, sourceIndex) => ({
    row: {
      account,
      group: accountGroup(account.kind),
      fixtureActivity: buildFixtureActivity(dataset, account)
    } satisfies FinanceAccountRowViewModel,
    sourceIndex
  }));

  const visibleRows = rowsWithSourceOrder
    .filter(({ row }) => filter === "all" || row.group === filter)
    .filter(({ row }) => !query || accountSearchText(row).includes(query))
    .sort((left, right) => {
      if (sort === "name-asc") {
        return left.row.account.name.localeCompare(right.row.account.name) || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "balance-desc") {
        return right.row.account.balance - left.row.account.balance || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "balance-asc") {
        return left.row.account.balance - right.row.account.balance || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "change-desc") {
        return right.row.account.delta30 - left.row.account.delta30 || left.sourceIndex - right.sourceIndex;
      }
      return accountGroupOrder(left.row.group) - accountGroupOrder(right.row.group)
        || left.sourceIndex - right.sourceIndex;
    })
    .map(({ row }) => row);

  const hasRequestedSelection = input.selectedId !== undefined;
  const requestedSelection = input.selectedId
    ? visibleRows.find((row) => row.account.id === input.selectedId) ?? null
    : null;
  const operatingSelection = visibleRows.find((row) => row.account.id === "operating") ?? null;
  const selected = hasRequestedSelection
    ? requestedSelection
    : operatingSelection ?? visibleRows[0] ?? null;
  const selectionBasis = requestedSelection
    ? "requested-visible-id" as const
    : hasRequestedSelection
      ? null
      : operatingSelection
      ? "primary-operating-fixture-id" as const
      : selected
        ? "first-visible" as const
        : null;
  const visibleAccounts = visibleRows.map((row) => row.account);
  const liabilities = visibleAccounts
    .filter((account) => account.balance < 0)
    .reduce((sum, account) => sum + account.balance, 0);

  return {
    query,
    filter,
    sort,
    sourceCount: dataset.accounts.length,
    visibleCount: visibleRows.length,
    rows: visibleRows,
    selectedId: selected?.account.id ?? null,
    selected,
    selectionBasis,
    totals: {
      assets: visibleAccounts
        .filter((account) => account.balance > 0)
        .reduce((sum, account) => sum + account.balance, 0),
      liabilities,
      debtOwed: Math.abs(liabilities),
      net: visibleAccounts.reduce((sum, account) => sum + account.balance, 0),
      liquid: visibleAccounts
        .filter((account) => account.balance > 0 && isLiquidAccount(account.kind))
        .reduce((sum, account) => sum + account.balance, 0)
    }
  };
}

function accountGroupOrder(group: FinanceAccountGroup): number {
  if (group === "cash-and-deposits") return 0;
  if (group === "credit-and-liabilities") return 1;
  return 2;
}
