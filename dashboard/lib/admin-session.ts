import { cookies } from "next/headers";
import { buildAdminSessionToken } from "./auth";

export async function hasAdminSession(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const expected = await buildAdminSessionToken(adminPassword);
  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  return Boolean(token && token === expected);
}
