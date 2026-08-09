import { compareHlc } from "./hlc";
import type { VaultFieldValue, VaultObjectSnapshot } from "./types";


function stableValue(value: VaultFieldValue): VaultFieldValue {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    ) as VaultFieldValue;
  }
  return value;
}

function visibleFields(fields: Record<string, VaultFieldValue>): Record<string, VaultFieldValue> {
  return Object.fromEntries(
    Object.entries(fields).filter(([field]) => !field.startsWith("__unigentamos"))
  );
}

export function snapshotsEquivalent(left: VaultObjectSnapshot, right: VaultObjectSnapshot): boolean {
  return left.objectKind === right.objectKind
    && left.tombstone === right.tombstone
    && JSON.stringify(stableValue(visibleFields(left.fields)))
      === JSON.stringify(stableValue(visibleFields(right.fields)));
}

/**
 * Project the internal version graph into the history a person expects to see.
 * Adjacent sync checkpoints with identical content collapse to their first save,
 * while A -> B -> A remains three meaningful versions.
 */
export function meaningfulVaultHistory(snapshots: readonly VaultObjectSnapshot[]): VaultObjectSnapshot[] {
  const oldestFirst = [...snapshots].sort((left, right) => {
    const clockOrder = compareHlc(left.hlc, right.hlc);
    if (clockOrder !== 0) return clockOrder;
    const timeOrder = left.updatedAt.localeCompare(right.updatedAt);
    return timeOrder !== 0 ? timeOrder : left.versionId.localeCompare(right.versionId);
  });
  const meaningful: VaultObjectSnapshot[] = [];
  for (const snapshot of oldestFirst) {
    const prior = meaningful.at(-1);
    if (!prior || !snapshotsEquivalent(prior, snapshot)) meaningful.push(snapshot);
  }
  return meaningful.reverse();
}

async function deterministicUuid(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Devices resolving the same parents to the same content produce one merge id.
 * The relay can therefore deduplicate simultaneous convergence work safely.
 */
export async function deterministicMergeVersionId(
  snapshot: VaultObjectSnapshot,
  parentVersionIds: readonly string[]
): Promise<string> {
  return deterministicUuid(JSON.stringify({
    format: "unigentamos-merge-v1",
    objectId: snapshot.objectId,
    objectKind: snapshot.objectKind,
    parentVersionIds: [...new Set(parentVersionIds)].sort(),
    fields: stableValue(snapshot.fields),
    tombstone: snapshot.tombstone
  }));
}
