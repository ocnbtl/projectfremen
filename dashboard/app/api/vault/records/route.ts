import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import type { VaultPendingCanonicalCommand } from "../../../../lib/local-first/canonical-record";
import { reconcileCanonicalRecord } from "../../../../lib/local-first/canonical-record-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 128 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function commandFrom(value: unknown): VaultPendingCanonicalCommand | null {
  if (!isRecord(value) || !isRecord(value.command)) return null;
  const command = value.command;
  if (
    command.format !== "unigentamos-canonical-command-v1"
    || typeof command.commandId !== "string"
    || typeof command.canonicalId !== "string"
    || !["create", "update"].includes(String(command.operation))
    || typeof command.queuedAt !== "string"
    || !Number.isFinite(Date.parse(command.queuedAt))
    || !isRecord(command.baseFields)
    || !isRecord(command.patch)
  ) return null;
  if (!/^[0-9a-f-]{36}$/i.test(command.commandId) || command.canonicalId.length > 700) return null;
  return command as unknown as VaultPendingCanonicalCommand;
}

async function audit(request: Request, action: string, status: "ok" | "error" | "denied", detail?: string) {
  await appendAuditEvent({
    at: new Date().toISOString(),
    action,
    path: new URL(request.url).pathname,
    method: "POST",
    ip: getRequestIp(request),
    status,
    ...(detail ? { detail } : {})
  });
}

export async function POST(request: Request) {
  if (!await hasAdminSession()) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCsrfRequestValid(request)) {
    await audit(request, "vault.canonical.csrf_failed", "denied");
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "Offline change is too large" }, { status: 413 });
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Offline change is too large" }, { status: 413 });
    }
    const command = commandFrom(JSON.parse(raw));
    if (!command) return NextResponse.json({ ok: false, error: "Offline change is invalid" }, { status: 400 });
    const result = await reconcileCanonicalRecord(command);
    await audit(request, "vault.canonical.reconciled", "ok", `${command.operation}:${command.canonicalId}`);
    return NextResponse.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "no-store, private", Date: new Date().toUTCString() }
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && Number.isInteger(error.status)
      ? Number(error.status)
      : error instanceof SyntaxError ? 400 : 409;
    const message = error instanceof Error ? error.message : "Offline change could not be reconciled";
    await audit(request, "vault.canonical.failed", "error", message.slice(0, 300));
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
