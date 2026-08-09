export const VAULT_PROTOCOL_VERSION = 1 as const;
export const VAULT_ENVELOPE_VERSION = 1 as const;

export type VaultObjectKind =
  | "note"
  | "contact"
  | "resource"
  | "media"
  | "project"
  | "personal_ops"
  | "review"
  | "finance"
  | "settings"
  | "other";

export type HybridLogicalClock = {
  wallMs: number;
  counter: number;
  deviceId: string;
};

export type ClockHealth = {
  state: "healthy" | "warning" | "blocked";
  observedAt: string;
  localWallMs: number;
  serverWallMs: number;
  skewMs: number;
  adjustedWallMs: number;
  orderingSafe: boolean;
  reason: string;
};

export type VaultJsonValue = string | number | boolean | null | VaultJsonValue[] | { [key: string]: VaultJsonValue };
export type VaultFieldValue = VaultJsonValue;

export type VaultChange = {
  protocolVersion: typeof VAULT_PROTOCOL_VERSION;
  changeId: string;
  objectId: string;
  objectKind: VaultObjectKind;
  deviceId: string;
  hlc: HybridLogicalClock;
  baseVersionId?: string;
  fields: Record<string, VaultFieldValue>;
  fieldClocks: Record<string, HybridLogicalClock>;
  tombstone?: boolean;
  restoredFromVersionId?: string;
  createdAt: string;
};

export type EncryptedChangeEnvelope = {
  envelopeVersion: typeof VAULT_ENVELOPE_VERSION;
  vaultId: string;
  changeId: string;
  deviceId: string;
  keyVersion: number;
  iv: string;
  ciphertext: string;
  aadHash: string;
  byteLength: number;
};

export type SequencedChangeEnvelope = EncryptedChangeEnvelope & {
  sequence: number;
  receivedAt: string;
};

export type VaultDeviceKind = "windows" | "iphone" | "ipad" | "macbook" | "browser";

export type VaultDeviceDescriptor = {
  format: "unigentamos-vault-device-v1";
  vaultId: string;
  deviceId: string;
  deviceName: string;
  deviceKind: VaultDeviceKind;
};

export type EncryptedVaultDeviceDescriptor = {
  descriptorVersion: typeof VAULT_ENVELOPE_VERSION;
  vaultId: string;
  deviceId: string;
  keyVersion: number;
  iv: string;
  ciphertext: string;
  aadHash: string;
  byteLength: number;
};

export type VaultDeviceLifecycle = "active" | "retired";

export type EncryptedVaultDeviceStatus = {
  deviceId: string;
  descriptor: EncryptedVaultDeviceDescriptor;
  lifecycle: VaultDeviceLifecycle;
  retiredAt: string | null;
  acknowledgedSequence: number;
  pendingChanges: number;
  blockedChanges: number;
  lastSeenAt: string;
  lastSyncedAt: string | null;
};

export type VaultDeviceStatus = Omit<EncryptedVaultDeviceStatus, "descriptor"> & {
  descriptor: VaultDeviceDescriptor;
};

export type VaultRelayHealth = {
  relayRows: number;
  relayBytes: number;
  rowLimit: number;
  byteLimit: number;
  activeDevices: number;
  retiredDevices: number;
  safeCompactionSequence: number;
  lastCompactedAt: string | null;
  lastDeletedChanges: number;
};

export type VaultDeviceStatusSnapshot = {
  relayHeadSequence: number;
  devices: VaultDeviceStatus[];
  relayHealth: VaultRelayHealth;
  refreshedAt: string;
};

export type VaultCompactionResult = {
  safeSequence: number;
  deletedChanges: number;
  retainedChanges: number;
  activeDevices: number;
  outcome: "compacted" | "nothing_to_compact" | "devices_not_caught_up" | "no_active_devices";
  relayHealth: VaultRelayHealth;
};

