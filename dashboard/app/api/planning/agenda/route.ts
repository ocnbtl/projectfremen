import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import {
  localDate,
  addDays,
  eventOccurrences,
} from "../../../../lib/modules/planning/calendar-model";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!(await hasAdminSession()))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  try {
    const zone = new URL(request.url).searchParams.get("zone") || "UTC";
    const today = localDate(new Date(), zone),
      state = await readPlanningState();
    const visible = new Set(
      state.calendars
        .filter((c) => c.visible && !c.archivedAt)
        .map((c) => c.id),
    );
    const events = eventOccurrences(
      state.events,
      today,
      addDays(today, 1),
      zone,
    )
      .filter((e) => visible.has(e.calendarId))
      .slice(0, 6);
    return NextResponse.json({ events }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Calendar unavailable" },
      { status: 503, headers },
    );
  }
}
