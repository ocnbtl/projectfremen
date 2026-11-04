import type { ObjectLink } from "../../native-objects/links";
import type { FinanceOrganization } from "./merchants";
import type { FinanceState, FinanceTransactionRecord } from "./native-types";

/** Exact names only. Keep word boundaries, numbers, locations and corporate
 * suffixes; never strip card descriptors or guess from a substring. */
export function merchantKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const GENERIC = new Set(["organization", "unknown", "other", "store", "merchant", "payment", "transfer", "refund", "cash"]);
const usableKey = (value: string) => { const key = merchantKey(value); return key.length >= 3 && !GENERIC.has(key) ? key : ""; };
export function isMerchantTransaction(row: FinanceTransactionRecord): boolean {
  return !row.archivedAt && ["income", "expense"].includes(row.direction)
    && row.source.kind !== "transfer" && !row.transferId && !row.savingsMovementId;
}

export function matchTransactionMerchants(
  state: Pick<FinanceState, "transactions" | "bills">,
  newIds: ReadonlySet<string>, organizations: readonly FinanceOrganization[], links: readonly ObjectLink[]
) {
  const available = new Map(organizations.map(org => [org.id, org]));
  const candidates = new Map<string, Set<string>>();
  const add = (name: string, id: string) => {
    const key = usableKey(name);
    if (!key || !available.has(id)) return;
    const ids = candidates.get(key) || new Set<string>(); ids.add(id); candidates.set(key, ids);
  };
  for (const org of organizations) add(org.title, org.id);
  const transactions = new Map(state.transactions.map(row => [row.id, row]));
  const bills = new Map(state.bills.map(row => [row.id, row]));
  for (const link of links) {
    if (link.status !== "active" || link.provenance !== "manual" || link.relationship !== "merchant"
      || link.source.module !== "finance" || link.target.module !== "people" || link.target.objectType !== "organization") continue;
    const row = link.source.objectType === "transaction" ? transactions.get(link.source.objectId)
      : link.source.objectType === "bill" ? bills.get(link.source.objectId) : undefined;
    if (!row || row.archivedAt || ("merchant" in row && !isMerchantTransaction(row))) continue;
    const name = "merchant" in row ? row.merchant : row.name;
    // A renamed transaction must not silently teach a new alias from an old link.
    if (merchantKey(name) === merchantKey(link.source.label)) add(name, link.target.objectId);
  }
  return state.transactions.flatMap(row => {
    if (!newIds.has(row.id) || !isMerchantTransaction(row)) return [];
    const ids = candidates.get(usableKey(row.merchant));
    if (!ids || ids.size !== 1) return [];
    const org = available.get([...ids][0])!;
    return [{ source: { module: "finance" as const, objectType: "transaction", objectId: row.id,
      label: row.merchant, route: `/admin/finance/transactions?selected=${encodeURIComponent(row.id)}` },
    target: { module: "people" as const, objectType: "organization", objectId: org.id,
      label: org.title, route: `/admin/people/${encodeURIComponent(org.id)}` }, relationship: "merchant" }];
  });
}
