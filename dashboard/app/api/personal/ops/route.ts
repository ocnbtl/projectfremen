import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import {
  confirmPersonalOpsCaptureProcessing,
  confirmPersonalOpsRoutineRun,
  createPersonalOpsObject,
  createPersonalOpsSecondaryObject,
  instantiatePersonalOpsTemplate,
  listPersonalOpsObjects,
  listPersonalOpsSecondaryObjects,
  PersonalOpsStoreError,
  previewPersonalOpsCaptureProcessing,
  previewPersonalOpsRoutineRun,
  readPersonalOpsObject,
  readPersonalOpsSecondaryObject,
  readPersonalOpsState,
  testPersonalOpsTemplate,
  updatePersonalOpsSecondaryObject,
  updatePersonalOpsObject
} from "../../../../lib/modules/personal-ops/store";
import {
  PERSONAL_OPS_FAMILIES,
  PERSONAL_OPS_SECONDARY_FAMILIES,
  type CaptureProcessingPreviewInput,
  type ConfirmCaptureProcessingInput,
  type ConfirmRoutineRunInput,
  type InstantiateTemplateInput,
  type PersonalOpsCreateInputByFamily,
  type PersonalOpsFamily,
  type PersonalOpsSecondaryCreateInputByFamily,
  type PersonalOpsSecondaryFamily,
  type PersonalOpsSecondaryUpdateInputByFamily,
  type PersonalOpsUpdateInputByFamily,
  type RoutineRunPreviewInput,
  type TemplateTestInput
} from "../../../../lib/modules/personal-ops/types";

export const runtime = "nodejs";

function parseFamily(value: unknown): PersonalOpsFamily | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return PERSONAL_OPS_FAMILIES.includes(normalized as PersonalOpsFamily)
    ? (normalized as PersonalOpsFamily)
    : null;
}

function parseSecondaryFamily(value: unknown): PersonalOpsSecondaryFamily | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return PERSONAL_OPS_SECONDARY_FAMILIES.includes(normalized as PersonalOpsSecondaryFamily)
    ? (normalized as PersonalOpsSecondaryFamily)
    : null;
}

const PERSONAL_OPS_OPERATIONS = [
  "routine.preview_run",
  "routine.confirm_run",
  "capture.preview_processing",
  "capture.confirm_processing",
  "template.test",
  "template.instantiate"
] as const;

type PersonalOpsOperation = (typeof PERSONAL_OPS_OPERATIONS)[number];

