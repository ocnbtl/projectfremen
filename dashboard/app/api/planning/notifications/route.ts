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
    const zone = new URL(request.url).searchParams.get("zone") || "UTC",
      now = Date.now();
    const today = localDate(new Date(now), zone),
      state = await readPlanningState();
    const events = eventOccurrences(
      state.events,
      addDays(today, -30),
      addDays(today, 2),
      zone,
    );
    const reminders = events
      .filter(
        (e) =>
          e.reminderMinutes !== null &&
          e.startMs - e.reminderMinutes * 60000 <= now,
      )
      .flatMap((e) => {
        const receipt = state.reminders.find((r) => r.occurrenceId === e.id);
        return receipt &&
          (receipt.state === "dismissed" ||
            Date.parse(receipt.until || "") > now)
          ? []
          : [
              {
                id: e.id,
                eventId: e.eventId,
                occurrenceKey: e.occurrenceKey,
                date: localDate(new Date(e.startMs), zone),
                title: e.title,
                startMs: e.startMs,
                allDay: e.allDay,
                receipt,
              },
            ];
      })
      .sort((a, b) => b.startMs - a.startMs);
    const refresh = state.connections
      .filter(
        (c) =>
          !c.archivedAt &&
          c.kind !== "ics_file" &&
          (c.kind !== "morgen" || process.env.MORGEN_API_KEY) &&
          now -
            Date.parse(c.lastAttemptAt || c.lastSuccessAt || "1970-01-01") >=
            15 * 60000,
      )
      .map((c) => c.id)
      .slice(0, 5);
    return NextResponse.json(
      { reminders: reminders.slice(0, 100), total: reminders.length, refresh },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Reminders could not refresh" },
      { status: 503, headers },
    );
  }
}
