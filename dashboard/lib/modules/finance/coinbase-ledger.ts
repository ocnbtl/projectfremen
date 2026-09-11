import { randomUUID } from "node:crypto";
import type { FinanceState } from "./native-types";
import type { CoinbaseSnapshot } from "./coinbase-types";
import { BankingError } from "./banking-provider";

function audit(state: FinanceState, id: string, action: string, now: string) {
  state.updatedAt = state.updatedAt && state.updatedAt >= now ? new Date(Date.parse(state.updatedAt) + 1).toISOString() : now;
  state.auditEvents.push({ id: randomUUID(), objectType: "account", objectId: id, action, actorId: "coinbase", occurredAt: state.updatedAt, before: null, after: null });
  state.auditEvents = state.auditEvents.slice(-4000);
}
/** One aggregate portfolio prevents counting each asset and its parent balance twice. */
export function applyCoinbasePortfolio(state: FinanceState, target: string, snapshot: CoinbaseSnapshot): string {
  const now = snapshot.retrievedAt;
  const existing = state.accounts.find(item => item.coinbaseLink);
  const id = target === "new" ? "finance-coinbase-personal" : target;
  if (existing && existing.id !== id) throw new BankingError("coinbase_match", "Coinbase is already matched to another Finance account.", 409);
  let account = state.accounts.find(item => item.id === id);
  if (account && (account.archivedAt || account.entityScope !== "personal" || account.kind !== "Brokerage" || account.bankLink)) {
    throw new BankingError("coinbase_match", "Choose an active personal brokerage account that is not linked to another provider.", 409);
  }
  if (!account) {
    if (target !== "new") throw new BankingError("coinbase_match", "The selected Finance account no longer exists.", 409);
    if (snapshot.totalUsd === null) throw new BankingError("coinbase_price", "A holding has no USD price. Try again later, or match an existing brokerage account to retain its recorded balance.", 422);
    account = { id, name: "Coinbase", kind: "Brokerage", institution: "Coinbase", mask: "", currentBalance: snapshot.totalUsd, balanceSource: "coinbase",
      balanceAsOf: now.slice(0, 10), currency: "USD", entityScope: "personal", createdAt: now, updatedAt: now, createdBy: "admin" };
    state.accounts.push(account);
  }
  account.coinbaseLink = true;
  // Incomplete pricing is not zero: keep the previous dated balance.
  if (snapshot.totalUsd !== null) {
    account.currentBalance = snapshot.totalUsd; account.balanceSource = "coinbase";
    account.balanceAsOf = now.slice(0, 10); account.balanceRetrievedAt = now;
  }
  account.updatedAt = account.updatedAt >= now ? new Date(Date.parse(account.updatedAt) + 1).toISOString() : now;
  audit(state, id, "finance.coinbase.synced", now);
  return id;
}
export function unlinkCoinbasePortfolio(state: FinanceState) {
  for (const account of state.accounts.filter(item => item.coinbaseLink)) {
    delete account.coinbaseLink;
    account.updatedAt = new Date(Math.max(Date.now(), Date.parse(account.updatedAt) + 1)).toISOString();
    audit(state, account.id, "finance.coinbase.disconnected", account.updatedAt);
  }
}
