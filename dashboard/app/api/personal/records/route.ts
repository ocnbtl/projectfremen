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
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const domain = new URL(request.url).searchParams.get("domain")?.trim() || "";
  const records = await readPersonalRecords();
  return json({
    ok: true,
    items: domain ? getRecordsForDomain(records, domain) : records
  });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return json({ ok: false, error: "Unauthorized" }, 401);
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
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
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
      starred: body.starred === true,
      relations: typeof body.relations === "object" && body.relations ? body.relations : {},
      time: typeof body.time === "object" && body.time ? body.time : {},
      profile: typeof body.profile === "object" && body.profile ? body.profile : {},
      resourceProfile: typeof body.resourceProfile === "object" && body.resourceProfile ? body.resourceProfile : undefined,
      interaction: typeof body.interaction === "object" && body.interaction ? body.interaction : undefined
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

    return json({ ok: true, items });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create record" },
      400
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await hasAdminSession())) {
    return json({ ok: false, error: "Unauthorized" }, 401);
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
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return json({ ok: false, error: "Record id is required" }, 400);
    }
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    const action = body.action === "review" || body.action === "archive" || body.action === "restore"
      ? body.action
      : undefined;
    const items = await updatePersonalRecord(id, {
      title: typeof body.title === "string" ? body.title : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      action,
      archiveReason: typeof body.archiveReason === "string" ? body.archiveReason : undefined,
      starred: typeof body.starred === "boolean" ? body.starred : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      areas: Array.isArray(body.areas) ? body.areas.map(String) : undefined,
      subjects: Array.isArray(body.subjects) ? body.subjects.map(String) : undefined,
      projects: Array.isArray(body.projects) ? body.projects.map(String) : undefined,
      externalSources: Array.isArray(body.externalSources) ? body.externalSources.map(String) : undefined,
      time:
        typeof body.time === "object" && body.time && !Array.isArray(body.time)
          ? body.time
          : undefined,
      profile:
        typeof body.profile === "object" && body.profile && !Array.isArray(body.profile)
          ? body.profile
          : undefined,
      resourceProfile:
        typeof body.resourceProfile === "object" && body.resourceProfile && !Array.isArray(body.resourceProfile)
          ? body.resourceProfile
          : undefined
    }, expectedUpdatedAt ? { expectedUpdatedAt } : undefined);

    const updated = items.find((item) => item.id === id);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: action === "archive"
        ? "personal.record.archive.success"
        : action === "restore"
          ? "personal.record.restore.success"
          : "personal.record.update.success",
      path: new URL(request.url).pathname,
      method: "PATCH",
      ip: getRequestIp(request),
      status: "ok",
      detail: `${updated?.domain || "unknown"}:${id}`
    });

    return json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update record";
    return json(
      { ok: false, error: message },
      message.startsWith("This record changed after it was opened") ? 409 : 400
    );
  }
}
