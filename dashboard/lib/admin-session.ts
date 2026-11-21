import { cookies } from "next/headers";
import { legacyAdminEnabled } from "./account-mode";
import {
  getAdminSessionSecret,
  isSignedAdminSessionTokenValid
} from "./auth";

export async function hasAdminSession(): Promise<boolean> {
  if (!legacyAdminEnabled()) return false;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token) {
    return false;
  }

  const sessionSecret = getAdminSessionSecret(adminPassword);
  return isSignedAdminSessionTokenValid(token, sessionSecret);
}
