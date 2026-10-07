import { reminderIsDue } from "../../../../lib/modules/planning/calendar-tasks";
import { readPersonalRecords } from "../../../../lib/personal-records-store";
import { repeatBirthdays } from "../../../../lib/modules/planning/repeat-birthdays";
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
    const birthdays = await repeatBirthdays(state.events);
    const recent = eventOccurrences(
      state.events,
      addDays(today, -30),
      addDays(today, 31),
      zone,
      birthdays,
    );
    // An unfinished task does not expire when it leaves the ordinary reminder window.
    const taskRecords = state.events.filter(event => event.isTask || event.overrides?.isTask || Object.values(event.exceptions || {}).some(value => value.isTask) || Object.values(event.sourceExceptions || {}).some(value => value.isTask));
    const firstTaskDate = taskRecords.flatMap(event => [event.start, event.overrides?.start, ...Object.values(event.exceptions || {}).map(value => value.start)]).filter((value): value is string => Boolean(value)).map(value => value.slice(0,10)).sort()[0];
    const olderTasks = firstTaskDate && firstTaskDate < addDays(today,-30) ? eventOccurrences(taskRecords,firstTaskDate,addDays(today,-30),zone,birthdays).filter(event => event.isTask) : [];
    const events = [...new Map([...olderTasks,...recent].map(event => [event.id,event])).values()];
    const records = events.some(e => e.linkedRefs.length) ? await readPersonalRecords().catch(() => []) : [];
    const reminders = events
      .filter(
        (e) =>
          reminderIsDue(e, state.reminders.find(r => r.occurrenceId === e.id), now),
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
                endMs: e.endMs,
                timeZone: zone,
                linkedRefs: e.linkedRefs.map(ref => { const record=records.find(r => r.id === ref.objectId); return record ? {...ref, preview:{imageUrl:record.profile?.photoUrl || record.resourceProfile?.metadata?.imageUrl || "", imageUpdatedAt:record.profile?.photoUpdatedAt}} : ref; }),
                place: (() => { const p=state.places.find(p => p.id === e.placeId); return p ? {id:p.id,name:p.name} : undefined; })(),
                location: e.location,
                allDay: e.allDay,
                isTask: Boolean(e.isTask),
                eventUpdatedAt: state.events.find(event => event.id === e.eventId)?.updatedAt,
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
