import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { bookingEmailConfig, bookingEmailSummary, retryBookingEmails } from "../../../../lib/modules/planning/booking-email";
import { readPlanningState } from "../../../../lib/modules/planning/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function retry() {
  if (!bookingEmailConfig().ready) return json({ error: "Booking email delivery needs configuration." }, 503);
  try { await retryBookingEmails(); return json({ emails: bookingEmailSummary(await readPlanningState()) }); }
  catch { return json({ error: "Email delivery could not be checked. Confirmed bookings are safe." }, 503); }
}
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({ error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request)) return json({ error: "Refresh the page and try again." }, 403);
  return retry();
}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(), actual = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: "Unauthorized" }, 401);
  return retry();
}
