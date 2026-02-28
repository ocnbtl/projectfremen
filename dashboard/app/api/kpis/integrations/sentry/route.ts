import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../../lib/csrf";
import { upsertKpi } from "../../../../../lib/kpis-store";
import { getSentryKpiConfigStatus, syncSentryErrorsKpi } from "../../../../../lib/sentry-kpi";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const status = getSentryKpiConfigStatus();
  return NextResponse.json({
    ok: true,
    configured: status.configured,
    missing: status.missing,
    entity: status.entity,
    kpiName: status.kpiName
  });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "kpi.sentry_sync.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const synced = await syncSentryErrorsKpi();
    if (!synced.ok) {
      await appendAuditEvent({
        at: new Date().toISOString(),
        action: "kpi.sentry_sync.not_configured",
        path: new URL(request.url).pathname,
        method: "POST",
        ip: getRequestIp(request),
        status: "denied",
        detail: synced.missing.join(",")
      });
      return NextResponse.json(
        { ok: false, error: "Sentry integration is not configured", missing: synced.missing },
        { status: 400 }
      );
    }

    const items = await upsertKpi({
      entity: synced.entity,
      name: synced.kpiName,
      value: synced.value,
      priority: "P1",
      link: synced.link
    });

    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "kpi.sentry_sync.success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: `issues=${synced.issueCount};pages=${synced.pages}`
    });

    return NextResponse.json({
      ok: true,
      items,
      synced: {
        entity: synced.entity,
        kpiName: synced.kpiName,
        issueCount: synced.issueCount,
        pages: synced.pages,
        value: synced.value
      }
    });
  } catch (error) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "kpi.sentry_sync.error",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "error",
      detail: error instanceof Error ? error.message : "Sync failed"
    });

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sentry sync failed"
      },
      { status: 502 }
    );
  }
}

