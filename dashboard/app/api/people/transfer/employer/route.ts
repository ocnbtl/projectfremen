import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../../lib/csrf";
import { discoverImportedEmployer } from "../../../../../lib/server/import-organization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
let active = 0;
let requests: number[] = [];
export async function POST(request: Request) {
  const json = (data: unknown, status = 200) =>
    NextResponse.json(data, { status, headers });
  if (!(await hasAdminSession()))
    return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request))
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  const now = Date.now();
  requests = requests.filter((at) => now - at < 60_000);
  if (active >= 2 || requests.length >= 60)
    return json(
      {
        ok: false,
        error: "Another employer lookup is running. Try again shortly.",
      },
      429,
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const timer = setTimeout(() => void reader.cancel(), 3000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(value);
      }
    } finally {
      clearTimeout(timer);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(raw);
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 240 ||
      typeof body.website !== "string" ||
      body.website.length > 2048
    )
      throw new Error();
    active++;
    requests.push(now);
    try {
      return json({
        ok: true,
        result: await discoverImportedEmployer(body.name.trim(), body.website),
      });
    } finally {
      active--;
    }
  } catch {
    return json(
      {
        ok: false,
        error:
          "Public details were unavailable. You can import the employer name now or add its website and retry.",
      },
      422,
    );
  }
}
