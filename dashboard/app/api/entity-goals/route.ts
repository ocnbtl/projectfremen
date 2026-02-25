import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { readEntityGoals, writeEntityGoals } from "../../../lib/entity-goals-store";
import { getEntityHubBySlug } from "../../../lib/entity-hub";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() || "";

  const hub = getEntityHubBySlug(slug);
  if (!hub) {
    return NextResponse.json({ ok: false, error: "Invalid entity slug" }, { status: 400 });
  }

  const goals = await readEntityGoals(slug, hub.defaultGoals);
  return NextResponse.json({ ok: true, goals });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    slug?: string;
    goals?: string[];
  };

  const slug = body.slug?.trim() || "";
  const goals = Array.isArray(body.goals) ? body.goals.map((item) => String(item || "")) : [];

  const hub = getEntityHubBySlug(slug);
  if (!hub) {
    return NextResponse.json({ ok: false, error: "Invalid entity slug" }, { status: 400 });
  }

  const saved = await writeEntityGoals(slug, goals);
  return NextResponse.json({ ok: true, goals: saved });
}
