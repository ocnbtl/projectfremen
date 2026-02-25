import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { readDocsIndex } from "../../../lib/docs-sync";

export const runtime = "nodejs";

function matchIncludes(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const repo = searchParams.get("repo")?.trim() || "";
  const className = searchParams.get("class")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";

  const state = await readDocsIndex();
  let items = state.items;

  if (q) {
    items = items.filter(
      (item) =>
        matchIncludes(item.title, q) ||
        matchIncludes(item.path, q) ||
        item.projects.some((p) => matchIncludes(p, q)) ||
        item.subjects.some((s) => matchIncludes(s, q))
    );
  }
  if (repo) items = items.filter((item) => item.repo === repo);
  if (className) items = items.filter((item) => item.class === className);
  if (status) items = items.filter((item) => item.status === status);

  return NextResponse.json({
    ok: true,
    lastSynced: state.lastSynced,
    items
  });
}
