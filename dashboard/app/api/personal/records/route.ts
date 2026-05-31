import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import {
  createPersonalRecord,
  getRecordsForDomain,
  readPersonalRecords,
  updatePersonalRecord
} from "../../../../lib/personal-records-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const domain = new URL(request.url).searchParams.get("domain")?.trim() || "";
  const records = await readPersonalRecords();
  return NextResponse.json({
    ok: true,
    items: domain ? getRecordsForDomain(records, domain) : records
  });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal.record.create.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const items = await createPersonalRecord({
      domain: String(body.domain ?? ""),
      title: String(body.title ?? ""),
      kind: String(body.kind ?? ""),
      status: String(body.status ?? ""),
      priority: String(body.priority ?? ""),
      body: String(body.body ?? ""),
      happensOn: String(body.happensOn ?? ""),
      url: String(body.url ?? ""),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      relatedDomains: Array.isArray(body.relatedDomains) ? body.relatedDomains.map(String) : []
    });

    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal.record.create.success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: String(body.domain ?? "")
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create record" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal.record.update.csrf_failed",
      path: new URL(request.url).pathname,
      method: "PATCH",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Record id is required" }, { status: 400 });
    }
    const items = await updatePersonalRecord(id, {
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update record" },
      { status: 400 }
    );
  }
}
