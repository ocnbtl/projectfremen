import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { runObsidianExport } from "../../../../lib/obsidian-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const preview = await runObsidianExport("dry-run");
  return NextResponse.json({
    ok: true,
    rootDir: preview.rootDir,
    itemCount: preview.items.length
  });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isCsrfRequestValid(request)) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "obsidian.export.csrf_failed",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "denied"
    });
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  const mode = body.dryRun ? "dry-run" : "write";

  try {
    const result = await runObsidianExport(mode);
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: mode === "write" ? "obsidian.export.write_success" : "obsidian.export.preview_success",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
      detail: `items=${result.items.length}`
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      rootDir: result.rootDir,
      itemCount: result.items.length,
      items: result.items.slice(0, 100)
    });
  } catch (error) {
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: "obsidian.export.error",
      path: new URL(request.url).pathname,
      method: "POST",
      ip: getRequestIp(request),
      status: "error",
      detail: error instanceof Error ? error.message : "Export failed"
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}

