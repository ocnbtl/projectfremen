import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import {
  createCredential,
  deleteCredential,
  listCredentialDetails,
  listCredentialSummaries,
  PersonalPasswordsStoreError,
  readCredentialDetail,
  updateCredential
} from "../../../../lib/modules/personal-passwords/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function failure(error: unknown) {
  if (error instanceof PersonalPasswordsStoreError) {
    return json({ ok: false, error: error.message }, error.status);
  }
  return json({ ok: false, error: "The encrypted password request failed" }, 500);
}

async function authorizeMutation(request: Request, action: string) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  if (isCsrfRequestValid(request)) return null;
  await appendAuditEvent({
    at: new Date().toISOString(),
    action: `${action}.csrf_failed`,
    path: new URL(request.url).pathname,
    method: request.method,
    ip: getRequestIp(request),
    status: "denied"
  });
  return json({ ok: false, error: "Invalid CSRF token" }, 403);
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    const includeSecrets = url.searchParams.get("includeSecrets") === "true";
    if (id) {
      const item = await readCredentialDetail(id);
      return item ? json({ ok: true, item }) : json({ ok: false, error: "Credential not found" }, 404);
    }
    if (includeSecrets) return json({ ok: true, items: await listCredentialDetails() });
    return json({ ok: true, items: await listCredentialSummaries() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const denied = await authorizeMutation(request, "personal_passwords.create");
  if (denied) return denied;
  try {
    const body = await request.json() as { input?: unknown };
    const item = await createCredential(body.input);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal_passwords.create.success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: item.id
    });
    return json({ ok: true, item });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  const denied = await authorizeMutation(request, "personal_passwords.update");
  if (denied) return denied;
  try {
    const body = await request.json() as {
      id?: unknown;
      expectedUpdatedAt?: unknown;
      input?: unknown;
    };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id || !expectedUpdatedAt) {
      throw new PersonalPasswordsStoreError("Credential id and expectedUpdatedAt are required");
    }
    const item = await updateCredential(id, expectedUpdatedAt, body.input);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal_passwords.update.success",
      path: new URL(request.url).pathname,
      method: "PATCH",
      ip: getRequestIp(request),
      status: "ok",
      detail: item.id
    });
    return json({ ok: true, item });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const denied = await authorizeMutation(request, "personal_passwords.delete");
  if (denied) return denied;
  try {
    const body = await request.json() as { id?: unknown; expectedUpdatedAt?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id || !expectedUpdatedAt) {
      throw new PersonalPasswordsStoreError("Credential id and expectedUpdatedAt are required");
    }
    await deleteCredential(id, expectedUpdatedAt);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal_passwords.delete.success",
      path: new URL(request.url).pathname,
      method: "DELETE",
      ip: getRequestIp(request),
      status: "ok",
      detail: id
    });
    return json({ ok: true, id });
  } catch (error) {
    return failure(error);
  }
}
