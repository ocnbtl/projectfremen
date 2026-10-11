import { resolveCalendarShare, serializeCalendarShare, sharedEvents } from "../../../../lib/modules/planning/calendar-sharing";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import { repeatBirthdays } from "../../../../lib/modules/planning/repeat-birthdays";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const share = await resolveCalendarShare((await context.params).token);
    if (!share) return new Response("Calendar link not found.", { status: 404, headers });
    const state = await readPlanningState();
    const birthdays = await repeatBirthdays(sharedEvents(share, state));
    const body = serializeCalendarShare(share, state, birthdays);
    return new Response(body, { headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="calendar.ics"' } });
  } catch {
    return new Response("Calendar temporarily unavailable. Please retry later.", { status: 503, headers: { ...headers, "Retry-After": "60" } });
  }
}
