import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import { bookingLinkView, changeBookingLink, BookingError } from "../../../../lib/modules/planning/calendar-booking";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET() {
  if (!(await hasAdminSession())) return json({ error: "Unauthorized" }, 401);
  try { const state = await readPlanningState(); return json({ links: (state.bookingData?.links || []).map(link => bookingLinkView(link, state)) }); }
  catch { return json({ error: "Booking links could not be loaded. Please try again." }, 503); }
}
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ error: "Refresh the page and try again." }, 403);
  try {
    const body = await request.text();
    if (body.length > 24000) return json({ error: "Request too large." }, 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(body); } catch { return json({ error: "Invalid request." }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid request." }, 400);
    return json({ link: await changeBookingLink(input) });
  } catch (error) { return error instanceof BookingError ? json({ error: error.message }, error.status) : json({ error: "The booking link could not be saved. Please try again." }, 503); }
}
