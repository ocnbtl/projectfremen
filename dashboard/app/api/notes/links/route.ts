import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent as appendGlobalAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { legacyPersonalRecordsToMediaAssets } from "../../../../lib/modules/media/legacy-adapter";
import { legacyPersonalRecordsToNotes } from "../../../../lib/modules/notes/legacy-adapter";
import {
  createNoteLink,
  NoteLinksStoreError,
  readNoteLink,
  readNoteLinksState,
  updateNoteLink
} from "../../../../lib/modules/notes/links-store";
import { legacyPersonalRecordsToResources } from "../../../../lib/modules/resources/legacy-adapter";
import type { NativeObjectRef } from "../../../../lib/native-objects/types";
import { readPersonalRecords } from "../../../../lib/personal-records-store";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorResponse(error: unknown) {
  if (error instanceof NoteLinksStoreError) {
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
    { ok: false, error: error instanceof Error ? error.message : "NoteLink request failed" },
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
    await auditRequest(request, "note_links.csrf_failed", "denied");
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

function referenceIdentity(value: unknown, field: string): {
  module: string;
  objectType: string;
  objectId: string;
} {
  if (!isRecord(value)) {
    throw new NoteLinksStoreError("validation", `${field} must be a native object reference`, {
      status: 400
    });
  }
  const module = typeof value.module === "string" ? value.module.trim() : "";
  const objectType = typeof value.objectType === "string" ? value.objectType.trim() : "";
  const objectId = typeof value.objectId === "string" ? value.objectId.trim() : "";
  if (!module || !objectType || !objectId) {
    throw new NoteLinksStoreError("validation", `${field} is incomplete`, { status: 400 });
  }
  return { module, objectType, objectId };
}

async function canonicalReferences(noteValue: unknown, targetValue: unknown): Promise<{
  noteRef: NativeObjectRef;
  targetRef: NativeObjectRef;
}> {
  const noteIdentity = referenceIdentity(noteValue, "noteRef");
  const targetIdentity = referenceIdentity(targetValue, "targetRef");
  if (noteIdentity.module !== "notes" || noteIdentity.objectType !== "note") {
    throw new NoteLinksStoreError("validation", "noteRef must reference a Notes-owned Note", {
      status: 400
    });
  }

  const records = await readPersonalRecords();
  const note = legacyPersonalRecordsToNotes(records).find(
    (candidate) => candidate.id === noteIdentity.objectId
  );
  if (!note) {
    throw new NoteLinksStoreError("not_found", "The Notes-owned source was not found", {
      status: 404
    });
  }

  if (targetIdentity.module === "resources" && targetIdentity.objectType === "resource") {
    const resource = legacyPersonalRecordsToResources(records).find(
      (candidate) => candidate.id === targetIdentity.objectId
    );
    if (!resource) {
      throw new NoteLinksStoreError(
        "conflict",
        "The Resource target is unavailable. Select a current Resource before linking.",
        { status: 409 }
      );
    }
    return { noteRef: note.nativeRef, targetRef: resource.nativeRef };
  }

  if (targetIdentity.module === "media" && targetIdentity.objectType === "media_asset") {
    const asset = legacyPersonalRecordsToMediaAssets(records).find(
      (candidate) => candidate.id === targetIdentity.objectId
    );
    if (!asset) {
      throw new NoteLinksStoreError(
        "conflict",
        "The Media target is unavailable. Select a current Media asset before linking.",
        { status: 409 }
      );
    }
    return { noteRef: note.nativeRef, targetRef: asset.nativeRef };
  }

  throw new NoteLinksStoreError(
    "validation",
    "NoteLinks currently support Resource and Media targets only.",
    { status: 400 }
  );
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    if (id) {
      const item = await readNoteLink(id);
      return item
        ? NextResponse.json({ ok: true, item })
        : NextResponse.json(
            { ok: false, error: "NoteLink not found", code: "not_found" },
            { status: 404 }
          );
    }

    const state = await readNoteLinksState();
    const noteId = url.searchParams.get("noteId")?.trim() || "";
    const targetModule = url.searchParams.get("targetModule")?.trim() || "";
    const targetId = url.searchParams.get("targetId")?.trim() || "";
    const items = state.links.filter((link) => {
      if (noteId && link.noteRef.objectId !== noteId) return false;
      if (targetModule && link.targetRef.module !== targetModule) return false;
      if (targetId && link.targetRef.objectId !== targetId) return false;
      return true;
    });
    return NextResponse.json({ ok: true, state, items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessError = await requireMutationAccess(request);
  if (accessError) return accessError;

  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !isRecord(body.input)) {
      return NextResponse.json({ ok: false, error: "input must be an object" }, { status: 400 });
    }
    const canonical = await canonicalReferences(body.input.noteRef, body.input.targetRef);
    const result = await createNoteLink(
      { ...body.input, ...canonical },
      { actorId: "admin" }
    );
    await auditRequest(
      request,
      result.created ? "note_links.create.success" : "note_links.create.idempotent",
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
      "note_links.create.failed",
      "error",
      error instanceof NoteLinksStoreError ? error.code : "server"
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

    let patch: Record<string, unknown> = body.patch;
    if (patch.action === "repair") {
      const current = await readNoteLink(id);
      if (!current) {
        throw new NoteLinksStoreError("not_found", "NoteLink not found", { status: 404 });
      }
      const canonical = await canonicalReferences(current.noteRef, patch.targetRef);
      patch = { ...patch, targetRef: canonical.targetRef };
    }

    const result = await updateNoteLink(id, patch, { expectedUpdatedAt, actorId: "admin" });
    await auditRequest(request, "note_links.update.success", "ok", `${id}:${patch.action || "unknown"}`);
    return NextResponse.json({
      ok: true,
      item: result.item,
      state: result.state,
      auditEventId: result.auditEvent.id
    });
  } catch (error) {
    await auditRequest(
      request,
      "note_links.update.failed",
      "error",
      error instanceof NoteLinksStoreError ? error.code : "server"
    );
    return errorResponse(error);
  }
}
