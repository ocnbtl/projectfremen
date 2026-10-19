import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../../lib/csrf";
import {
  readPeopleProfilePhoto,
  cropPeopleProfilePhoto,
  removePeopleProfilePhoto,
  writePeopleProfilePhoto
} from "../../../../../lib/modules/people/profile-photos";
import { readPersonalRecords } from "../../../../../lib/personal-records-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ personId: string }> };

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

async function requirePeopleProfile(context: RouteContext) {
  const { personId } = await context.params;
  const records = await readPersonalRecords();
  const profile = records.find((record) => record.id === personId && (record.className === "person" || record.className === "org"));
  if (!profile) throw new Error("People profile not found");
  return { personId, profile };
}

export async function GET(request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { personId } = await requirePeopleProfile(context);
    const photo = await readPeopleProfilePhoto(personId);
    if (!photo) return privateJson({ ok: false, error: "Profile picture not found" }, { status: 404 });
    if (new URL(request.url).searchParams.get("edit") === "1") {
      const source = photo.source || photo;
      return privateJson({ ok: true, source: `data:${source.mimeType};base64,${source.bytesBase64}`, updatedAt: photo.updatedAt,
        crop: photo.crop || { zoom: 1, panX: 0, panY: 0, outputSize: 512 } });
    }
    return new NextResponse(Buffer.from(photo.bytesBase64, "base64"), {
      status: 200,
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Length": String(photo.byteLength),
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile picture could not be loaded";
    return privateJson({ ok: false, error: message }, { status: message === "People profile not found" ? 404 : 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCsrfRequestValid(request)) return privateJson({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  try {
    const { personId } = await requirePeopleProfile(context);
    const formData = await request.formData();
    const source = formData.get("source");
    const image = source || formData.get("photo");
    if (!(image instanceof File)) throw new Error("Choose a profile picture first.");
    const bytes = new Uint8Array(await image.arrayBuffer());
    const photo = source ? await cropPeopleProfilePhoto(personId, JSON.parse(String(formData.get("crop"))), undefined, { mimeType: image.type, bytes })
      : await writePeopleProfilePhoto(personId, image.type, bytes);
    await appendAuditEvent({
      at: photo.updatedAt,
      action: "people.profile_photo.update.success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: personId
    });
    return privateJson({
      ok: true,
      photo: {
        url: `/api/people/photos/${encodeURIComponent(personId)}`,
        updatedAt: photo.updatedAt,
        byteLength: photo.byteLength
      }
    });
  } catch (error) {
    return privateJson(
      { ok: false, error: error instanceof Error ? error.message : "Profile picture could not be saved" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCsrfRequestValid(request)) return privateJson({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  try {
    const { personId } = await requirePeopleProfile(context);
    const input = await request.json();
    const photo = await cropPeopleProfilePhoto(personId, input.crop, input.expectedUpdatedAt);
    await appendAuditEvent({ at: photo.updatedAt, action: "people.profile_photo.crop.success", path: new URL(request.url).pathname,
      method: "PATCH", ip: getRequestIp(request), status: "ok", detail: personId });
    return privateJson({ ok: true, photo: { url: `/api/people/photos/${encodeURIComponent(personId)}`, updatedAt: photo.updatedAt, byteLength: photo.byteLength } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Picture crop could not be saved";
    return privateJson({ ok: false, error: message }, { status: message.startsWith("This picture changed") ? 409 : 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCsrfRequestValid(request)) return privateJson({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  try {
    const { personId } = await requirePeopleProfile(context);
    await removePeopleProfilePhoto(personId);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "people.profile_photo.remove.success",
      path: new URL(request.url).pathname,
      method: "DELETE",
      ip: getRequestIp(request),
      status: "ok",
      detail: personId
    });
    return privateJson({ ok: true });
  } catch (error) {
    return privateJson(
      { ok: false, error: error instanceof Error ? error.message : "Profile picture could not be removed" },
      { status: 400 }
    );
  }
}
