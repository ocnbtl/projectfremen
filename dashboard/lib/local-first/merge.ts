import { compareHlc } from "./hlc";
import {
  HIGH_INTEGRITY_FIELDS,
  type HybridLogicalClock,
  type MergeConflict,
  type MergeResult,
  type VaultFieldValue,
  type VaultObjectSnapshot
} from "./types";

type TextEdit = { start: number; end: number; replacement: string[] };

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function textEdit(base: string, changed: string): TextEdit | null {
  if (base === changed) return null;
  const baseLines = base.split("\n");
  const changedLines = changed.split("\n");
  let prefix = 0;
  while (prefix < baseLines.length && prefix < changedLines.length && baseLines[prefix] === changedLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < baseLines.length - prefix
    && suffix < changedLines.length - prefix
    && baseLines[baseLines.length - 1 - suffix] === changedLines[changedLines.length - 1 - suffix]
  ) suffix += 1;
  return {
    start: prefix,
    end: baseLines.length - suffix,
    replacement: changedLines.slice(prefix, changedLines.length - suffix)
  };
}

function editsOverlap(left: TextEdit, right: TextEdit): boolean {
  if (left.start === left.end && right.start === right.end) return left.start === right.start;
  return left.start < right.end && right.start < left.end;
}

export function threeWayMergeText(base: string, local: string, remote: string): { value: string; conflict: boolean } {
  if (local === remote) return { value: local, conflict: false };
  if (local === base) return { value: remote, conflict: false };
  if (remote === base) return { value: local, conflict: false };
  const localEdit = textEdit(base, local);
  const remoteEdit = textEdit(base, remote);
  if (!localEdit || !remoteEdit || editsOverlap(localEdit, remoteEdit)) return { value: local, conflict: true };
  const lines = base.split("\n");
  const edits = [localEdit, remoteEdit].sort((left, right) => right.start - left.start);
  for (const edit of edits) lines.splice(edit.start, edit.end - edit.start, ...edit.replacement);
  return { value: lines.join("\n"), conflict: false };
}

function newest(
  localValue: VaultFieldValue | undefined,
  remoteValue: VaultFieldValue | undefined,
  localClock: HybridLogicalClock,
  remoteClock: HybridLogicalClock
): { value: VaultFieldValue | undefined; clock: HybridLogicalClock; winner: "local" | "remote" } {
  return compareHlc(localClock, remoteClock) >= 0
    ? { value: localValue, clock: localClock, winner: "local" }
    : { value: remoteValue, clock: remoteClock, winner: "remote" };
}

export function mergeVaultSnapshots(
  base: VaultObjectSnapshot,
  local: VaultObjectSnapshot,
  remote: VaultObjectSnapshot
): MergeResult {
  if (base.objectId !== local.objectId || base.objectId !== remote.objectId || local.objectKind !== remote.objectKind) {
    throw new Error("Three-way merge requires one object identity and kind");
  }
  const fields: Record<string, VaultFieldValue> = {};
  const fieldClocks: Record<string, HybridLogicalClock> = {};
  const conflicts: MergeConflict[] = [];
  const autoMergedFields: string[] = [];
  const names = new Set([...Object.keys(base.fields), ...Object.keys(local.fields), ...Object.keys(remote.fields)]);
  const highIntegrity = new Set(HIGH_INTEGRITY_FIELDS[local.objectKind]);

  for (const field of names) {
    const baseValue = base.fields[field];
    const localValue = local.fields[field];
    const remoteValue = remote.fields[field];
    const localChanged = !equal(localValue, baseValue);
    const remoteChanged = !equal(remoteValue, baseValue);
    const localClock = local.fieldClocks[field] || base.fieldClocks[field] || local.hlc;
    const remoteClock = remote.fieldClocks[field] || base.fieldClocks[field] || remote.hlc;

    if (!localChanged && !remoteChanged) {
      if (baseValue !== undefined) fields[field] = baseValue;
      fieldClocks[field] = base.fieldClocks[field] || localClock;
      continue;
    }
    if (localChanged && !remoteChanged) {
      if (localValue !== undefined) fields[field] = localValue;
      fieldClocks[field] = localClock;
      autoMergedFields.push(field);
      continue;
    }
    if (!localChanged && remoteChanged) {
      if (remoteValue !== undefined) fields[field] = remoteValue;
      fieldClocks[field] = remoteClock;
      autoMergedFields.push(field);
      continue;
    }
    if (equal(localValue, remoteValue)) {
      if (localValue !== undefined) fields[field] = localValue;
      fieldClocks[field] = compareHlc(localClock, remoteClock) >= 0 ? localClock : remoteClock;
      autoMergedFields.push(field);
      continue;
    }

    if (
      (field === "body" || field === "content")
      && typeof baseValue === "string"
      && typeof localValue === "string"
      && typeof remoteValue === "string"
    ) {
      const merged = threeWayMergeText(baseValue, localValue, remoteValue);
      if (!merged.conflict) {
        fields[field] = merged.value;
        fieldClocks[field] = compareHlc(localClock, remoteClock) >= 0 ? localClock : remoteClock;
        autoMergedFields.push(field);
        continue;
      }
    }

    const resolved = newest(localValue, remoteValue, localClock, remoteClock);
    if (resolved.value !== undefined) fields[field] = resolved.value;
    fieldClocks[field] = resolved.clock;
    const losingValue = resolved.winner === "local" ? remoteValue : localValue;
    const losingClock = resolved.winner === "local" ? remoteClock : localClock;
    conflicts.push({
      objectId: local.objectId,
      field,
      winner: resolved.winner,
      reason: highIntegrity.has(field)
        ? "high_integrity_overlap"
        : field === "body" || field === "content"
          ? "overlapping_text"
          : "same_field_overlap",
      losingValue,
      losingClock
    });
  }

  const latest = compareHlc(local.hlc, remote.hlc) >= 0 ? local : remote;
  const tombstoneWinner = newest(local.tombstone, remote.tombstone, local.hlc, remote.hlc);
  return {
    snapshot: {
      objectId: local.objectId,
      objectKind: local.objectKind,
      versionId: crypto.randomUUID(),
      fields,
      fieldClocks,
      tombstone: Boolean(tombstoneWinner.value),
      hlc: latest.hlc,
      updatedAt: new Date(latest.hlc.wallMs).toISOString()
    },
    conflicts,
    autoMergedFields
  };
}
