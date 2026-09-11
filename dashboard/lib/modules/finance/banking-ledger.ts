import { createHash } from "node:crypto";
import type { FinanceState, FinanceTransactionRecord } from "./native-types";
import type { BankAccount, BankReview, BankTransaction } from "./banking-types";
import { BankingError } from "./banking-provider";

export type BankingFinanceState = FinanceState & { bankReviews?: BankReview[] };
export const bankRecordId = (connection: string, id: string) => `finance-bank-${createHash("sha256").update(`${connection}:${id}`).digest("hex").slice(0, 32)}`;
const timestamp = (previous: string | null, now: string) => previous && previous >= now ? new Date(Date.parse(previous) + 1).toISOString() : now;
function audit(state: FinanceState, type: "account" | "transaction", id: string, action: string, now: string) {
  state.updatedAt = timestamp(state.updatedAt, now);
  state.auditEvents.push({ id: bankRecordId(id, `${action}:${state.updatedAt}`), objectType: type, objectId: id, action, actorId: "plaid", occurredAt: state.updatedAt, before: null, after: null });
  state.auditEvents = state.auditEvents.slice(-4000);
}

/** Called only within the Finance CAS mutation. No provider/network operations here. */
export function bindBankAccounts(state: FinanceState, connectionId: string, institution: string, accounts: BankAccount[], choices: Record<string, string>, now: string): Record<string, string> {
  const selected = Object.entries(choices).filter(([, target]) => target && target !== "skip");
  if (!selected.length) throw new BankingError("choose_accounts", "Choose at least one account to connect.");
  const mappings: Record<string, string> = {};
  const targets = new Set<string>();
  for (const [bankId, target] of selected) {
    const bank = accounts.find(item => item.id === bankId && item.supported);
    if (!bank) throw new BankingError("unsupported_account", "This account is not supported. Choose a USD checking, savings or credit-card account.");
    const id = target === "new" ? bankRecordId(connectionId, bankId) : target;
    if (state.accounts.some(item => item.id !== id && item.bankLink?.connectionId === connectionId && item.bankLink.accountId === bankId)) {
      throw new BankingError("already_linked", "This bank account is already matched to a Finance account. Select that existing account to recover the match.", 409);
    }
    if (targets.has(id)) throw new BankingError("duplicate_mapping", "Each bank account needs its own Finance account.");
    targets.add(id);
    let account = state.accounts.find(item => item.id === id);
    if (account && (account.archivedAt || account.coinbaseLink || account.entityScope !== "personal" || account.kind !== bank.kind ||
      (account.bankLink && (account.bankLink.connectionId !== connectionId || account.bankLink.accountId !== bankId)))) {
      throw new BankingError("account_conflict", "Choose an active personal account of the same type that is not already connected.", 409);
    }
    if (!account) {
      if (target !== "new") throw new BankingError("missing_account", "The selected Finance account no longer exists.", 409);
      if (bank.balance === null) throw new BankingError("missing_balance", "This bank has not returned a balance yet. Try again once a balance is available.");
      account = { id, name: bank.name, kind: bank.kind, institution, mask: bank.mask, currentBalance: bank.balance,
        balanceSource: "plaid", balanceAsOf: now.slice(0, 10), currency: "USD", entityScope: "personal", createdAt: now, updatedAt: now, createdBy: "admin" };
      state.accounts.push(account);
    }
    account.bankLink = { connectionId, accountId: bankId };
    account.updatedAt = timestamp(account.updatedAt, now);
    mappings[bankId] = id;
    audit(state, "account", id, "finance.bank.connected", now);
  }
  return mappings;
}

function recordFor(connectionId: string, tx: BankTransaction, accountId: string, now: string, before?: FinanceTransactionRecord): FinanceTransactionRecord {
  const bank = before?.source.bank;
  const changed = before && (before.amount !== tx.amount || before.occurredOn !== tx.date || before.status !== (tx.pending ? "pending" : "cleared") || before.direction !== tx.direction);
  return { ...before, id: before?.id || bankRecordId(connectionId, tx.id), createdAt: before?.createdAt || now, createdBy: before?.createdBy || "plaid",
    updatedAt: timestamp(before?.updatedAt || null, now), occurredOn: tx.date, accountId,
    merchant: before && (!bank || before.merchant !== bank.merchant) ? before.merchant : tx.merchant,
    category: before && (!bank || before.category !== bank.category) ? before.category : tx.category,
    amount: tx.amount, direction: tx.direction, currency: "USD", entityScope: "personal", memo: before?.memo || "",
    status: tx.pending ? "pending" : "cleared", reviewed: changed ? false : before?.reviewed || false, reimbursable: before?.reimbursable || false,
    source: { ...before?.source, kind: "plaid", bank: { connectionId, transactionId: tx.id, pendingId: tx.pendingId, merchant: tx.merchant, category: tx.category } } };
}

