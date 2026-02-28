import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { syncDocsIndex } from "../../../../lib/docs-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "docs.sync.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const state = await syncDocsIndex();
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "docs.sync.success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: `count=${state.items.length}`
    });
    return NextResponse.json({
      ok: true,
      lastSynced: state.lastSynced,
      count: state.items.length
    });
  } catch (error) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "docs.sync.error",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "error",
      detail: error instanceof Error ? error.message : "Sync failed"
    });
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed"
      },
      { status: 500 }
    );
  }
}
