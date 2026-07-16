import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../lib/csrf";
import {
  createProjectsObject,
  isProjectObjectFamily,
  listProjectsObjects,
  promoteLegacyProject,
  ProjectsStoreError,
  readProjectsObject,
  readProjectsState,
  updateProjectsObject
} from "../../../lib/modules/projects/store";
import type {
  LegacyProjectPromotionInput,
  ProjectObjectFamily,
  ProjectsCreateInputByFamily,
  ProjectsUpdateInputByFamily
} from "../../../lib/modules/projects/types";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseFamily(value: unknown): ProjectObjectFamily | null {
  return isProjectObjectFamily(value) ? value : null;
}

function errorResponse(error: unknown) {
  if (error instanceof ProjectsStoreError) {
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
    { ok: false, error: error instanceof Error ? error.message : "Projects request failed" },
    { status: 500 }
  );
}

async function auditFailure(
  request: Request,
  method: "POST" | "PATCH",
  operation: string,
  family: ProjectObjectFamily | null,
  error: unknown
) {
  await appendAuditEvent({
    at: new Date().toISOString(),
    action: `projects.${operation}.failed`,
    path: new URL(request.url).pathname,
    method,
    ip: getRequestIp(request),
    status: "error",
    detail: `${family || "projects"}:${error instanceof ProjectsStoreError ? error.code : "server"}`
  });
}

async function csrfFailure(request: Request, action: string, method: "POST" | "PATCH") {
  await appendAuditEvent({
    at: new Date().toISOString(),
    action: `projects.${action}.csrf_failed`,
    path: new URL(request.url).pathname,
    method,
    ip: getRequestIp(request),
    status: "denied"
  });
  return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const familyParam = url.searchParams.get("family");
    const family = familyParam ? parseFamily(familyParam) : null;
    const id = url.searchParams.get("id")?.trim() || "";
    const projectId = url.searchParams.get("projectId")?.trim() || "";

    if (familyParam && !family) {
      return NextResponse.json({ ok: false, error: "Invalid Projects family" }, { status: 400 });
    }
    if (!family) {
      if (id || projectId) {
        return NextResponse.json(
          { ok: false, error: "family is required when filtering Projects objects" },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, state: await readProjectsState() });
    }
    if (id) {
      const item = await readProjectsObject(family, id);
      return item
        ? NextResponse.json({ ok: true, item })
        : NextResponse.json({ ok: false, error: "Projects object not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      items: await listProjectsObjects(family, projectId ? { projectId } : {})
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) return csrfFailure(request, "create", "POST");

  let family: ProjectObjectFamily | null = null;
  let operation = "create";
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    operation = typeof body.operation === "string" ? body.operation.trim() : "";
    if (!isRecord(body.input)) {
      return NextResponse.json({ ok: false, error: "input must be an object" }, { status: 400 });
    }

    if (operation === "promote_legacy") {
      const result = await promoteLegacyProject(body.input as LegacyProjectPromotionInput, {
        actorId: "admin"
      });
      await appendAuditEvent({
        at: new Date().toISOString(),
        action: result.created
          ? "projects.promote_legacy.success"
          : "projects.promote_legacy.idempotent",
        path: new URL(request.url).pathname,
        method: "POST",
        ip: getRequestIp(request),
        status: "ok",
        detail: result.item.id
      });
      return NextResponse.json({
        ok: true,
        ...result,
        auditEventId: result.auditEvent?.id
      });
    }

    if (operation !== "create") {
      return NextResponse.json(
        { ok: false, error: "operation must be create or promote_legacy" },
        { status: 400 }
      );
    }
    family = parseFamily(body.family);
    if (!family) {
      return NextResponse.json({ ok: false, error: "Invalid Projects family" }, { status: 400 });
    }
    const result = await createProjectsObject(
      family,
      body.input as ProjectsCreateInputByFamily[typeof family],
      { actorId: "admin" }
    );
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: result.created
        ? `projects.${family}.create.success`
        : `projects.${family}.create.idempotent`,
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: result.item.id
    });
    return NextResponse.json({
      ok: true,
      ...result,
      auditEventId: result.auditEvent?.id
    });
  } catch (error) {
    await auditFailure(request, "POST", operation, family, error);
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) return csrfFailure(request, "update", "PATCH");

  let family: ProjectObjectFamily | null = null;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    family = parseFamily(body.family);
    if (!family) {
      return NextResponse.json({ ok: false, error: "Invalid Projects family" }, { status: 400 });
    }
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    if (!expectedUpdatedAt) {
      return NextResponse.json(
        { ok: false, error: "expectedUpdatedAt is required to prevent stale overwrites" },
        { status: 400 }
      );
    }
    if (!isRecord(body.patch)) {
      return NextResponse.json({ ok: false, error: "patch must be an object" }, { status: 400 });
    }

    const result = await updateProjectsObject(
      family,
      id,
      body.patch as ProjectsUpdateInputByFamily[typeof family],
      { expectedUpdatedAt, actorId: "admin" }
    );
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: `projects.${family}.update.success`,
      path: new URL(request.url).pathname,
      method: "PATCH",
      ip: getRequestIp(request),
      status: "ok",
      detail: result.item.id
    });
    return NextResponse.json({ ok: true, ...result, auditEventId: result.auditEvent.id });
  } catch (error) {
    await auditFailure(request, "PATCH", "update", family, error);
    return errorResponse(error);
  }
}