export function reconcileBankBatch(state: BankingFinanceState, connectionId: string, mappings: Record<string, string>, accounts: BankAccount[], transactions: BankTransaction[], removed: string[], now: string) {
  state.bankReviews ||= [];
  for (const bank of accounts) {
    const account = state.accounts.find(item => item.id === mappings[bank.id] && item.bankLink?.connectionId === connectionId && !item.archivedAt);
    if (!account || !bank.supported || bank.balance === null) continue;
    const changed = account.currentBalance !== bank.balance || account.balanceSource !== "plaid";
    account.currentBalance = bank.balance;
    account.balanceSource = "plaid";
    account.balanceAsOf = now.slice(0, 10);
    account.balanceRetrievedAt = now;
    account.updatedAt = timestamp(account.updatedAt, now);
    if (changed) audit(state, "account", account.id, "finance.bank.balance_updated", now);
  }
  // Process every added/modified page before removals, including pending -> posted replacements.
  for (const tx of transactions) {
    const accountId = mappings[tx.accountId];
    const account = state.accounts.find(item => item.id === accountId && item.bankLink?.connectionId === connectionId && !item.archivedAt);
    if (!account) continue;
    const before = state.transactions.find(item => item.source.bank?.connectionId === connectionId &&
      (item.source.bank.transactionId === tx.id || (tx.pendingId && item.source.bank.transactionId === tx.pendingId)));
    const review = state.bankReviews.find(item => item.connectionId === connectionId && (item.transaction.id === tx.id || (tx.pendingId && item.transaction.id === tx.pendingId)));
    if (!before && review?.resolved === "ignored") { review.transaction = tx; continue; }
    if (!before && review && !review.resolved) { review.transaction = tx; continue; }
    if (!before) {
      // Identical manual/CSV entries are held for an explicit decision; never silently duplicate or merge.
      const candidates = state.transactions.filter(item => item.accountId === accountId && !item.archivedAt && !item.source.bank && !item.transferId && !item.savingsMovementId &&
        item.occurredOn === tx.date && item.amount === tx.amount && item.direction === tx.direction).map(item => item.id);
      if (candidates.length) {
        state.bankReviews.push({ id: bankRecordId(connectionId, tx.id), connectionId, transaction: tx, accountId, candidates });
        continue;
      }
    }
    const next = recordFor(connectionId, tx, accountId, now, before);
    if (next.archivedBy === "plaid") { delete next.archivedAt; delete next.archivedBy; delete next.archiveReason; }
    const same = before && JSON.stringify({ ...before, updatedAt: "" }) === JSON.stringify({ ...next, updatedAt: "" });
    if (same) continue;
    if (before) state.transactions[state.transactions.indexOf(before)] = next;
    else state.transactions.push(next);
    audit(state, "transaction", next.id, before ? "finance.bank.transaction_updated" : "finance.bank.transaction_imported", now);
  }
  for (const id of removed) {
    const item = state.transactions.find(tx => tx.source.bank?.connectionId === connectionId && tx.source.bank.transactionId === id);
    if (item && !item.archivedAt) {
      item.archivedAt = now; item.archivedBy = "plaid"; item.archiveReason = "Removed by the bank"; item.updatedAt = timestamp(item.updatedAt, now);
      audit(state, "transaction", item.id, "finance.bank.transaction_removed", now);
    }
    const review = state.bankReviews.find(tx => tx.connectionId === connectionId && tx.transaction.id === id);
    if (review && !review.resolved) review.resolved = "removed";
  }
  state.updatedAt = timestamp(state.updatedAt, now);
}

export function resolveBankReview(state: BankingFinanceState, id: string, decision: string, targetId: string | undefined, now: string) {
  const review = state.bankReviews?.find(item => item.id === id);
  if (!review || review.resolved) throw new BankingError("stale_review", "This bank entry has already been handled. Reload the connections panel.", 409);
  if (decision === "ignore") review.resolved = "ignored";
  else if (decision === "import" || decision === "match") {
    const before = decision === "match" ? state.transactions.find(item => item.id === targetId && review.candidates.includes(item.id)) : undefined;
    if (decision === "match" && (!before || before.archivedAt || before.source.bank || before.accountId !== review.accountId ||
      before.amount !== review.transaction.amount || before.direction !== review.transaction.direction || before.occurredOn !== review.transaction.date)) {
      throw new BankingError("match_changed", "The existing entry changed. Import separately or review the ledger first.", 409);
    }
    const next = recordFor(review.connectionId, review.transaction, review.accountId, now, before);
    if (before) state.transactions[state.transactions.indexOf(before)] = next;
    else state.transactions.push(next);
    review.resolved = decision === "match" ? "matched" : "imported";
    audit(state, "transaction", next.id, "finance.bank.duplicate_resolved", now);
  } else throw new BankingError("invalid_decision", "Choose match, import or ignore.");
  state.updatedAt = timestamp(state.updatedAt, now);
}

export function unlinkBankAccounts(state: FinanceState, connectionId: string, now: string) {
  for (const account of state.accounts.filter(item => item.bankLink?.connectionId === connectionId)) {
    delete account.bankLink;
    account.updatedAt = timestamp(account.updatedAt, now);
    audit(state, "account", account.id, "finance.bank.disconnected", now);
  }
}
