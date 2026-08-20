import { readJsonFile, writeJsonFile } from "../../file-store";

const MAX_PROFILE_PHOTO_BYTES = 1_500_000;
const ALLOWED_PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type StoredPeopleProfilePhoto = {
  personId: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytesBase64: string;
  byteLength: number;
  updatedAt: string;
};

function assertPersonId(personId: string): string {
  const clean = personId.trim();
  if (!/^personal-[0-9a-f-]{36}$/i.test(clean)) throw new Error("Invalid People profile id");
  return clean;
}

function fileName(personId: string): string {
  return `people-profile-photo-${assertPersonId(personId)}.json`;
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function readPeopleProfilePhoto(personId: string): Promise<StoredPeopleProfilePhoto | null> {
  return readJsonFile<StoredPeopleProfilePhoto | null>(fileName(personId), null);
}

export async function writePeopleProfilePhoto(
  personId: string,
  mimeType: string,
  bytes: Uint8Array
): Promise<StoredPeopleProfilePhoto> {
  const cleanId = assertPersonId(personId);
  if (!ALLOWED_PROFILE_PHOTO_TYPES.has(mimeType)) throw new Error("Profile pictures must be JPEG, PNG, or WebP images.");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Profile pictures must be 1.5 MB or smaller after preparation.");
  }
  if (!hasExpectedSignature(bytes, mimeType)) throw new Error("The uploaded file does not match its image type.");
  const photo: StoredPeopleProfilePhoto = {
    personId: cleanId,
    mimeType: mimeType as StoredPeopleProfilePhoto["mimeType"],
    bytesBase64: Buffer.from(bytes).toString("base64"),
    byteLength: bytes.byteLength,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(fileName(cleanId), photo);
  return photo;
}

export async function removePeopleProfilePhoto(personId: string): Promise<void> {
  await writeJsonFile(fileName(personId), null);
}
