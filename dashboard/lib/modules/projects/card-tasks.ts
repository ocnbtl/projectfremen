import { taskLinks, taskEvents, calendarTaskRecords, type TaskItem } from "../planning/task-model";
import { addDays, eventOccurrences, localDate } from "../planning/calendar-model";
import type { Calendar, CalendarEvent } from "../planning/types";

export type ProjectTaskRow = { item: TaskItem; occurrence: string; completed: boolean; canComplete: boolean; date: string };
export function projectCardTasks(data: {items:TaskItem[];calendars:Calendar[];events:CalendarEvent[]}, zone:string, now=new Date()) {
  const today=localDate(now,zone), grouped=new Map<string,ProjectTaskRow[]>(), seen=new Set<string>();
  for (const item of data.items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const projects=[...new Set(taskLinks(item).filter(ref=>ref.module==="projects"&&ref.objectType==="project").map(ref=>ref.objectId))];
    if (!projects.length) continue;
    let occurrence=item.start, completed=!!item.completed, date=item.start, canComplete=true;
    if (item.recurrence) {
      const event=item.source?.family==="events" ? calendarTaskRecords(data.events.filter(event=>event.id===item.source?.id),data.calendars,zone)[0] : taskEvents([item],data.calendars,zone)[0];
      // Keep today's occurrence visible after completion so another tap never completes tomorrow.
      const next=event ? eventOccurrences([event],today,addDays(today,370),zone)[0] : undefined;
      occurrence=next?.occurrenceKey||""; completed=!!next?.completed; date=next?.start||""; canComplete=!!next;
    }
    for (const id of projects) grouped.set(id,[...(grouped.get(id)||[]),{item,occurrence,completed,canComplete,date}]);
  }
  for (const rows of grouped.values()) rows.sort((a,b)=>Number(a.completed)-Number(b.completed)||(a.item.dueAt||a.date||"9999").localeCompare(b.item.dueAt||b.date||"9999")||a.item.title.localeCompare(b.item.title)||a.item.id.localeCompare(b.item.id));
  return grouped;
}
