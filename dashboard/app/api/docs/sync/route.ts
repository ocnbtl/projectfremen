import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { syncDocsIndex } from "../../../../lib/docs-sync";

export const runtime = "nodejs";

export async function POST() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await syncDocsIndex();
    return NextResponse.json({
      ok: true,
      lastSynced: state.lastSynced,
      count: state.items.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed"
      },
      { status: 500 }
    );
  }
}
