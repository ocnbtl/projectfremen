import { createInferredObjectRelationships } from "../../native-objects/link-store";
import { readFinanceOrganizations } from "./merchant-store";
import { matchTransactionMerchants, isMerchantTransaction } from "./merchant-matching";
import type { FinanceState } from "./native-types";

/** One bounded pass per committed addition, never on reads or ordinary edits. */
export async function linkNewTransactionMerchants(state: FinanceState, newIds: ReadonlySet<string>) {
  if (!state.transactions.some(row => newIds.has(row.id) && isMerchantTransaction(row))) return 0;
  const organizations = await readFinanceOrganizations();
  if (!organizations.length) return 0;
  return createInferredObjectRelationships(links => matchTransactionMerchants(state, newIds, organizations, links), "finance-merchant-match");
}
