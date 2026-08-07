"use client";

import type {
  ClockHealth,
  EncryptedChangeEnvelope,
  HybridLogicalClock,
  SequencedChangeEnvelope,
  VaultKeyEnvelope,
  VaultObjectKind
} from "./types";

const DATABASE_NAME = "unigentamos-vault-v1";
const DATABASE_VERSION = 2;
const CHANNEL_NAME = "unigentamos-vault-events";

export type VaultMetadata = {
  id: "vault";
  vaultId: string;
  deviceId: string;
  deviceName: string;
  keyEnvelope: VaultKeyEnvelope;
  keyVersion: number;
  lastSequence: number;
  lastClock: HybridLogicalClock | null;
  clockHealth: ClockHealth | null;
  createdAt: string;
  updatedAt: string;
};

type StoredObjectEnvelope = {
  objectId: string;
  objectKind: VaultObjectKind;
  versionId: string;
  envelope: EncryptedChangeEnvelope;
  updatedAt: string;
};

type OutboxRow = EncryptedChangeEnvelope & { queuedAt: string; attempts: number };
type InboxRow = SequencedChangeEnvelope & { appliedAt?: string; rejectedAt?: string; rejectionReason?: string };

function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted"));
  });
}

export function openVaultDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error("Unable to open the local vault"));
    request.onblocked = () => reject(new Error("Close other Unigentamos tabs so the local vault can be upgraded"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("metadata")) database.createObjectStore("metadata", { keyPath: "id" });
      if (!database.objectStoreNames.contains("objects")) {
        const objects = database.createObjectStore("objects", { keyPath: "objectId" });
        objects.createIndex("objectKind", "objectKind", { unique: false });
        objects.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains("versions")) {
        const versions = database.createObjectStore("versions", { keyPath: "versionId" });
        versions.createIndex("objectId", "objectId", { unique: false });
      }
      if (!database.objectStoreNames.contains("outbox")) {
        const outbox = database.createObjectStore("outbox", { keyPath: "changeId" });
        outbox.createIndex("queuedAt", "queuedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains("desktopOutbox")) {
        const desktopOutbox = database.createObjectStore("desktopOutbox", { keyPath: "changeId" });
        desktopOutbox.createIndex("queuedAt", "queuedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains("inbox")) {
        const inbox = database.createObjectStore("inbox", { keyPath: "sequence" });
        inbox.createIndex("changeId", "changeId", { unique: true });
      }
      if (!database.objectStoreNames.contains("conflicts")) database.createObjectStore("conflicts", { keyPath: "conflictId" });
      if (!database.objectStoreNames.contains("media")) database.createObjectStore("media", { keyPath: "digest" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function notify(type: string, detail: Record<string, unknown> = {}) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type, ...detail });
  channel.close();
}

export class BrowserVaultStore {
  private constructor(private readonly database: IDBDatabase) {}

  static async open(): Promise<BrowserVaultStore> {
    return new BrowserVaultStore(await openVaultDatabase());
  }

  close() {
    this.database.close();
  }

  async requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  }

  async diagnostics(): Promise<{ objects: number; versions: number; outbox: number; desktopOutbox: number; inbox: number; conflicts: number; media: number; blockedChanges: number }> {
    const names = ["objects", "versions", "outbox", "desktopOutbox", "inbox", "conflicts", "media"] as const;
    const transaction = this.database.transaction(names, "readonly");
    const [counts, inboxRows] = await Promise.all([
      Promise.all(names.map((name) => requestResult(transaction.objectStore(name).count()))),
      requestResult(transaction.objectStore("inbox").getAll()) as Promise<InboxRow[]>
    ]);
    return { ...Object.fromEntries(names.map((name, index) => [name, counts[index]])), blockedChanges: inboxRows.filter((row) => Boolean(row.rejectedAt)).length } as {
      objects: number;
      versions: number;
      outbox: number;
      desktopOutbox: number;
      inbox: number;
      conflicts: number;
      media: number;
      blockedChanges: number;
    };
  }

  async metadata(): Promise<VaultMetadata | null> {
    const transaction = this.database.transaction("metadata", "readonly");
    return (await requestResult(transaction.objectStore("metadata").get("vault"))) || null;
  }

  async initialize(input: Omit<VaultMetadata, "id" | "lastSequence" | "lastClock" | "clockHealth" | "createdAt" | "updatedAt">): Promise<VaultMetadata> {
    const existing = await this.metadata();
    if (existing) throw new Error("This browser already has a configured vault");
    const now = new Date().toISOString();
    const metadata: VaultMetadata = {
      id: "vault",
      ...input,
      lastSequence: 0,
      lastClock: null,
      clockHealth: null,
      createdAt: now,
      updatedAt: now
    };
    const transaction = this.database.transaction("metadata", "readwrite");
    transaction.objectStore("metadata").add(metadata);
    await transactionDone(transaction);
    notify("vault-initialized", { vaultId: metadata.vaultId });
    return metadata;
  }

  async updateMetadata(patch: Partial<Omit<VaultMetadata, "id" | "vaultId" | "deviceId" | "createdAt">>): Promise<VaultMetadata> {
    const current = await this.metadata();
    if (!current) throw new Error("Local vault is not configured");
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const transaction = this.database.transaction("metadata", "readwrite");
    transaction.objectStore("metadata").put(next);
    await transactionDone(transaction);
    return next;
  }

  async queue(envelope: EncryptedChangeEnvelope): Promise<void> {
    const row: OutboxRow = { ...envelope, queuedAt: new Date().toISOString(), attempts: 0 };
    const transaction = this.database.transaction("outbox", "readwrite");
    transaction.objectStore("outbox").put(row);
    await transactionDone(transaction);
    notify("outbox-changed", { changeId: envelope.changeId });
  }

  async queueDesktop(envelope: EncryptedChangeEnvelope): Promise<void> {
    const row: OutboxRow = { ...envelope, queuedAt: new Date().toISOString(), attempts: 0 };
    const transaction = this.database.transaction("desktopOutbox", "readwrite");
    transaction.objectStore("desktopOutbox").put(row);
    await transactionDone(transaction);
  }

  async desktopOutbox(limit = 100): Promise<OutboxRow[]> {
    const transaction = this.database.transaction("desktopOutbox", "readonly");
    return requestResult(transaction.objectStore("desktopOutbox").index("queuedAt").getAll(null, Math.min(Math.max(limit, 1), 500))) as Promise<OutboxRow[]>;
  }

  async acknowledgeDesktop(changeIds: readonly string[]): Promise<void> {
    const transaction = this.database.transaction("desktopOutbox", "readwrite");
    const store = transaction.objectStore("desktopOutbox");
    for (const changeId of changeIds) store.delete(changeId);
    await transactionDone(transaction);
  }

  async outbox(limit = 100): Promise<OutboxRow[]> {
    const transaction = this.database.transaction("outbox", "readonly");
    const rows = await requestResult(transaction.objectStore("outbox").index("queuedAt").getAll(null, Math.min(Math.max(limit, 1), 500)));
    return rows as OutboxRow[];
  }

  async acknowledge(changeIds: readonly string[]): Promise<void> {
    const transaction = this.database.transaction("outbox", "readwrite");
    const store = transaction.objectStore("outbox");
    for (const changeId of changeIds) store.delete(changeId);
    await transactionDone(transaction);
    notify("outbox-changed", { acknowledged: changeIds.length });
  }

  async storeInbox(envelopes: readonly SequencedChangeEnvelope[]): Promise<void> {
    if (!envelopes.length) return;
    const transaction = this.database.transaction("inbox", "readwrite");
    const store = transaction.objectStore("inbox");
    for (const envelope of envelopes) store.put(envelope satisfies InboxRow);
    await transactionDone(transaction);
    notify("inbox-changed", { count: envelopes.length });
  }

  async pendingInbox(limit = 200): Promise<InboxRow[]> {
    const transaction = this.database.transaction("inbox", "readonly");
    const rows = await requestResult(transaction.objectStore("inbox").getAll(null, Math.min(Math.max(limit, 1), 500)));
    return (rows as InboxRow[]).filter((row) => !row.appliedAt && !row.rejectedAt).sort((left, right) => left.sequence - right.sequence);
  }

  async markInboxApplied(sequence: number): Promise<void> {
    const transaction = this.database.transaction("inbox", "readwrite");
    const store = transaction.objectStore("inbox");
    const row = await requestResult(store.get(sequence)) as InboxRow | undefined;
    if (row) store.put({ ...row, appliedAt: new Date().toISOString() });
    await transactionDone(transaction);
  }

  async markInboxRejected(sequence: number, reason: string): Promise<void> {
    const transaction = this.database.transaction("inbox", "readwrite");
    const store = transaction.objectStore("inbox");
    const row = await requestResult(store.get(sequence)) as InboxRow | undefined;
    if (row) store.put({ ...row, rejectedAt: new Date().toISOString(), rejectionReason: reason.slice(0, 500) });
    await transactionDone(transaction);
  }

  async putObject(row: StoredObjectEnvelope): Promise<void> {
    const transaction = this.database.transaction("objects", "readwrite");
    transaction.objectStore("objects").put(row);
    await transactionDone(transaction);
    notify("object-changed", { objectId: row.objectId, objectKind: row.objectKind });
  }

  async object(objectId: string): Promise<StoredObjectEnvelope | null> {
    const transaction = this.database.transaction("objects", "readonly");
    return (await requestResult(transaction.objectStore("objects").get(objectId))) || null;
  }

  async objects(kinds?: readonly VaultObjectKind[]): Promise<StoredObjectEnvelope[]> {
    const transaction = this.database.transaction("objects", "readonly");
    const rows = await requestResult(transaction.objectStore("objects").getAll()) as StoredObjectEnvelope[];
    return kinds?.length ? rows.filter((row) => kinds.includes(row.objectKind)) : rows;
  }

  async putVersion(row: Record<string, unknown> & { versionId: string; objectId: string }): Promise<void> {
    const transaction = this.database.transaction("versions", "readwrite");
    transaction.objectStore("versions").put(row);
    await transactionDone(transaction);
  }

  async versions(objectId: string): Promise<Array<Record<string, unknown>>> {
    const transaction = this.database.transaction("versions", "readonly");
    return requestResult(transaction.objectStore("versions").index("objectId").getAll(objectId)) as Promise<Array<Record<string, unknown>>>;
  }

  async putConflict(row: Record<string, unknown> & { conflictId: string }): Promise<void> {
    const transaction = this.database.transaction("conflicts", "readwrite");
    transaction.objectStore("conflicts").put(row);
    await transactionDone(transaction);
  }
}