function parseOperation(value: unknown): PersonalOpsOperation | null {
  return typeof value === "string" && PERSONAL_OPS_OPERATIONS.includes(value as PersonalOpsOperation)
    ? (value as PersonalOpsOperation)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorResponse(error: unknown) {
  if (error instanceof PersonalOpsStoreError) {
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
    { ok: false, error: error instanceof Error ? error.message : "Personal Ops request failed" },
    { status: 500 }
  );
}

async function auditFailure(
  request: Request,
  method: "POST" | "PATCH",
  scope: string | null,
  error: unknown
) {
  await appendAuditEvent({
    at: new Date().toISOString(),
    action: `personal_ops.${method === "POST" ? "create" : "update"}.failed`,
    path: new URL(request.url).pathname,
    method,
    ip: getRequestIp(request),
    status: "error",
    detail: `${scope || "unknown"}:${error instanceof PersonalOpsStoreError ? error.code : "server"}`
  });
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const familyParam = url.searchParams.get("family");
    const family = parseFamily(familyParam);
    const secondaryFamilyParam = url.searchParams.get("secondaryFamily");
    const secondaryFamily = parseSecondaryFamily(secondaryFamilyParam);
    const id = url.searchParams.get("id")?.trim() || "";
    const legacyPersonalRecordId = url.searchParams.get("legacyPersonalRecordId")?.trim() || "";

    if (familyParam && !family) {
      return NextResponse.json({ ok: false, error: "Invalid Personal Ops family" }, { status: 400 });
    }
    if (secondaryFamilyParam && !secondaryFamily) {
      return NextResponse.json(
        { ok: false, error: "Invalid Personal Ops secondary family" },
        { status: 400 }
      );
    }
    if (family && secondaryFamily) {
      return NextResponse.json(
        { ok: false, error: "Choose either family or secondaryFamily, not both" },
        { status: 400 }
      );
    }

    if (legacyPersonalRecordId) {
      const state = await readPersonalOpsState();
      return NextResponse.json({
        ok: true,
        mappings: state.legacyMappings.filter(
          (mapping) => mapping.legacyPersonalRecordId === legacyPersonalRecordId
        )
      });
    }

    if (secondaryFamily) {
      if (id) {
        const item = await readPersonalOpsSecondaryObject(secondaryFamily, id);
        return item
          ? NextResponse.json({ ok: true, item })
          : NextResponse.json(
              { ok: false, error: "Personal Ops secondary object not found" },
              { status: 404 }
            );
      }
      return NextResponse.json({
        ok: true,
        items: await listPersonalOpsSecondaryObjects(secondaryFamily)
      });
    }

    if (!family) {
      return NextResponse.json({ ok: true, state: await readPersonalOpsState() });
    }

    if (id) {
      const item = await readPersonalOpsObject(family, id);
      return item
        ? NextResponse.json({ ok: true, item })
        : NextResponse.json({ ok: false, error: "Personal Ops object not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, items: await listPersonalOpsObjects(family) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal_ops.create.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  let scope: string | null = null;
  let shouldAuditFailure = true;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    if (!isRecord(body.input)) {
      return NextResponse.json({ ok: false, error: "input must be an object" }, { status: 400 });
    }

    const operationParam = body.operation;
    const operation = parseOperation(operationParam);
    if (operationParam !== undefined && !operation) {
      return NextResponse.json({ ok: false, error: "Invalid Personal Ops operation" }, { status: 400 });
    }

    if (operation) {
      scope = operation;
      shouldAuditFailure =
        operation === "routine.confirm_run" ||
        operation === "capture.confirm_processing" ||
        operation === "template.instantiate";
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) {
        return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
      }
      let response: Record<string, unknown>;
      if (operation === "routine.preview_run") {
        response = {
          preview: await previewPersonalOpsRoutineRun(
            id,
            body.input as RoutineRunPreviewInput,
            { actorId: "admin" }
          )
        };
      } else if (operation === "routine.confirm_run") {
        const result = await confirmPersonalOpsRoutineRun(
          id,
          body.input as ConfirmRoutineRunInput,
          { actorId: "admin" }
        );
        response = {
          item: result.item,
          run: result.run,
          created: result.created,
          auditEventIds: result.auditEvents.map((event) => event.id)
        };
      } else if (operation === "capture.preview_processing") {
        response = {
          preview: await previewPersonalOpsCaptureProcessing(
            id,
            body.input as CaptureProcessingPreviewInput,
            { actorId: "admin" }
          )
        };
      } else if (operation === "capture.confirm_processing") {
        const result = await confirmPersonalOpsCaptureProcessing(
          id,
          body.input as ConfirmCaptureProcessingInput,
          { actorId: "admin" }
        );
        response = {
          item: result.item,
          action: result.action,
          created: result.created,
          auditEventIds: result.auditEvents.map((event) => event.id)
        };
      } else if (operation === "template.test") {
        response = {
          preview: await testPersonalOpsTemplate(
            id,
            body.input as TemplateTestInput,
            { actorId: "admin" }
          )
        };
      } else {
        const result = await instantiatePersonalOpsTemplate(
          id,
          body.input as InstantiateTemplateInput,
          { actorId: "admin" }
        );
        response = {
          item: result.item,
          usage: result.usage,
          created: result.created,
          auditEventIds: result.auditEvents.map((event) => event.id)
        };
      }
      if (shouldAuditFailure) {
        await appendAuditEvent({
          at: new Date().toISOString(),
          action: `personal_ops.${operation}.success`,
          path: new URL(request.url).pathname,
          method: "POST",
          ip: getRequestIp(request),
          status: "ok",
          detail: id
        });
      }
      return NextResponse.json({ ok: true, ...response });
    }

    const secondaryFamilyParam = body.secondaryFamily;
    const secondaryFamily = parseSecondaryFamily(secondaryFamilyParam);
    if (secondaryFamilyParam !== undefined && !secondaryFamily) {
      return NextResponse.json(
        { ok: false, error: "Invalid Personal Ops secondary family" },
        { status: 400 }
      );
    }
    if (secondaryFamily && body.family !== undefined) {
      return NextResponse.json(
        { ok: false, error: "Choose either family or secondaryFamily, not both" },
        { status: 400 }
      );
    }
    if (secondaryFamily) {
      scope = secondaryFamily;
      const result = await createPersonalOpsSecondaryObject(
        secondaryFamily,
        body.input as PersonalOpsSecondaryCreateInputByFamily[typeof secondaryFamily],
        { actorId: "admin" }
      );
      await appendAuditEvent({
        at: new Date().toISOString(),
        action: `personal_ops.${secondaryFamily}.create.success`,
        path: new URL(request.url).pathname,
        method: "POST",
        ip: getRequestIp(request),
        status: "ok",
        detail: result.item.id
      });
      return NextResponse.json({
        ok: true,
        item: result.item,
        created: true,
        auditEventId: result.auditEvent.id
      });
    }

    const family = parseFamily(body.family);
    if (!family) {
      return NextResponse.json({ ok: false, error: "Invalid Personal Ops family" }, { status: 400 });
    }
    scope = family;
    const result = await createPersonalOpsObject(
      family,
      body.input as PersonalOpsCreateInputByFamily[typeof family],
      { actorId: "admin" }
    );
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: result.created
        ? `personal_ops.${family}.create.success`
        : `personal_ops.${family}.create.idempotent`,
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: result.item.id
    });
    return NextResponse.json({
      ok: true,
      item: result.item,
      created: result.created,
      mapping: result.mapping,
      auditEventId: result.auditEvent?.id
    });
  } catch (error) {
    if (shouldAuditFailure) await auditFailure(request, "POST", scope, error);
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "personal_ops.update.csrf_failed",
      path: new URL(request.url).pathname,
      method: "PATCH",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  let scope: string | null = null;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Request body must be an object" }, { status: 400 });
    }
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    if (!expectedUpdatedAt) {
      return NextResponse.json(
        { ok: false, error: "expectedUpdatedAt is required to prevent stale overwrites" },
        { status: 400 }
      );
    }
    if (!isRecord(body.patch)) {
      return NextResponse.json({ ok: false, error: "patch must be an object" }, { status: 400 });
    }

    const secondaryFamilyParam = body.secondaryFamily;
    const secondaryFamily = parseSecondaryFamily(secondaryFamilyParam);
    if (secondaryFamilyParam !== undefined && !secondaryFamily) {
      return NextResponse.json(
        { ok: false, error: "Invalid Personal Ops secondary family" },
        { status: 400 }
      );
    }
    if (secondaryFamily && body.family !== undefined) {
      return NextResponse.json(
        { ok: false, error: "Choose either family or secondaryFamily, not both" },
        { status: 400 }
      );
    }
    if (secondaryFamily) {
      scope = secondaryFamily;
      const result = await updatePersonalOpsSecondaryObject(
        secondaryFamily,
        id,
        body.patch as PersonalOpsSecondaryUpdateInputByFamily[typeof secondaryFamily],
        { expectedUpdatedAt, actorId: "admin" }
      );
      await appendAuditEvent({
        at: new Date().toISOString(),
        action: `personal_ops.${secondaryFamily}.update.success`,
        path: new URL(request.url).pathname,
        method: "PATCH",
        ip: getRequestIp(request),
        status: "ok",
        detail: result.item.id
      });
      return NextResponse.json({ ok: true, item: result.item, auditEventId: result.auditEvent.id });
    }

    const family = parseFamily(body.family);
    if (!family) {
      return NextResponse.json({ ok: false, error: "Invalid Personal Ops family" }, { status: 400 });
    }
    scope = family;

    const result = await updatePersonalOpsObject(
      family,
      id,
      body.patch as PersonalOpsUpdateInputByFamily[typeof family],
      { expectedUpdatedAt, actorId: "admin" }
    );
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: `personal_ops.${family}.update.success`,
      path: new URL(request.url).pathname,
      method: "PATCH",
      ip: getRequestIp(request),
      status: "ok",
      detail: result.item.id
    });
    return NextResponse.json({ ok: true, item: result.item, auditEventId: result.auditEvent.id });
  } catch (error) {
    await auditFailure(request, "PATCH", scope, error);
    return errorResponse(error);
  }
}
