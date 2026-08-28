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
  retireLegacyProjectMetadata,
  updateProjectTimelineEvent,
  updateProjectsObject
} from "../../../lib/modules/projects/store";
import type {
  LegacyProjectPromotionInput,
  ProjectObjectFamily,
  ProjectsCreateInputByFamily,
  ProjectTimelineEventUpdateInput,
  ProjectsUpdateInputByFamily
} from "../../../lib/modules/projects/types";

export const runtime = "nodejs";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie"
} as const;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) headers.set(name, value);
  return NextResponse.json(body, { ...init, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseFamily(value: unknown): ProjectObjectFamily | null {
  return isProjectObjectFamily(value) ? value : null;
}

function errorResponse(error: unknown) {
  if (error instanceof ProjectsStoreError) {
    return privateJson(
      {
        ok: false,
        error: error.message,
        code: error.code,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
      },
      { status: error.status }
    );
  }
  return privateJson(
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
  return privateJson({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const familyParam = url.searchParams.get("family");
    const family = familyParam ? parseFamily(familyParam) : null;
    const id = url.searchParams.get("id")?.trim() || "";
    const projectId = url.searchParams.get("projectId")?.trim() || "";

    if (familyParam && !family) {
      return privateJson({ ok: false, error: "Invalid Projects family" }, { status: 400 });
    }
    if (!family) {
      if (id || projectId) {
        return privateJson(
          { ok: false, error: "family is required when filtering Projects objects" },
          { status: 400 }
        );
      }
      return privateJson({ ok: true, state: await readProjectsState() });
    }
    if (id) {
      const item = await readProjectsObject(family, id);
      return item
        ? privateJson({ ok: true, item })
        : privateJson({ ok: false, error: "Projects object not found" }, { status: 404 });
    }
    return privateJson({
      ok: true,
      items: await listProjectsObjects(family, projectId ? { projectId } : {})
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) return csrfFailure(request, "create", "POST");

  let family: ProjectObjectFamily | null = null;
  let operation = "create";
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return privateJson({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    operation = typeof body.operation === "string" ? body.operation.trim() : "";
    if (operation === "retire_legacy_metadata") {
      const result = await retireLegacyProjectMetadata();
      await appendAuditEvent({
        at: new Date().toISOString(),
        action: result.updated ? "projects.legacy_metadata_retired" : "projects.legacy_metadata_already_retired",
        path: new URL(request.url).pathname,
        method: "POST",
        ip: getRequestIp(request),
        status: "ok"
      });
      return privateJson({ ok: true, updated: result.updated });
    }
    if (!isRecord(body.input)) {
      return privateJson({ ok: false, error: "input must be an object" }, { status: 400 });
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
      return privateJson({
        ok: true,
        ...result,
        auditEventId: result.auditEvent?.id
      });
    }

    if (operation !== "create") {
      return privateJson(
        { ok: false, error: "operation must be create, promote_legacy, or retire_legacy_metadata" },
        { status: 400 }
      );
    }
    family = parseFamily(body.family);
    if (!family) {
      return privateJson({ ok: false, error: "Invalid Projects family" }, { status: 400 });
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
    return privateJson({
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
    return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) return csrfFailure(request, "update", "PATCH");

  let family: ProjectObjectFamily | null = null;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return privateJson({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    const operation = typeof body.operation === "string" ? body.operation.trim() : "update";
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id) return privateJson({ ok: false, error: "id is required" }, { status: 400 });
    if (!expectedUpdatedAt) {
      return privateJson(
        { ok: false, error: "expectedUpdatedAt is required to prevent stale overwrites" },
        { status: 400 }
      );
    }
    if (!isRecord(body.patch)) {
      return privateJson({ ok: false, error: "patch must be an object" }, { status: 400 });
    }
    if (operation === "update_timeline_event") {
      const result = await updateProjectTimelineEvent(
        id,
        body.patch as ProjectTimelineEventUpdateInput,
        { expectedUpdatedAt, actorId: "admin" }
      );
      await appendAuditEvent({
        at: new Date().toISOString(),
        action: "projects.timeline.update.success",
        path: new URL(request.url).pathname,
        method: "PATCH",
        ip: getRequestIp(request),
        status: "ok",
        detail: result.item.id
      });
      return privateJson({ ok: true, ...result, auditEventId: result.auditEvent.id });
    }
    if (operation !== "update") {
      return privateJson({ ok: false, error: "Unsupported Projects update operation" }, { status: 400 });
    }
    family = parseFamily(body.family);
    if (!family) {
      return privateJson({ ok: false, error: "Invalid Projects family" }, { status: 400 });
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
    return privateJson({ ok: true, ...result, auditEventId: result.auditEvent.id });
  } catch (error) {
    await auditFailure(request, "PATCH", "update", family, error);
    return errorResponse(error);
  }
}
