import type { BankAccount, BankConnectionView } from "./banking-types";
import type { FinanceState } from "./native-types";

export function matchingAccounts(connection: BankConnectionView, account: BankAccount, state: FinanceState) {
  return state.accounts.filter(item => !item.archivedAt && !item.coinbaseLink && item.entityScope === "personal" && item.kind === account.kind &&
    (!item.bankLink || (item.bankLink.connectionId === connection.id && item.bankLink.accountId === account.id)));
}

/** Suggestions are reviewed in the matching form; they never write or merge records. */
export function suggestInvestmentMatches(connection: BankConnectionView, state: FinanceState): Record<string, string> {
  if (connection.product !== "investments") return {};
  const result: Record<string, string> = {}, used = new Set<string>();
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const institution = normalized(connection.name);
  for (const account of connection.accounts.filter(item => item.supported)) {
    const candidates = matchingAccounts(connection, account, state);
    const linked = candidates.filter(item => item.bankLink?.accountId === account.id);
    const sameInstitution = candidates.filter(item => institution.length > 2 && normalized(item.institution) === institution);
    const masked = sameInstitution.filter(item => account.mask && item.mask === account.mask);
    const matches = linked.length ? linked : masked.length ? masked : connection.accounts.filter(item => item.supported).length === 1 ? sameInstitution : [];
    if (matches.length === 1 && !used.has(matches[0].id)) { result[account.id] = matches[0].id; used.add(matches[0].id); }
  }
  return result;
}
