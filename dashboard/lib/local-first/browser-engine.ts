"use client";

import { buildJsonHeadersWithCsrf } from "../client-csrf";
import {
  createVaultKeyEnvelope,
  decryptVaultChange,
  decryptVaultDeviceDescriptor,
  encryptVaultChange,
  encryptVaultDeviceDescriptor,
  unlockVaultKey
} from "./crypto";
import { assessClockHealth, receiveHlc, tickHlc } from "./hlc";
import { BrowserVaultStore } from "./indexed-db";
import { mergeVaultSnapshots } from "./merge";
import {
  VAULT_PROTOCOL_VERSION,
  type EncryptedChangeEnvelope,
  type EncryptedVaultDeviceStatus,
  type SequencedChangeEnvelope,
  type VaultChange,
  type VaultDeviceKind,
  type VaultDeviceStatusSnapshot,
  type VaultFieldValue,
  type VaultObjectKind,
  type VaultObjectSnapshot,
  type VaultRecoveryPackage
} from "./types";

type VaultSession = {
  store: BrowserVaultStore;
  vaultId: string;
  deviceId: string;
  keyVersion: number;
  key: CryptoKey;
};

const CANONICAL_BASE_FIELD = "__unigentamosCanonicalBaseV1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_STATUS_HEARTBEAT_MS = 30_000;

type CanonicalBaseMetadata = {
  versionId: string;
  fields: Record<string, VaultFieldValue>;
};

function cloneFields(fields: Record<string, VaultFieldValue>): Record<string, VaultFieldValue> {
  return JSON.parse(JSON.stringify(fields)) as Record<string, VaultFieldValue>;
}

function withoutCanonicalBase(fields: Record<string, VaultFieldValue>): Record<string, VaultFieldValue> {
  const next = cloneFields(fields);
  delete next[CANONICAL_BASE_FIELD];
  return next;
}

function canonicalBase(snapshot: VaultObjectSnapshot): CanonicalBaseMetadata | null {
  const value = snapshot.fields[CANONICAL_BASE_FIELD];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const versionId = value.versionId;
  const fields = value.fields;
  return typeof versionId === "string" && UUID.test(versionId) && fields && typeof fields === "object" && !Array.isArray(fields)
    ? { versionId, fields: cloneFields(fields as Record<string, VaultFieldValue>) }
    : null;
}

function stableValue(value: VaultFieldValue): VaultFieldValue {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) as VaultFieldValue;
  }
  return value;
}

function fieldsEqual(left: Record<string, VaultFieldValue>, right: Record<string, VaultFieldValue>): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function normalizedDeviceName(value: string, fallback: string): string {
  return (value.trim() || fallback).slice(0, 120);
}

function currentDeviceKind(): VaultDeviceKind {
  const userAgent = navigator.userAgent;
  if (/iPhone/i.test(userAgent)) return "iphone";
  if (/iPad/i.test(userAgent) || /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1) return "ipad";
  if (/Macintosh/i.test(userAgent)) return "macbook";
  if (/Windows/i.test(userAgent)) return "windows";
  return "browser";
}

function snapshotFromChange(change: VaultChange): VaultObjectSnapshot {
  return {
    objectId: change.objectId,
    objectKind: change.objectKind,
    versionId: change.changeId,
    hlc: change.hlc,
    fields: change.fields,
    fieldClocks: change.fieldClocks,
    tombstone: Boolean(change.tombstone),
    updatedAt: new Date(change.hlc.wallMs).toISOString()
  };
}

