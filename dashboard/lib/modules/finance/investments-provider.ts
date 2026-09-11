import { BankingError, normalizeAccounts, plaid } from "./banking-provider";
import type { InvestmentActivity, InvestmentHolding, InvestmentSnapshot } from "./banking-types";

type Row = Record<string, unknown>;
const invalid = () => new BankingError("invalid_investments", "Investment data was incomplete or unsupported. Saved holdings and activity are preserved; try syncing again.", 502);
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Row;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw invalid();
  return value;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 300) throw invalid();
  return value;
}
function number(value: unknown, currency = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e18 || (currency && !Number.isSafeInteger(Math.round(value * 100)))) throw invalid();
  return currency ? Math.round(value * 100) / 100 : value;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw invalid();
  return value;
}
const label = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.slice(0, 240) : fallback;
function securities(value: unknown): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const entry of list(value, 10_000)) {
    const security = row(entry), key = id(security.security_id);
    if (result.has(key)) throw invalid();
    result.set(key, security);
  }
  return result;
}
function accountId(value: unknown, mapped: Set<string>): string {
  const key = id(value);
  if (!mapped.has(key)) throw invalid();
  return key;
}
function usd(entry: Row) { if (entry.iso_currency_code !== "USD") throw invalid(); }

export async function fetchInvestments(accessToken: string, mappedIds: string[], previous?: InvestmentSnapshot) {
  const mapped = new Set(mappedIds), deadline = Date.now() + 210_000;
  if (!mapped.size || mapped.size > 100) throw invalid();
  const data = row(await plaid("/investments/holdings/get", { access_token: accessToken, options: { account_ids: mappedIds } }));
  const accounts = normalizeAccounts(data.accounts as Parameters<typeof normalizeAccounts>[0], "investments");
  if (new Set(accounts.map(account => account.id)).size !== accounts.length || mappedIds.some(key => !accounts.some(account => account.id === key && account.supported))) throw invalid();
  const securityMap = securities(data.securities), holdingKeys = new Set<string>();
  const holdings: InvestmentHolding[] = list(data.holdings, 10_000).map(entry => {
    const holding = row(entry); usd(holding);
    const account = accountId(holding.account_id, mapped), securityId = id(holding.security_id), security = securityMap.get(securityId);
    const key = `${account}:${securityId}`;
    if (!security || holdingKeys.has(key)) throw invalid();
    holdingKeys.add(key);
    return { accountId: account, securityId, name: label(security.name, "Unnamed holding"), ticker: typeof security.ticker_symbol === "string" ? security.ticker_symbol.slice(0, 40) : null,
      quantity: number(holding.quantity), value: number(holding.institution_value, true), price: holding.institution_price == null ? null : number(holding.institution_price),
      priceAsOf: holding.institution_price_as_of == null ? null : date(holding.institution_price_as_of), costBasis: holding.cost_basis == null ? null : number(holding.cost_basis, true) };
  });
  const now = new Date(), through = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const activity: InvestmentActivity[] = [], seen = new Set<string>();
  let total: number | undefined;
  try {
    for (let page = 0; page < 10; page += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw invalid();
      const response = row(await plaid("/investments/transactions/get", { access_token: accessToken, start_date: from, end_date: through,
        options: { account_ids: mappedIds, count: 500, offset: activity.length } }, Math.min(120_000, remaining)));
      const nextTotal = response.total_investment_transactions;
      if (typeof nextTotal !== "number" || !Number.isInteger(nextTotal) || nextTotal < 0 || nextTotal > 5000 || (total !== undefined && total !== nextTotal)) throw invalid();
      total = nextTotal;
      const entries = list(response.investment_transactions, 500), pageSecurities = securities(response.securities);
      for (const entry of entries) {
        const tx = row(entry); usd(tx);
        const key = id(tx.investment_transaction_id), occurredOn = date(tx.date);
        const security = tx.security_id == null ? undefined : pageSecurities.get(id(tx.security_id));
        if (seen.has(key) || occurredOn < from || occurredOn > through || (tx.security_id != null && !security)) throw invalid();
        seen.add(key);
        activity.push({ id: key, accountId: accountId(tx.account_id, mapped), date: occurredOn, name: label(tx.name, "Investment activity"),
          ticker: typeof security?.ticker_symbol === "string" ? security.ticker_symbol.slice(0, 40) : null,
          type: label(tx.type, "other"), subtype: label(tx.subtype, "other"), amount: number(tx.amount, true), quantity: number(tx.quantity),
          cancelTransactionId: tx.cancel_transaction_id == null ? null : id(tx.cancel_transaction_id) });
      }
      if (activity.length > total || (!entries.length && activity.length < total)) throw invalid();
      if (activity.length === total) return { accounts, snapshot: { holdings, activity, retrievedAt: new Date().toISOString(), activityReady: true,
        activityFrom: from, activityThrough: through, activityRetrievedAt: new Date().toISOString() } satisfies InvestmentSnapshot };
    }
    throw invalid();
  } catch (error) {
    if (!(error instanceof BankingError && error.code === "PRODUCT_NOT_READY")) throw error;
    // A preparing history must never erase an earlier complete snapshot.
    return { accounts, snapshot: { holdings, activity: previous?.activity || [], retrievedAt: new Date().toISOString(), activityReady: false,
      activityFrom: previous?.activityFrom || from, activityThrough: previous?.activityThrough || through,
      activityRetrievedAt: previous?.activityRetrievedAt } satisfies InvestmentSnapshot };
  }
}
