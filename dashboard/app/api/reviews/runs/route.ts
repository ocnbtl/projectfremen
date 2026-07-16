import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent as appendGlobalAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import {
  convertLegacyReviewEntry,
  createReviewRun,
  readReviewRun,
  readReviewsState,
  ReviewsStoreError,
  toReviewRunView,
  updateReviewRun
} from "../../../../lib/modules/reviews/store";
import type { ReviewRunCreateInput } from "../../../../lib/modules/reviews/types";
import { readReviewEntry } from "../../../../lib/reviews-store";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorResponse(error: unknown) {
  if (error instanceof ReviewsStoreError) {
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
    { ok: false, error: error instanceof Error ? error.message : "ReviewRun request failed" },
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

async function requireMutationAccess(request: Request): Promise<NextResponse | null> {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await auditRequest(request, "review_runs.csrf_failed", "denied");
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    if (id) {
      const item = await readReviewRun(id);
      return item
        ? NextResponse.json({ ok: true, item, view: toReviewRunView(item) })
        : NextResponse.json({ ok: false, error: "ReviewRun not found", code: "not_found" }, { status: 404 });
    }

    const state = await readReviewsState();
    const includeArchived = url.searchParams.get("includeArchived") === "1";
    const runs = includeArchived ? state.runs : state.runs.filter((run) => run.lifecycle !== "archived");
    return NextResponse.json({
      ok: true,
      state,
      items: runs.map(toReviewRunView)
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessError = await requireMutationAccess(request);
  if (accessError) return accessError;

  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }

    if (body.action === "convert_legacy") {
      const legacyReviewEntryId = typeof body.legacyReviewEntryId === "string"
        ? body.legacyReviewEntryId.trim()
        : "";
      if (!legacyReviewEntryId) {
        return NextResponse.json({ ok: false, error: "legacyReviewEntryId is required" }, { status: 400 });
      }
      const legacyEntry = await readReviewEntry(legacyReviewEntryId);
      if (!legacyEntry) {
        return NextResponse.json({ ok: false, error: "Legacy review entry not found" }, { status: 404 });
      }
      const result = await convertLegacyReviewEntry(legacyEntry, { actorId: "admin" });
      await auditRequest(
        request,
        result.created ? "review_runs.legacy_convert.success" : "review_runs.legacy_convert.idempotent",
        "ok",
        `${legacyReviewEntryId}:${result.item.id}`
      );
      return NextResponse.json({
        ok: true,
        item: result.item,
        view: result.view,
        mapping: result.mapping,
        created: result.created,
        ...(result.auditEvent ? { auditEventId: result.auditEvent.id } : {})
      });
    }

    if (!isRecord(body.input)) {
      return NextResponse.json({ ok: false, error: "input must be an object" }, { status: 400 });
    }
    const result = await createReviewRun(body.input as ReviewRunCreateInput, { actorId: "admin" });
    await auditRequest(request, "review_runs.create.success", "ok", result.item.id);
    return NextResponse.json({
      ok: true,
      item: result.item,
      view: result.view,
      auditEventId: result.auditEvent.id
    });
  } catch (error) {
    await auditRequest(
      request,
      "review_runs.create.failed",
      "error",
      error instanceof ReviewsStoreError ? error.code : "server"
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
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string"
      ? body.expectedUpdatedAt.trim()
      : "";
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
    const result = await updateReviewRun(id, body.patch, { expectedUpdatedAt, actorId: "admin" });
    await auditRequest(request, "review_runs.update.success", "ok", `${id}:${body.patch.action || "unknown"}`);
    return NextResponse.json({
      ok: true,
      item: result.item,
      view: result.view,
      auditEventId: result.auditEvent.id
    });
  } catch (error) {
    await auditRequest(
      request,
      "review_runs.update.failed",
      "error",
      error instanceof ReviewsStoreError ? error.code : "server"
    );
    return errorResponse(error);
  }
}

