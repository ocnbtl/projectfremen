import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../lib/csrf";
import {
  createReviewEntry,
  deleteReviewEntry,
  readReviewEntry,
  readReviews,
  updateReviewEntry
} from "../../../lib/reviews-store";
import type { ReviewKind } from "../../../lib/types";

export const runtime = "nodejs";

const ALLOWED_KINDS: ReviewKind[] = ["weekly", "monthly"];

function parseKind(input: string | null | undefined): ReviewKind | null {
  if (!input) {
    return null;
  }
  const value = input.trim().toLowerCase();
  return ALLOWED_KINDS.includes(value as ReviewKind) ? (value as ReviewKind) : null;
}

function isValidDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind = parseKind(kindParam);
  const id = url.searchParams.get("id")?.trim() || "";

  if (kindParam && !kind) {
    return NextResponse.json({ ok: false, error: "Invalid review kind" }, { status: 400 });
  }

  if (id) {
    const item = await readReviewEntry(id, kind ?? undefined);
    if (!item) {
      return NextResponse.json({ ok: false, error: "Review entry not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  }

  const items = await readReviews(kind ?? undefined);
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "reviews.create.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = (await request.json()) as {
    kind?: string;
    scheduledFor?: string;
  };

  const kind = parseKind(body.kind);
  if (!kind) {
    return NextResponse.json({ ok: false, error: "Invalid review kind" }, { status: 400 });
  }

  const scheduledFor = body.scheduledFor?.trim();
  if (scheduledFor && !isValidDate(scheduledFor)) {
    return NextResponse.json(
      { ok: false, error: "scheduledFor must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const result = await createReviewEntry({ kind, scheduledFor });
  await appendAuditEvent({
    at: new Date().toISOString(),
    action: "reviews.create.success",
    path: new URL(request.url).pathname,
    method: "POST",
    ip: getRequestIp(request),
    status: "ok",
    detail: `${kind}:${result.item.id}`
  });
  return NextResponse.json({ ok: true, item: result.item, items: result.items });
}

export async function PATCH(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "reviews.update.csrf_failed",
      path: new URL(request.url).pathname,
      method: "PATCH",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    kind?: string;
    scheduledFor?: string;
    values?: Record<string, string>;
  };

  const id = body.id?.trim() || "";
  const kind = parseKind(body.kind);
  const scheduledFor = body.scheduledFor?.trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }
  if (!kind) {
    return NextResponse.json({ ok: false, error: "Invalid review kind" }, { status: 400 });
  }
  if (scheduledFor && !isValidDate(scheduledFor)) {
    return NextResponse.json(
      { ok: false, error: "scheduledFor must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  if (body.values && typeof body.values !== "object") {
    return NextResponse.json({ ok: false, error: "values must be an object" }, { status: 400 });
  }

  const normalizedValues = body.values
    ? Object.fromEntries(
        Object.entries(body.values).map(([key, value]) => [key.trim(), (value || "").toString()])
      )
    : undefined;

  const result = await updateReviewEntry({
    id,
    kind,
    scheduledFor,
    values: normalizedValues
  });

  if (!result.item) {
    return NextResponse.json({ ok: false, error: "Review entry not found" }, { status: 404 });
  }

  await appendAuditEvent({
    at: new Date().toISOString(),
    action: "reviews.update.success",
    path: new URL(request.url).pathname,
    method: "PATCH",
    ip: getRequestIp(request),
    status: "ok",
    detail: `${kind}:${id}`
  });

  return NextResponse.json({ ok: true, item: result.item, items: result.items });
}

export async function DELETE(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "reviews.delete.csrf_failed",
      path: new URL(request.url).pathname,
      method: "DELETE",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() || "";
  const kind = parseKind(url.searchParams.get("kind"));

  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }
  if (!kind) {
    return NextResponse.json({ ok: false, error: "kind is required and must be valid" }, { status: 400 });
  }

  const result = await deleteReviewEntry({ id, kind });
  if (!result.deleted) {
    return NextResponse.json({ ok: false, error: "Review entry not found" }, { status: 404 });
  }

  await appendAuditEvent({
    at: new Date().toISOString(),
    action: "reviews.delete.success",
    path: new URL(request.url).pathname,
    method: "DELETE",
    ip: getRequestIp(request),
    status: "ok",
    detail: `${kind}:${id}`
  });

  return NextResponse.json({ ok: true, items: result.items });
}
