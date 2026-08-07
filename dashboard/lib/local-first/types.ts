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
  updatedAt: string;
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
