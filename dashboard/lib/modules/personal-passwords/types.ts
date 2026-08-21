export const PERSONAL_PASSWORDS_SCHEMA_VERSION = 1 as const;

export type EncryptedCredentialEnvelope = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type EncryptedCredentialRecord = {
  id: string;
  encrypted: EncryptedCredentialEnvelope;
  createdAt: string;
  updatedAt: string;
};

export type PersonalPasswordsState = {
  schemaVersion: typeof PERSONAL_PASSWORDS_SCHEMA_VERSION;
  items: EncryptedCredentialRecord[];
};

export type CredentialInput = {
  title: string;
  username: string;
  email: string;
  secret: string;
  website: string;
  notes: string;
};

export type CredentialSummary = Omit<CredentialInput, "secret"> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type CredentialDetail = CredentialSummary & Pick<CredentialInput, "secret">;