export async function deterministicVaultObjectId(canonicalKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`unigentamos:${canonicalKey}`)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class BrowserVaultEngine {
  private session: VaultSession | null = null;
  private companionCapability: string | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;
  private lastSyncError: string | null = null;
  private lastSyncedAt: string | null = null;
  private deviceStatusSnapshot: VaultDeviceStatusSnapshot | null = null;
  private lastDeviceStatusError: string | null = null;
  private lastDeviceHeartbeatAt = 0;

  isUnlocked(): boolean {
    return Boolean(this.session);
  }

  async status() {
    const store = await BrowserVaultStore.open();
    try {
      const metadata = await store.metadata();
      return {
        configured: Boolean(metadata),
        unlocked: Boolean(this.session),
        metadata,
        diagnostics: await store.diagnostics(),
        sync: {
          state: !navigator.onLine ? "offline" as const
            : this.lastSyncError ? "retrying" as const
              : this.lastSyncedAt ? "synced" as const : "pending" as const,
          lastError: this.lastSyncError,
          lastSyncedAt: this.lastSyncedAt
        },
        devices: {
          snapshot: this.deviceStatusSnapshot,
          lastError: this.lastDeviceStatusError
        },
        localCompanion: await this.companionStatus()
      };
    } finally {
      store.close();
    }
  }

  async initialize(password: string, deviceName: string): Promise<void> {
    if (this.session) throw new Error("Vault is already unlocked");
    const store = await BrowserVaultStore.open();
    try {
      const vaultId = crypto.randomUUID();
      const deviceId = crypto.randomUUID();
      const { envelope, vaultKey } = await createVaultKeyEnvelope(password);
      await store.initialize({
        vaultId,
        deviceId,
        deviceName: normalizedDeviceName(deviceName, "Browser device"),
        keyEnvelope: envelope,
        keyVersion: envelope.keyVersion
      });
      await store.requestPersistentStorage();
      this.session = { store, vaultId, deviceId, keyVersion: envelope.keyVersion, key: vaultKey };
    } catch (error) {
      store.close();
      throw error;
    }
  }

  async join(password: string, deviceName: string, recovery: VaultRecoveryPackage): Promise<void> {
    if (this.session) throw new Error("Vault is already unlocked");
    if (recovery?.format !== "unigentamos-vault-recovery-v1" || !recovery.vaultId || recovery.keyVersion !== recovery.keyEnvelope?.keyVersion) {
      throw new Error("Vault recovery package is invalid");
    }
    const key = await unlockVaultKey(password, recovery.keyEnvelope);
    const store = await BrowserVaultStore.open();
    try {
      await store.initialize({
        vaultId: recovery.vaultId,
        deviceId: crypto.randomUUID(),
        deviceName: normalizedDeviceName(deviceName, "Browser device"),
        keyEnvelope: recovery.keyEnvelope,
        keyVersion: recovery.keyVersion
      });
      await store.requestPersistentStorage();
      this.session = { store, vaultId: recovery.vaultId, deviceId: (await store.metadata())!.deviceId, keyVersion: recovery.keyVersion, key };
    } catch (error) {
      store.close();
      throw error;
    }
  }

  async initializeDesktopMaster(password: string, deviceName: string, setupCode: string): Promise<void> {
    const response = await fetch("http://127.0.0.1:43127/v1/setup", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, deviceName, setupCode })
    });
    const payload = await response.json() as { ok?: boolean; capability?: string; recoveryPackage?: VaultRecoveryPackage; error?: string };
    if (!response.ok || !payload.ok || !payload.capability || !payload.recoveryPackage) {
      throw new Error(payload.error || "Desktop vault setup failed");
    }
    await this.join(password, deviceName, payload.recoveryPackage);
    this.companionCapability = payload.capability;
    await this.mirrorEnvelopes(await this.requireSession().store.outbox(500));
  }

  async joinDesktopMaster(password: string, deviceName: string): Promise<void> {
    const response = await fetch("http://127.0.0.1:43127/v1/unlock", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const payload = await response.json() as { ok?: boolean; capability?: string; recoveryPackage?: VaultRecoveryPackage; error?: string };
    if (!response.ok || !payload.ok || !payload.capability || !payload.recoveryPackage) {
      throw new Error(payload.error || "Desktop vault connection failed");
    }
    await this.join(password, deviceName, payload.recoveryPackage);
    this.companionCapability = payload.capability;
    await this.mirrorEnvelopes(await this.requireSession().store.outbox(500));
  }

  async unlock(password: string): Promise<void> {
    if (this.session) return;
    const store = await BrowserVaultStore.open();
    try {
      const metadata = await store.metadata();
      if (!metadata) throw new Error("This device does not have a configured vault");
      const key = await unlockVaultKey(password, metadata.keyEnvelope);
      this.session = {
        store,
        vaultId: metadata.vaultId,
        deviceId: metadata.deviceId,
        keyVersion: metadata.keyVersion,
        key
      };
    } catch (error) {
      store.close();
      throw error;
    }
  }

  async unlockDesktopMaster(password: string): Promise<void> {
    await this.unlock(password);
    try {
      const response = await fetch("http://127.0.0.1:43127/v1/unlock", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await response.json() as { ok?: boolean; capability?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.capability) throw new Error(payload.error || "Desktop vault unlock failed");
      this.companionCapability = payload.capability;
      await this.mirrorEnvelopes(await this.requireSession().store.outbox(500));
    } catch (error) {
      this.lock();
      throw error;
    }
  }

  lock() {
    this.stopSync();
    if (this.companionCapability) {
      void fetch("http://127.0.0.1:43127/v1/lock", {
        method: "POST",
        mode: "cors",
        headers: { Authorization: `Bearer ${this.companionCapability}` }
      }).catch(() => undefined);
    }
    this.companionCapability = null;
    this.deviceStatusSnapshot = null;
    this.lastDeviceStatusError = null;
    this.lastDeviceHeartbeatAt = 0;
    this.session?.store.close();
    this.session = null;
  }

  async exportRecoveryPackage(): Promise<VaultRecoveryPackage> {
    const session = this.requireSession();
    const metadata = await session.store.metadata();
    if (!metadata) throw new Error("Local vault metadata is missing");
    return {
      format: "unigentamos-vault-recovery-v1",
      vaultId: metadata.vaultId,
      keyVersion: metadata.keyVersion,
      keyEnvelope: metadata.keyEnvelope,
      createdAt: metadata.createdAt
    };
  }

  private requireSession(): VaultSession {
    if (!this.session) throw new Error("Unlock the local vault first");
    return this.session;
  }

  private async correctedWallMs(): Promise<number> {
    const session = this.requireSession();
    const metadata = await session.store.metadata();
    if (navigator.onLine) {
      try {
        const response = await fetch("/api/vault/time", { cache: "no-store" });
        if (response.ok) {
          const health = assessClockHealth(Date.now(), response.headers.get("date"));
          await session.store.updateMetadata({ clockHealth: health });
          return health.adjustedWallMs;
        }
      } catch {
        // Offline/HLC fallback below preserves monotonic ordering.
      }
    }
    if (metadata?.clockHealth?.orderingSafe) {
      return Date.now() - metadata.clockHealth.skewMs;
    }
    return Date.now();
  }

  async readObject(objectId: string): Promise<VaultObjectSnapshot | null> {
    const session = this.requireSession();
    const row = await session.store.object(objectId);
    if (!row) return null;
    return snapshotFromChange(await decryptVaultChange(row.envelope, session.key));
  }

  async listObjects(kinds?: readonly VaultObjectKind[]): Promise<VaultObjectSnapshot[]> {
    const session = this.requireSession();
    const rows = await session.store.objects(kinds);
    const snapshots = await Promise.all(rows.map(async (row) => snapshotFromChange(await decryptVaultChange(row.envelope, session.key))));
    return snapshots.filter((snapshot) => !snapshot.tombstone).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async history(objectId: string): Promise<VaultObjectSnapshot[]> {
    const session = this.requireSession();
    const rows = await session.store.versions(objectId);
    const snapshots = await Promise.all(rows.map(async (row) => {
      const envelope = row.envelope as EncryptedChangeEnvelope | undefined;
      return envelope ? snapshotFromChange(await decryptVaultChange(envelope, session.key)) : null;
    }));
    return snapshots.filter((snapshot): snapshot is VaultObjectSnapshot => Boolean(snapshot))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveObject(input: {
    objectId?: string;
    objectKind: VaultObjectKind;
    fields: Record<string, VaultFieldValue>;
    tombstone?: boolean;
  }): Promise<VaultObjectSnapshot> {
    const session = this.requireSession();
    const objectId = input.objectId || crypto.randomUUID();
    const previous = await this.readObject(objectId);
    const metadata = await session.store.metadata();
    if (!metadata) throw new Error("Local vault metadata is missing");
    const hlc = tickHlc(metadata.lastClock, session.deviceId, await this.correctedWallMs());
    const fields = { ...(previous?.fields || {}), ...input.fields };
    const fieldClocks = { ...(previous?.fieldClocks || {}) };
    for (const field of Object.keys(input.fields)) fieldClocks[field] = hlc;
    const change: VaultChange = {
      protocolVersion: VAULT_PROTOCOL_VERSION,
      changeId: crypto.randomUUID(),
      objectId,
      objectKind: input.objectKind,
      deviceId: session.deviceId,
      hlc,
      ...(previous ? { baseVersionId: previous.versionId } : {}),
      fields,
      fieldClocks,
      ...(input.tombstone !== undefined ? { tombstone: input.tombstone } : {}),
      createdAt: new Date(hlc.wallMs).toISOString()
    };
    const envelope = await encryptVaultChange(change, session.vaultId, session.key, session.keyVersion);
    const snapshot = snapshotFromChange(change);
    await session.store.putVersion({
      versionId: snapshot.versionId,
      objectId,
      objectKind: input.objectKind,
      parentVersionIds: previous ? [previous.versionId] : [],
      envelope,
      createdAt: change.createdAt
    });
    await session.store.putObject({ objectId, objectKind: input.objectKind, versionId: snapshot.versionId, envelope, updatedAt: snapshot.updatedAt });
    await session.store.queue(envelope);
    await session.store.updateMetadata({ lastClock: hlc });
    await this.mirrorEnvelopes([envelope]);
    void this.syncOnce().catch(() => undefined);
    return snapshot;
  }

  async mirrorCanonicalObject(input: {
    objectId: string;
    objectKind: VaultObjectKind;
    fields: Record<string, VaultFieldValue>;
  }): Promise<{ snapshot: VaultObjectSnapshot; changed: boolean }> {
    const session = this.requireSession();
    if (!UUID.test(input.objectId)) throw new Error("Canonical vault object id is invalid");
    const canonicalFields = withoutCanonicalBase(input.fields);
    const current = await this.readObject(input.objectId);
    const priorBase = current ? canonicalBase(current) : null;
    if (current && priorBase && fieldsEqual(priorBase.fields, canonicalFields)) {
      return { snapshot: current, changed: false };
    }

    const metadata = await session.store.metadata();
    if (!metadata) throw new Error("Local vault metadata is missing");
    const remoteHlc = tickHlc(metadata.lastClock, session.deviceId, await this.correctedWallMs());
    const remoteVersionId = crypto.randomUUID();
    const baseMetadata: CanonicalBaseMetadata = { versionId: remoteVersionId, fields: cloneFields(canonicalFields) };
    const storedRemoteFields: Record<string, VaultFieldValue> = {
      ...cloneFields(canonicalFields),
      [CANONICAL_BASE_FIELD]: baseMetadata as unknown as VaultFieldValue
    };
    const remoteFieldClocks = Object.fromEntries(
      Object.keys(storedRemoteFields).map((field) => [field, remoteHlc])
    );
    const remoteChange: VaultChange = {
      protocolVersion: VAULT_PROTOCOL_VERSION,
      changeId: remoteVersionId,
      objectId: input.objectId,
      objectKind: input.objectKind,
      deviceId: session.deviceId,
      hlc: remoteHlc,
      ...(priorBase ? { baseVersionId: priorBase.versionId } : {}),
      fields: storedRemoteFields,
      fieldClocks: remoteFieldClocks,
      createdAt: new Date(remoteHlc.wallMs).toISOString()
    };
    const remoteEnvelope = await encryptVaultChange(remoteChange, session.vaultId, session.key, session.keyVersion);
    await session.store.putVersion({
      versionId: remoteVersionId,
      objectId: input.objectId,
      objectKind: input.objectKind,
      parentVersionIds: priorBase ? [priorBase.versionId] : [],
      envelope: remoteEnvelope,
      createdAt: remoteChange.createdAt
    });

    if (!current) {
      const snapshot = snapshotFromChange(remoteChange);
      await session.store.putObject({
        objectId: snapshot.objectId,
        objectKind: snapshot.objectKind,
        versionId: snapshot.versionId,
        envelope: remoteEnvelope,
        updatedAt: snapshot.updatedAt
      });
      await session.store.queue(remoteEnvelope);
      await session.store.updateMetadata({ lastClock: remoteHlc });
      await this.mirrorEnvelopes([remoteEnvelope]);
      void this.syncOnce().catch(() => undefined);
      return { snapshot, changed: true };
    }

    const localFields = withoutCanonicalBase(current.fields);
    const baseFields = priorBase?.fields || {};
    const baseSnapshot: VaultObjectSnapshot = {
      objectId: input.objectId,
      objectKind: input.objectKind,
      versionId: priorBase?.versionId || crypto.randomUUID(),
      hlc: current.hlc,
      fields: baseFields,
      fieldClocks: Object.fromEntries(Object.keys(baseFields).map((field) => [field, current.fieldClocks[field] || current.hlc])),
      tombstone: false,
      updatedAt: current.updatedAt
    };
    const localSnapshot: VaultObjectSnapshot = { ...current, fields: localFields };
    const remoteSnapshot: VaultObjectSnapshot = {
      ...snapshotFromChange(remoteChange),
      fields: canonicalFields,
      fieldClocks: Object.fromEntries(Object.keys(canonicalFields).map((field) => [field, remoteHlc]))
    };
    const merged = mergeVaultSnapshots(baseSnapshot, localSnapshot, remoteSnapshot);
    const mergeHlc = tickHlc(remoteHlc, session.deviceId, remoteHlc.wallMs);
    const mergeChange: VaultChange = {
      protocolVersion: VAULT_PROTOCOL_VERSION,
      changeId: merged.snapshot.versionId,
      objectId: input.objectId,
      objectKind: input.objectKind,
      deviceId: session.deviceId,
      hlc: mergeHlc,
      baseVersionId: current.versionId,
      fields: {
        ...merged.snapshot.fields,
        [CANONICAL_BASE_FIELD]: baseMetadata as unknown as VaultFieldValue
      },
      fieldClocks: { ...merged.snapshot.fieldClocks, [CANONICAL_BASE_FIELD]: mergeHlc },
      tombstone: merged.snapshot.tombstone,
      createdAt: new Date(mergeHlc.wallMs).toISOString()
    };
    const mergedEnvelope = await encryptVaultChange(mergeChange, session.vaultId, session.key, session.keyVersion);
    const snapshot = snapshotFromChange(mergeChange);
    await session.store.putVersion({
      versionId: snapshot.versionId,
      objectId: snapshot.objectId,
      objectKind: snapshot.objectKind,
      parentVersionIds: [current.versionId, remoteVersionId],
      envelope: mergedEnvelope,
      createdAt: snapshot.updatedAt
    });
    for (const [index, conflict] of merged.conflicts.entries()) {
      await session.store.putConflict({
        objectId: snapshot.objectId,
        conflictId: `${snapshot.versionId}-canonical-conflict-${index}`,
        field: conflict.field,
        winner: conflict.winner,
        reason: conflict.reason,
        remoteEnvelope,
        resolvedEnvelope: mergedEnvelope,
        createdAt: snapshot.updatedAt
      });
    }
    await session.store.putObject({
      objectId: snapshot.objectId,
      objectKind: snapshot.objectKind,
      versionId: snapshot.versionId,
      envelope: mergedEnvelope,
      updatedAt: snapshot.updatedAt
    });
    await session.store.queue(mergedEnvelope);
    await session.store.updateMetadata({ lastClock: mergeHlc });
    await this.mirrorEnvelopes([remoteEnvelope, mergedEnvelope]);
    void this.syncOnce().catch(() => undefined);
    return { snapshot, changed: true };
  }

  private async version(objectId: string, versionId: string): Promise<VaultObjectSnapshot | null> {
    const session = this.requireSession();
    const rows = await session.store.versions(objectId);
    const row = rows.find((candidate) => candidate.versionId === versionId);
    const envelope = row?.envelope as EncryptedChangeEnvelope | undefined;
    return envelope ? snapshotFromChange(await decryptVaultChange(envelope, session.key)) : null;
  }

  private async applyRemote(envelope: SequencedChangeEnvelope): Promise<void> {
    const session = this.requireSession();
    const initialMetadata = await session.store.metadata();
    const remoteChange = await decryptVaultChange(envelope, session.key, {
      ...(initialMetadata?.clockHealth?.orderingSafe
        ? { serverWallMs: initialMetadata.clockHealth.serverWallMs }
        : {})
    });
    const remote = snapshotFromChange(remoteChange);
    const local = await this.readObject(remote.objectId);
    await session.store.putVersion({
      versionId: remote.versionId,
      objectId: remote.objectId,
      objectKind: remote.objectKind,
      parentVersionIds: remoteChange.baseVersionId ? [remoteChange.baseVersionId] : [],
      envelope,
      createdAt: remote.updatedAt
    });
    let applied = remote;
    let appliedEnvelope: EncryptedChangeEnvelope = envelope;
    let appliedParentVersionIds = remoteChange.baseVersionId ? [remoteChange.baseVersionId] : [];
    if (local && remoteChange.baseVersionId !== local.versionId) {
      const metadata = initialMetadata || await session.store.metadata();
      if (metadata?.clockHealth?.state === "blocked" && !metadata.clockHealth.orderingSafe) {
        throw new Error("Clock health blocks newest-wins conflict resolution until server time is confirmed");
      }
      const base = remoteChange.baseVersionId ? await this.version(remote.objectId, remoteChange.baseVersionId) : null;
      if (!base) throw new Error("A divergent change is missing its base version");
      const merged = mergeVaultSnapshots(base, local, remote);
      const hlc = receiveHlc(local.hlc, remote.hlc, session.deviceId, metadata?.clockHealth?.adjustedWallMs || Date.now());
      const mergeChange: VaultChange = {
        protocolVersion: VAULT_PROTOCOL_VERSION,
        changeId: merged.snapshot.versionId,
        objectId: remote.objectId,
        objectKind: remote.objectKind,
        deviceId: session.deviceId,
        hlc,
        baseVersionId: local.versionId,
        fields: merged.snapshot.fields,
        fieldClocks: merged.snapshot.fieldClocks,
        tombstone: merged.snapshot.tombstone,
        createdAt: new Date(hlc.wallMs).toISOString()
      };
      applied = snapshotFromChange(mergeChange);
      appliedEnvelope = await encryptVaultChange(mergeChange, session.vaultId, session.key, session.keyVersion);
      appliedParentVersionIds = Array.from(new Set([local.versionId, remote.versionId]));
      await session.store.queue(appliedEnvelope);
      for (const [index, conflict] of merged.conflicts.entries()) {
        await session.store.putConflict({
          objectId: remote.objectId,
          conflictId: `${mergeChange.changeId}-conflict-${index}`,
          field: conflict.field,
          winner: conflict.winner,
          reason: conflict.reason,
          remoteEnvelope: envelope,
          resolvedEnvelope: appliedEnvelope,
          createdAt: mergeChange.createdAt
        });
      }
    }
    if (applied.versionId !== remote.versionId) {
      await session.store.putVersion({
        versionId: applied.versionId,
        objectId: applied.objectId,
        objectKind: applied.objectKind,
        parentVersionIds: appliedParentVersionIds,
        envelope: appliedEnvelope,
        createdAt: applied.updatedAt
      });
    }
    await session.store.putObject({
      objectId: applied.objectId,
      objectKind: applied.objectKind,
      versionId: applied.versionId,
      envelope: appliedEnvelope,
      updatedAt: applied.updatedAt
    });
    await this.mirrorEnvelopes(appliedEnvelope === envelope ? [envelope] : [envelope, appliedEnvelope]);
    const metadata = await session.store.metadata();
    await session.store.updateMetadata({
      lastSequence: Math.max(metadata?.lastSequence || 0, envelope.sequence),
      lastClock: receiveHlc(metadata?.lastClock || null, remote.hlc, session.deviceId, metadata?.clockHealth?.adjustedWallMs || Date.now())
    });
  }

  async syncOnce(): Promise<void> {
    if (!this.session || this.syncing) return;
    if (!navigator.onLine) {
      this.lastSyncError = "Internet connection is unavailable; encrypted changes remain queued locally";
      return;
    }
    this.syncing = true;
    try {
      const session = this.session;
      const outbox = await session.store.outbox();
      let syncChanged = outbox.length > 0;
      if (outbox.length) {
        await this.mirrorEnvelopes(outbox);
        const response = await fetch("/api/vault/sync", {
          method: "POST",
          headers: buildJsonHeadersWithCsrf(),
          body: JSON.stringify({ vaultId: session.vaultId, envelopes: outbox })
        });
        const payload = await response.json() as { ok?: boolean; acceptedChangeIds?: string[]; error?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Vault push failed");
        await session.store.acknowledge(payload.acceptedChangeIds || []);
        await this.recordClockHealth(response.headers.get("date"));
      }
      const metadata = await session.store.metadata();
      const response = await fetch(`/api/vault/sync?vaultId=${encodeURIComponent(session.vaultId)}&since=${metadata?.lastSequence || 0}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; envelopes?: SequencedChangeEnvelope[]; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Vault pull failed");
      await this.recordClockHealth(response.headers.get("date"));
      const incoming = (payload.envelopes || []).filter((item) => item.deviceId !== session.deviceId);
      syncChanged ||= incoming.length > 0;
      await session.store.storeInbox(incoming);
      const rejected: string[] = [];
      for (const item of incoming) {
        try {
          await this.applyRemote(item);
          await session.store.markInboxApplied(item.sequence);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Encrypted change failed validation";
          await session.store.markInboxRejected(item.sequence, reason);
          rejected.push(item.changeId);
        }
      }
      const highestSequence = Math.max(metadata?.lastSequence || 0, ...(payload.envelopes || []).map((item) => item.sequence));
      await session.store.updateMetadata({ lastSequence: highestSequence });
      this.lastSyncError = rejected.length
        ? `${rejected.length} encrypted change${rejected.length === 1 ? " was" : "s were"} quarantined because validation failed`
        : null;
      this.lastSyncedAt = new Date().toISOString();
      try {
        await this.reportDeviceStatus(syncChanged);
      } catch (error) {
        this.lastDeviceStatusError = error instanceof Error ? error.message : "Device sync status is unavailable";
      }
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "Encrypted relay sync failed";
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  private async reportDeviceStatus(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastDeviceHeartbeatAt < DEVICE_STATUS_HEARTBEAT_MS) return;
    const session = this.requireSession();
    const metadata = await session.store.metadata();
    if (!metadata) throw new Error("Local vault metadata is missing");
    const diagnostics = await session.store.diagnostics();
    const descriptor = await encryptVaultDeviceDescriptor({
      format: "unigentamos-vault-device-v1",
      vaultId: session.vaultId,
      deviceId: session.deviceId,
      deviceName: normalizedDeviceName(metadata.deviceName, "Browser device"),
      deviceKind: currentDeviceKind()
    }, session.key, session.keyVersion);
    const response = await fetch("/api/vault/devices", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({
        vaultId: session.vaultId,
        deviceId: session.deviceId,
        descriptor,
        acknowledgedSequence: metadata.lastSequence,
        pendingChanges: diagnostics.outbox,
        blockedChanges: diagnostics.blockedChanges
      })
    });
    const payload = await response.json() as {
      ok?: boolean;
      relayHeadSequence?: number;
      devices?: EncryptedVaultDeviceStatus[];
      error?: string;
    };
    if (!response.ok || !payload.ok || !Number.isSafeInteger(payload.relayHeadSequence) || !Array.isArray(payload.devices)) {
      throw new Error(payload.error || "Device sync status is unavailable");
    }
    let unreadable = 0;
    const devices = await Promise.all(payload.devices.map(async (item) => {
      try {
        return { ...item, descriptor: await decryptVaultDeviceDescriptor(item.descriptor, session.key) };
      } catch {
        unreadable += 1;
        return {
          ...item,
          descriptor: {
            format: "unigentamos-vault-device-v1" as const,
            vaultId: session.vaultId,
            deviceId: item.deviceId,
            deviceName: "Unreadable device",
            deviceKind: "browser" as const
          }
        };
      }
    }));
    this.deviceStatusSnapshot = {
      relayHeadSequence: payload.relayHeadSequence as number,
      devices,
      refreshedAt: new Date().toISOString()
    };
    this.lastDeviceStatusError = unreadable
      ? `${unreadable} encrypted device descriptor${unreadable === 1 ? " is" : "s are"} unreadable`
      : null;
    this.lastDeviceHeartbeatAt = now;
  }

  async refreshDeviceStatuses(): Promise<void> {
    if (!this.session) throw new Error("Unlock the local vault first");
    await this.reportDeviceStatus(true);
  }

  private async mirrorEnvelopes(envelopes: readonly EncryptedChangeEnvelope[]): Promise<void> {
    if (!this.companionCapability || !envelopes.length) return;
    const session = this.requireSession();
    for (const envelope of envelopes) await session.store.queueDesktop(envelope);
    const pending = await session.store.desktopOutbox(100);
    if (!pending.length) return;
    try {
      const response = await fetch("http://127.0.0.1:43127/v1/envelopes", {
        method: "POST",
        mode: "cors",
        headers: { Authorization: `Bearer ${this.companionCapability}`, "Content-Type": "application/json" },
        body: JSON.stringify({ envelopes: pending })
      });
      const payload = await response.json() as { ok?: boolean; acceptedChangeIds?: string[]; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Desktop vault mirror failed");
      await session.store.acknowledgeDesktop(payload.acceptedChangeIds || []);
    } catch (error) {
      window.dispatchEvent(new CustomEvent("unigentamos-vault-mirror-error", {
        detail: { message: error instanceof Error ? error.message : "Desktop vault mirror is queued" }
      }));
    }
  }

  async createDesktopBackup(): Promise<{ backupId: string; location: string }> {
    if (!this.companionCapability) throw new Error("Unlock the desktop companion first");
    const response = await fetch("http://127.0.0.1:43127/v1/backups", {
      method: "POST",
      mode: "cors",
      headers: { Authorization: `Bearer ${this.companionCapability}` }
    });
    const payload = await response.json() as { ok?: boolean; backupId?: string; location?: string; error?: string };
    if (!response.ok || !payload.ok || !payload.backupId || !payload.location) throw new Error(payload.error || "Desktop backup failed");
    return { backupId: payload.backupId, location: payload.location };
  }

  private async recordClockHealth(serverDate: string | null) {
    if (!this.session) return;
    await this.session.store.updateMetadata({ clockHealth: assessClockHealth(Date.now(), serverDate) });
  }

  startSync(intervalMs = 2_000) {
    this.stopSync();
    const run = async () => {
      await this.syncOnce().catch(() => undefined);
      if (this.session) this.syncTimer = setTimeout(run, intervalMs);
    };
    void run();
  }

  stopSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
  }

  async companionStatus(): Promise<{ available: boolean; version?: string; configured?: boolean; unlocked?: boolean; pairingRequired?: boolean }> {
    try {
      const response = await fetch("http://127.0.0.1:43127/health", { mode: "cors", cache: "no-store", signal: AbortSignal.timeout(2_500) });
      if (!response.ok) return { available: false };
      const payload = await response.json() as { version?: string; configured?: boolean; unlocked?: boolean; pairingRequired?: boolean };
      return {
        available: true,
        ...(payload.version ? { version: payload.version } : {}),
        configured: Boolean(payload.configured),
        unlocked: Boolean(payload.unlocked),
        pairingRequired: Boolean(payload.pairingRequired)
      };
    } catch {
      return { available: false };
    }
  }
}

export const browserVault = new BrowserVaultEngine();
