import type { FinanceAccountRecord, FinanceState, FinanceTransactionRecord } from "./native-types";

export function signedAccountTransaction(item: FinanceTransactionRecord) {
  return item.direction === "expense" ? -item.amount : item.amount;
}
export function accountBalanceSource(account?: FinanceAccountRecord) {
  return ({ plaid: "Plaid", coinbase: "Coinbase", imported: "Imported statement", manual: "Manual entry" })[account?.balanceSource || "manual"];
}
export function accountBalanceExplanation(account?: FinanceAccountRecord) {
  if (account?.bankLink) return "Updated when this account syncs with Plaid, including bank update notifications. This is the latest retrieved balance, not a live balance.";
  if (account?.coinbaseLink) return "Updated when Coinbase syncs. This is the latest retrieved estimate, not a live valuation.";
  if (account?.balanceSource === "plaid" || account?.balanceSource === "coinbase") return "Last retrieved from the provider. This account is no longer connected; reconnect to receive new balances.";
  return "A balance you recorded from an account or statement. Update it when you have a newer balance; adding transactions or importing a CSV does not change it.";
}
export function accountDate(value?: string, time = false) {
  if (!value) return "Not recorded";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", ...(time && value.length > 10 ? { hour: "numeric" as const, minute: "2-digit" as const } : { timeZone: "UTC" }) });
}

/** Inferences only: equal opposite entries do not establish that money was transferred. */
export function findAccountTransferCandidates(state: FinanceState, accountId: string) {
  const activeAccounts = new Set(state.accounts.filter(a => !a.archivedAt).map(a => a.id));
  const recorded = new Set(state.transfers.flatMap(t => [t.outgoingTransactionId, t.incomingTransactionId]));
  const eligible = state.transactions.filter(t => !t.archivedAt && t.status === "cleared" && !t.transferId && !t.savingsMovementId && !recorded.has(t.id) && activeAccounts.has(t.accountId) && Math.abs(signedAccountTransaction(t)) > 0);
  const buckets = new Map<string, FinanceTransactionRecord[]>();
  for (const t of eligible) {
    const key = `${t.occurredOn}:${t.currency}:${Math.round(Math.abs(signedAccountTransaction(t)) * 100)}`;
    buckets.set(key, [...(buckets.get(key) || []), t]);
  }
  return [...buckets.values()].flatMap(items => {
    const outgoing = items.filter(t => signedAccountTransaction(t) < 0), incoming = items.filter(t => signedAccountTransaction(t) > 0);
    // Ambiguous equal-amount pairs stay in activity for manual review.
    if (outgoing.length !== 1 || incoming.length !== 1 || outgoing[0].accountId === incoming[0].accountId) return [];
    if (![outgoing[0].accountId, incoming[0].accountId].includes(accountId)) return [];
    return [{ outgoing: outgoing[0], incoming: incoming[0] }];
  }).sort((a,b) => b.outgoing.occurredOn.localeCompare(a.outgoing.occurredOn));
}
