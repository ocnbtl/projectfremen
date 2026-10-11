import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import { changeCalendarShare, readCalendarShares, shareView, ShareError } from "../../../../lib/modules/planning/calendar-sharing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET() {
  if (!(await hasAdminSession())) return json({ error: "Unauthorized" }, 401);
  try { return json({ shares: (await readCalendarShares()).map(shareView) }); }
  catch { return json({ error: "Sharing links could not be loaded. Please try again." }, 503); }
}
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ error: "Refresh the page and try again." }, 403);
  try {
    const text = await request.text();
    if (text.length > 16000) return json({ error: "Sharing request is too large." }, 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(text); } catch { return json({ error: "Invalid sharing request." }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid sharing request." }, 400);
    const state = await readPlanningState();
    const share = await changeCalendarShare(input, state.calendars);
    return json({ share: shareView(share) });
  } catch (error) {
    return error instanceof ShareError ? json({ error: error.message }, error.status) : json({ error: "This change could not be saved. Please try again." }, 503);
  }
}
