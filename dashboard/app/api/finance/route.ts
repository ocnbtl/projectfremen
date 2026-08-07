import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { appendAuditEvent as appendGlobalAuditEvent, getRequestIp } from "../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../lib/csrf";
import {
  confirmFinanceImport,
  createFinanceRecord,
  FinanceStoreError,
  previewFinanceCsv,
  readFinanceState,
  updateFinanceRecord
} from "../../../lib/modules/finance/store";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorResponse(error: unknown) {
  if (error instanceof FinanceStoreError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
      },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Finance request failed" },
    { status: 500 }
  );
}

async function auditRequest(
  request: Request,
  action: string,
  status: "ok" | "error" | "denied",
  detail?: string
) {
  await appendGlobalAuditEvent({
    at: new Date().toISOString(),
    action,
    path: new URL(request.url).pathname,
    method: request.method,
    ip: getRequestIp(request),
    status,
    ...(detail ? { detail } : {})
  });
}

async function requireReadAccess(): Promise<NextResponse | null> {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function requireMutationAccess(request: Request): Promise<NextResponse | null> {
  const authError = await requireReadAccess();
  if (authError) return authError;
  if (!isCsrfRequestValid(request)) {
    await auditRequest(request, "finance.csrf_failed", "denied");
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const accessError = await requireReadAccess();
  if (accessError) return accessError;
  try {
    return NextResponse.json({ ok: true, state: await readFinanceState() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessError = await requireMutationAccess(request);
  if (accessError) return accessError;
  let operation = "create";
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    operation = typeof body.operation === "string" ? body.operation : "create";
    if (operation === "preview_import") {
      const preview = await previewFinanceCsv(body.input, { actorId: "admin" });
      await auditRequest(request, "finance.import.previewed", "ok", `${preview.counts.accepted}/${preview.rows.length}`);
      return NextResponse.json({ ok: true, preview });
    }
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
    if (!idempotencyKey) {
      return NextResponse.json({ ok: false, error: "Idempotency-Key header is required" }, { status: 400 });
    }
    const result = operation === "confirm_import"
      ? await confirmFinanceImport(body.input, { actorId: "admin", idempotencyKey })
      : await createFinanceRecord(body.input, { actorId: "admin", idempotencyKey });
    await auditRequest(
      request,
      operation === "confirm_import" ? "finance.import.confirm.success" : "finance.create.success",
      "ok",
      result.item.id
    );
    return NextResponse.json({
      ok: true,
      item: result.item,
      state: result.state,
      created: result.created,
      ...(result.auditEvent ? { auditEventId: result.auditEvent.id } : {})
    });
  } catch (error) {
    await auditRequest(
      request,
      operation === "confirm_import"
        ? "finance.import.confirm.failed"
        : operation === "preview_import"
          ? "finance.import.preview.failed"
          : "finance.create.failed",
      "error",
      error instanceof FinanceStoreError ? error.code : "server"
    );
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const accessError = await requireMutationAccess(request);
  if (accessError) return accessError;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    const result = await updateFinanceRecord(body.input, { actorId: "admin" });
    await auditRequest(request, "finance.update.success", "ok", result.item.id);
    return NextResponse.json({
      ok: true,
      item: result.item,
      state: result.state,
      auditEventId: result.auditEvent?.id
    });
  } catch (error) {
    await auditRequest(
      request,
      "finance.update.failed",
      "error",
      error instanceof FinanceStoreError ? error.code : "server"
    );
    return errorResponse(error);
  }
}
