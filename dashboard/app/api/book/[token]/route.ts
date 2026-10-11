import { after, NextResponse } from "next/server";
import { dispatchBookingEmails } from "../../../../lib/modules/planning/booking-email";
import { BookingError, publicBooking, reserveBooking } from "../../../../lib/modules/planning/calendar-booking";
import { getRequestIp } from "../../../../lib/audit-log";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const failure = (error: unknown) => error instanceof BookingError ? json({ error: error.message }, error.status) : json({ error: "Bookings are temporarily unavailable. Please try again." }, 503);
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try { return json(await publicBooking((await context.params).token)); } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  // Public form, but never accept cross-site submissions or form-encoded writes.
  // Next may use an internal URL behind its proxy; Host retains the public authority.
  let sameHost = false;
  try { const origin = new URL(request.headers.get("origin") || ""); sameHost = ["http:","https:"].includes(origin.protocol) && origin.host === request.headers.get("host"); } catch { /* Missing or malformed origin. */ }
  if (!sameHost || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Submit this form from the booking page." }, 403);
  try {
    const body = await request.text();
    if (body.length > 6000) return json({ error: "Submission too large." }, 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(body); } catch { return json({ error: "Invalid submission." }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid submission." }, 400);
    const booking = await reserveBooking((await context.params).token, input, getRequestIp(request));
    if (booking.confirmationEmail) after(async () => { try { await dispatchBookingEmails(String(input.requestId)); } catch { console.error("Booking email delivery is pending; reservation is confirmed."); } });
    return json({ booking });
  } catch (error) { return failure(error); }
}
