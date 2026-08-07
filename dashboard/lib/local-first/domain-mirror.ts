"use client";

import type { PersonalRecord } from "../personal-records-store";
import { browserVault, deterministicVaultObjectId } from "./browser-engine";
import type { VaultFieldValue, VaultObjectKind } from "./types";

export function flattenVaultFields(value: unknown): Record<string, VaultFieldValue> {
  const source = JSON.parse(JSON.stringify(value)) as Record<string, VaultFieldValue>;
  const flattened: Record<string, VaultFieldValue> = {};
  const visit = (prefix: string, current: VaultFieldValue) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      for (const [key, nested] of Object.entries(current)) visit(prefix ? `${prefix}.${key}` : key, nested);
    } else if (prefix) {
      flattened[prefix] = current;
    }
  };
  for (const [key, current] of Object.entries(source)) visit(key, current);
  return flattened;
}

function personalKind(record: PersonalRecord): VaultObjectKind {
  if (record.className === "person" || record.className === "org") return "contact";
  if (record.className === "resource") return "resource";
  if (record.className === "file") return "media";
  if (record.className === "note") return "note";
  return "other";
}

export async function mirrorVaultRecord(canonicalId: string, objectKind: VaultObjectKind, value: unknown): Promise<boolean> {
  if (!browserVault.isUnlocked()) return false;
  try {
    const objectId = await deterministicVaultObjectId(canonicalId);
    const fields = flattenVaultFields(value);
    const result = await browserVault.mirrorCanonicalObject({ objectId, objectKind, fields });
    return result.changed;
  } catch (error) {
    window.dispatchEvent(new CustomEvent("unigentamos-vault-mirror-error", {
      detail: { message: error instanceof Error ? error.message : "Encrypted history mirror failed" }
    }));
    return false;
  }
}

export async function mirrorPersonalRecord(record: PersonalRecord): Promise<boolean> {
  return mirrorVaultRecord(
    `personal-records:${record.className}:${record.id}`,
    personalKind(record),
    { sourceModule: "personal-records", ...record }
  );
}

const FINANCE_COLLECTIONS: Readonly<Record<string, string>> = {
  account: "accounts",
  transaction: "transactions",
  transfer: "transfers",
  savings_movement: "savingsMovements",
  bill: "bills",
  budget: "budgets",
  close_period: "closePeriods",
  rule: "rules",
  import_batch: "importBatches"
};

export async function mirrorFinanceRecord(kind: unknown, record: Record<string, unknown>): Promise<boolean> {
  const id = typeof record.id === "string" ? record.id : "";
  const collection = typeof kind === "string" ? FINANCE_COLLECTIONS[kind] : undefined;
  if (!id || !collection) return false;
  return mirrorVaultRecord(`finance:${collection}:${id}`, "finance", {
    sourceModule: "finance",
    sourceCollection: collection,
    ...record
  });
}
