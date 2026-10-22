import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_VERSION = "v1";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function buildSessionSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function getAdminSessionSecret(adminPassword: string): string {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  return configured || adminPassword;
}

export function buildSignedAdminSessionToken(secret: string, maxAgeSeconds: number): string {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const nonce = randomBytes(12).toString("base64url");
  const payload = `${SESSION_VERSION}.${expiresAt}.${nonce}`;
  const signature = buildSessionSignature(payload, secret);
  return `${payload}.${signature}`;
}

export function isSignedAdminSessionTokenValid(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const [version, expiresAtRaw, nonce, signature] = parts;
  if (version !== SESSION_VERSION || !nonce || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const payload = `${version}.${expiresAtRaw}.${nonce}`;
  const expectedSignature = buildSessionSignature(payload, secret);
  return safeEqual(signature, expectedSignature);
}
