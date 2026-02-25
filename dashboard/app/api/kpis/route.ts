import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { readKpis, upsertKpi } from "../../../lib/kpis-store";
import type { EntityName } from "../../../lib/types";

export const runtime = "nodejs";

const ALLOWED_ENTITIES: EntityName[] = ["Unigentamos", "pngwn", "Diyesu Decor"];
const ALLOWED_PRIORITIES = ["P1", "P2", "P3"] as const;

export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const items = await readKpis();
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    entity?: string;
    name?: string;
    value?: string;
    priority?: string;
    link?: string;
  };

  const entity = body.entity?.trim() as EntityName | undefined;
  const name = body.name?.trim() || "";
  const value = body.value?.trim() || "";
  const priority = body.priority?.trim() || "P1";
  const link = body.link?.trim() || "";

  if (!entity || !ALLOWED_ENTITIES.includes(entity)) {
    return NextResponse.json({ ok: false, error: "Invalid entity" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ ok: false, error: "Value is required" }, { status: 400 });
  }
  if (!ALLOWED_PRIORITIES.includes(priority as (typeof ALLOWED_PRIORITIES)[number])) {
    return NextResponse.json({ ok: false, error: "Invalid priority" }, { status: 400 });
  }
  if (link && !/^https?:\/\//i.test(link)) {
    return NextResponse.json(
      { ok: false, error: "Link must start with http:// or https://" },
      { status: 400 }
    );
  }

  const items = await upsertKpi({
    entity,
    name,
    value,
    priority: priority as "P1" | "P2" | "P3",
    link
  });
  return NextResponse.json({ ok: true, items });
}
