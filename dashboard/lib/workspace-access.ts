import { createHash, randomBytes } from "node:crypto";
import { isCsrfRequestValid } from "./csrf";
import { individualAccountsEnabled, publicAccountOrigin } from "./account-mode";

export { individualAccountsEnabled };
export const SESSION_COOKIE = "workspace_session";
export const SESSION_SECONDS = 12 * 60 * 60;
export type WorkspaceRole = "owner" | "editor" | "viewer";
export type WorkspaceAccess = { userId: string; workspaceId: string; role: WorkspaceRole };
export class WorkspaceAccessError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function privateJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie" },
  });
}
export function workspaceAccessError(error: unknown) {
  if (error instanceof WorkspaceAccessError)
    return privateJson({ ok: false, error: error.message }, error.status);
  return privateJson({ ok: false, error: "The workspace service is unavailable." }, 503);
}
export function isAccountId(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}
export function randomSecret() {
  return randomBytes(32).toString("base64url");
}
export function secretHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function requireAccountMode() {
  if (!individualAccountsEnabled()) throw new WorkspaceAccessError(404, "Unavailable.");
}
export function requireAccountOrigin(request: Request) {
  requireAccountMode();
  const expected = publicAccountOrigin();
  if (!expected) throw new WorkspaceAccessError(503, "The public workspace origin needs configuration.");
  if (request.headers.get("origin") !== expected)
    throw new WorkspaceAccessError(403, "This action requires the workspace origin.");
  return expected;
}
export async function accountInput(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new WorkspaceAccessError(415, "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new WorkspaceAccessError(400, "Missing request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new WorkspaceAccessError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkspaceAccessError(400, "Invalid JSON request.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new WorkspaceAccessError(400, "Invalid request.");
  return data as Record<string, unknown>;
}

function providerUrl() {
  const configured = process.env.SUPABASE_URL?.trim();
  if (!configured) throw new WorkspaceAccessError(503, "Workspace services need configuration.");
  const url = new URL(configured);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    throw new WorkspaceAccessError(503, "Workspace services require a secure connection.");
  return url.origin;
}

/** Server only. Callers supply a fixed REST table or RPC name and encode filters separately. */
export function workspaceDatabase(path: string, init: RequestInit = {}): Promise<Response> {
  requireAccountMode();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || !/^(?:rpc\/)?[a-z][a-z0-9_]*(?:\?[^#]*)?$/.test(path))
    throw new WorkspaceAccessError(503, "Workspace database unavailable.");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  if (!key.startsWith("sb_secret_")) headers.set("Authorization", "Bearer " + key);
  headers.set("Content-Type", "application/json");
  return fetch(providerUrl() + "/rest/v1/" + path, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
  });
}
export function accountAuth(path: string, init: RequestInit): Promise<Response> {
  requireAccountMode();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!key) throw new WorkspaceAccessError(503, "Account sign-in needs configuration.");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Content-Type", "application/json");
  return fetch(providerUrl() + "/auth/v1/" + path, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
  });
}
export async function accountRpc(name: string, args: Record<string, unknown>) {
  const response = await workspaceDatabase("rpc/" + name, { method: "POST", body: JSON.stringify(args) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (["PT400", "PT403", "PT404"].includes(error.code))
      throw new WorkspaceAccessError(Number(error.code.slice(2)), String(error.message));
    throw new WorkspaceAccessError(503, "Workspace database unavailable.");
  }
  return response.status === 204 ? null : response.json();
}
export function accountCookie(request: Request, name: string) {
  const item = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="));
  return item?.slice(name.length + 1) || "";
}
export async function requireAccount(
  request: Request,
): Promise<{ userId: string; sessionId: string; email: string }> {
  requireAccountMode();
  if (!["GET", "HEAD"].includes(request.method)) {
    requireAccountOrigin(request);
    if (!isCsrfRequestValid(request)) throw new WorkspaceAccessError(403, "Refresh the page and retry.");
  }
  const token = accountCookie(request, SESSION_COOKIE);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new WorkspaceAccessError(401, "Sign in to continue.");
  const rows = await accountRpc("resolve_account_session", { p_hash: secretHash(token) });
  const [row] = rows;
  if (!isAccountId(row?.user_id) || !isAccountId(row?.session_id) || typeof row.email !== "string")
    throw new WorkspaceAccessError(401, "Sign in to continue.");
  return { userId: row.user_id, sessionId: row.session_id, email: row.email };
}
export async function requireWorkspaceAccess(
  request: Request,
  workspaceId: string,
  permission: "read" | "write" | "manage",
): Promise<WorkspaceAccess> {
  const { userId } = await requireAccount(request);
  if (!isAccountId(workspaceId)) throw new WorkspaceAccessError(404, "Workspace unavailable.");
  const query = new URLSearchParams({
    select: "role,expires_at",
    workspace_id: "eq." + workspaceId,
    user_id: "eq." + userId,
  });
  const response = await workspaceDatabase("account_workspace_members?" + query);
  if (!response.ok) throw new WorkspaceAccessError(503, "Workspace database unavailable.");
  const [member] = await response.json();
  if (
    !member ||
    !["owner", "editor", "viewer"].includes(member.role) ||
    (member.expires_at !== null && !(Date.parse(member.expires_at) > Date.now()))
  )
    throw new WorkspaceAccessError(404, "Workspace unavailable.");
  if (
    (permission === "write" && member.role === "viewer") ||
    (permission === "manage" && member.role !== "owner")
  )
    throw new WorkspaceAccessError(403, "Your workspace role does not allow this action.");
  return { userId, workspaceId: workspaceId.toLowerCase(), role: member.role };
}
