import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await hasAdminSession()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  return NextResponse.json({ ok: true, serverTime: now.toISOString() }, {
    headers: { "Cache-Control": "no-store, private", Date: now.toUTCString() }
  });
}
