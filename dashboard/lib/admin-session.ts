import { cookies } from "next/headers";
import {
  buildAdminSessionToken,
  getAdminSessionSecret,
  isLegacyAdminSessionTokenValid,
  isSignedAdminSessionTokenValid
} from "./auth";

export async function hasAdminSession(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token) {
    return false;
  }

  const sessionSecret = getAdminSessionSecret(adminPassword);
  if (isSignedAdminSessionTokenValid(token, sessionSecret)) {
    return true;
  }

  // Backward compatibility for previously issued deterministic tokens.
  if (isLegacyAdminSessionTokenValid(token, adminPassword)) {
    return true;
  }

  const expected = await buildAdminSessionToken(adminPassword);
  return Boolean(token && token === expected);
}
