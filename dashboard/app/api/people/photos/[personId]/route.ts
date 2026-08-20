import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../../lib/csrf";
import {
  readPeopleProfilePhoto,
  removePeopleProfilePhoto,
  writePeopleProfilePhoto
} from "../../../../../lib/modules/people/profile-photos";
import { readPersonalRecords } from "../../../../../lib/personal-records-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ personId: string }> };

async function requirePeopleProfile(context: RouteContext) {
  const { personId } = await context.params;
  const records = await readPersonalRecords();
  const profile = records.find((record) => record.id === personId && (record.className === "person" || record.className === "org"));
  if (!profile) throw new Error("People profile not found");
  return { personId, profile };
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { personId } = await requirePeopleProfile(context);
    const photo = await readPeopleProfilePhoto(personId);
    if (!photo) return NextResponse.json({ ok: false, error: "Profile picture not found" }, { status: 404 });
    return new NextResponse(Buffer.from(photo.bytesBase64, "base64"), {
      status: 200,
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "private, max-age=300, must-revalidate",
        "Content-Length": String(photo.byteLength),
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile picture could not be loaded";
    return NextResponse.json({ ok: false, error: message }, { status: message === "People profile not found" ? 404 : 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCsrfRequestValid(request)) return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  try {
    const { personId } = await requirePeopleProfile(context);
    const formData = await request.formData();
    const image = formData.get("photo");
    if (!(image instanceof File)) throw new Error("Choose a profile picture first.");
    const bytes = new Uint8Array(await image.arrayBuffer());
    const photo = await writePeopleProfilePhoto(personId, image.type, bytes);
    await appendAuditEvent({
      at: photo.updatedAt,
      action: "people.profile_photo.update.success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: personId
    });
    return NextResponse.json({
      ok: true,
      photo: {
        url: `/api/people/photos/${encodeURIComponent(personId)}`,
        updatedAt: photo.updatedAt,
        byteLength: photo.byteLength
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Profile picture could not be saved" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCsrfRequestValid(request)) return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Profile picture could not be removed" },
      { status: 400 }
    );
  }
}
