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
      className: String(body.className ?? body.kind ?? ""),
      kind: String(body.kind ?? ""),
      knowledgeShape: String(body.knowledgeShape ?? ""),
      privacy: String(body.privacy ?? ""),
      stage: String(body.stage ?? ""),
      status: String(body.status ?? ""),
      body: String(body.body ?? ""),
      happensOn: String(body.happensOn ?? ""),
      url: String(body.url ?? ""),
      areas: Array.isArray(body.areas) ? body.areas.map(String) : [],
      subjects: Array.isArray(body.subjects) ? body.subjects.map(String) : [],
      projects: Array.isArray(body.projects) ? body.projects.map(String) : [],
      intents: Array.isArray(body.intents) ? body.intents.map(String) : [],
      externalSources: Array.isArray(body.externalSources) ? body.externalSources.map(String) : [],
      relations: typeof body.relations === "object" && body.relations ? body.relations : {},
      time: typeof body.time === "object" && body.time ? body.time : {},
      profile: typeof body.profile === "object" && body.profile ? body.profile : {}
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
      action: body.action === "review" ? "review" : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      areas: Array.isArray(body.areas) ? body.areas.map(String) : undefined,
      subjects: Array.isArray(body.subjects) ? body.subjects.map(String) : undefined,
      projects: Array.isArray(body.projects) ? body.projects.map(String) : undefined,
      externalSources: Array.isArray(body.externalSources) ? body.externalSources.map(String) : undefined,
      profile: typeof body.profile === "object" && body.profile ? body.profile : undefined
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update record" },
      { status: 400 }
    );
  }
}
