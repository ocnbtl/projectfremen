import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import { readProjectsState } from "../../../../lib/modules/projects/store";
import { readWellnessCalendarEvents } from "../../../../lib/modules/personal-wellness/calendar";
import { eventOccurrences, addDays } from "../../../../lib/modules/planning/calendar-model";
import { repeatBirthdays } from "../../../../lib/modules/planning/repeat-birthdays";
import type { PersonalAgendaEntry } from "../../../../lib/modules/personal-ops/agenda";
export const runtime = "nodejs";
const json = (data: unknown, status=200) => NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});

/** Read-only, requested only when the weekly view opens. No polling, imports or reconciliation. */
export async function GET(request: Request) {
  if (!(await hasAdminSession())) return json({error:"Unauthorized"},401);
  const params = new URL(request.url).searchParams, start = params.get("start") || "", zone = params.get("timeZone") || "UTC";
  let end: string;
  try { if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || new Date(start+"T12:00:00Z").toISOString().slice(0,10) !== start) throw Error(); end=addDays(start,7); new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(); }
  catch { return json({error:"Choose a valid week and time zone."},400); }
  const sources = await Promise.allSettled([readPlanningState(),readProjectsState(),readWellnessCalendarEvents()]);
  const warnings: string[] = [], entries: PersonalAgendaEntry[] = [];
  const planning = sources[0].status === "fulfilled" ? sources[0].value : null;
  const projects = sources[1].status === "fulfilled" ? sources[1].value : null;
  if (!planning) warnings.push("Calendar could not load.");
  if (!projects) warnings.push("Project deadlines could not load.");
  if (sources[2].status === "rejected") warnings.push("Meals, workouts and pet care could not load.");
  const events = [...(planning?.events || []),...(sources[2].status === "fulfilled" ? sources[2].value : [])];
  const birthdays = await repeatBirthdays(events).catch(() => { warnings.push("Birthday-based repeats could not load."); return undefined; });
  const hiddenCalendars = new Set(planning?.calendars.filter(item=>item.archivedAt || !item.visible).map(item=>item.id));
  const dateFormatter = new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"});
  const timeFormatter = new Intl.DateTimeFormat("en-US",{timeZone:zone,hour:"numeric",minute:"2-digit"});
  const seenMilestones = new Set<string>();
  for (const event of events) {
    if (hiddenCalendars.has(event.calendarId)) continue;
    try {
      for (const occurrence of eventOccurrences([event],start,end,zone,birthdays)) {
        for (const ref of occurrence.linkedRefs) if (ref.module === "projects" && ref.objectType === "milestone") seenMilestones.add(ref.objectId);
        const date = occurrence.allDay ? occurrence.start.slice(0,10) : dateFormatter.format(occurrence.startMs);
        const endDate = occurrence.allDay ? addDays(occurrence.end.slice(0,10),-1) : dateFormatter.format(occurrence.endMs-1);
        const href = `/admin/calendar?${new URLSearchParams({selected:occurrence.eventId,occurrence:occurrence.occurrenceKey,date})}`;
        entries.push({id:`calendar:${occurrence.id}`,title:occurrence.title,date,endDate,href,source:occurrence.wellnessSource?.section === "meals" ? "Meals" : occurrence.wellnessSource ? "Fitness" : occurrence.petSource ? "Pet care" : "Calendar",completed:occurrence.completed,sortTime:occurrence.allDay ? 0 : occurrence.startMs,time:occurrence.allDay ? undefined : `${timeFormatter.format(occurrence.startMs)} – ${timeFormatter.format(occurrence.endMs)}`});
      }
    } catch { if (!warnings.includes("Some calendar entries could not be displayed.")) warnings.push("Some calendar entries could not be displayed."); }
  }
  for (const milestone of projects?.milestones || []) {
    const project = projects?.projects.find(item=>item.id === milestone.projectId);
    if (!project || project.archivedAt || ["archived","complete"].includes(project.lifecycle) || milestone.archivedAt || ["archived","complete"].includes(milestone.state) || seenMilestones.has(milestone.id)) continue;
    const date = milestone.dueAt.slice(0,10);
    if (date < start || date >= end) continue;
    entries.push({id:`milestone:${milestone.id}`,title:milestone.title,date,source:project.name,href:`/admin/projects?selected=${encodeURIComponent(project.id)}&tab=overview`});
  }
  return json({entries,warnings});
}