export type VaultBrowserStorageHealth = {
  persistenceSupported: boolean;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
};

export type VaultCompanionBackupHealth = {
  destination: "vault-folder" | "custom-folder" | "separate-drive";
  count: number;
  limit: number;
  lastCreatedAt: string | null;
  lastVerifiedAt: string | null;
  automaticEveryDays: number;
  lastAutomaticError: string | null;
};

export type VaultCompanionStatus = {
  available: boolean;
  version?: string;
  configured?: boolean;
  unlocked?: boolean;
  pairingRequired?: boolean;
  backup?: VaultCompanionBackupHealth;
};

export type VaultKeyEnvelope = {
  envelopeVersion: typeof VAULT_ENVELOPE_VERSION;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  keyVersion: number;
  createdAt: string;
};

export type VaultRecoveryPackage = {
  format: "unigentamos-vault-recovery-v1";
  vaultId: string;
  keyVersion: number;
  keyEnvelope: VaultKeyEnvelope;
  createdAt: string;
};

export type VaultVersion = {
  versionId: string;
  objectId: string;
  objectKind: VaultObjectKind;
  parentVersionIds: readonly string[];
  changeId: string;
  deviceId: string;
  hlc: HybridLogicalClock;
  encryptedSnapshot: EncryptedChangeEnvelope;
  createdAt: string;
};

export type VaultObjectSnapshot = {
  objectId: string;
  objectKind: VaultObjectKind;
  versionId: string;
  hlc: HybridLogicalClock;
  fields: Record<string, VaultFieldValue>;
  fieldClocks: Record<string, HybridLogicalClock>;
  tombstone: boolean;
  restoredFromVersionId?: string;
  updatedAt: string;
};

export type VaultMediaManifest = {
  format: "unigentamos-vault-media-v1";
  mediaId: string;
  objectId: string;
  contentRoot: string;
  digestAlgorithm: "chunk-root-v1";
  fileName: string;
  mimeType: string;
  byteLength: number;
  chunkSize: number;
  totalChunks: number;
  createdAt: string;
};

export type EncryptedVaultMediaChunk = {
  format: "unigentamos-vault-media-chunk-v1";
  vaultId: string;
  mediaId: string;
  contentRoot: string;
  chunkIndex: number;
  totalChunks: number;
  keyVersion: number;
  iv: string;
  ciphertext: string;
  aadHash: string;
  plaintextHash: string;
  byteLength: number;
};

export type VaultBackupSummary = {
  backupId: string;
  createdAt: string;
  verified: boolean;
  databaseBytes: number;
  mediaFiles: number;
  mediaBytes: number;
};

export type VaultBackupRestorePreview = VaultBackupSummary & {
  currentObjects: number;
  backupObjects: number;
  currentVersions: number;
  backupVersions: number;
  restorableVersions: number;
  restorableMediaFiles: number;
};

export type MergeConflict = {
  objectId: string;
  field: string;
  winner: "local" | "remote";
  reason: "overlapping_text" | "high_integrity_overlap" | "same_field_overlap";
  losingValue: VaultFieldValue | undefined;
  losingClock: HybridLogicalClock;
};

export type MergeResult = {
  snapshot: VaultObjectSnapshot;
  conflicts: readonly MergeConflict[];
  autoMergedFields: readonly string[];
};

export const HIGH_INTEGRITY_FIELDS: Readonly<Record<VaultObjectKind, readonly string[]>> = {
  note: [],
  contact: [],
  resource: [],
  media: ["rights", "checksum", "storageLocator"],
  project: ["archivedAt", "completedAt"],
  personal_ops: ["archivedAt", "completedAt", "decisionState"],
  review: ["lifecycle", "completedAt", "waiver"],
  finance: ["amount", "direction", "accountId", "transferId", "status", "archivedAt", "completedAt"],
  settings: ["vaultKey", "deviceTrust", "backupPolicy"],
  other: []
};
