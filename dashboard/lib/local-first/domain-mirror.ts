"use client";

import type { PersonalRecord } from "../personal-records-store";
import { browserVault, deterministicVaultObjectId } from "./browser-engine";
import { canonicalVaultFields, objectKindForPersonalCollection, type CanonicalModule } from "./canonical-record";
import type { VaultFieldValue, VaultObjectKind } from "./types";

function personalKind(record: PersonalRecord): VaultObjectKind {
  return objectKindForPersonalCollection(record.className);
}

export async function mirrorVaultRecord(
  canonicalId: string,
  objectKind: VaultObjectKind,
  fields: Record<string, VaultFieldValue>
): Promise<boolean> {
  if (!browserVault.isUnlocked()) return false;
  try {
    const objectId = await deterministicVaultObjectId(canonicalId);
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
  return mirrorCanonicalRecord("personal-records", record.className, personalKind(record), record as unknown as Record<string, unknown>);
}

export async function mirrorCanonicalRecord(
  module: CanonicalModule,
  collection: string,
  objectKind: VaultObjectKind,
  record: Record<string, unknown>
): Promise<boolean> {
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return false;
  return mirrorVaultRecord(
    `${module}:${collection}:${id}`,
    objectKind,
    canonicalVaultFields({ module, collection, record })
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
  return mirrorCanonicalRecord("finance", collection, "finance", record);
}
