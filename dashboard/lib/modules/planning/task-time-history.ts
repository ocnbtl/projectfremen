import { instantFor, localFor } from "./calendar-model";
import type { TaskItem } from "./task-model";
import type { EventOccurrence } from "./types";

export type TaskTimeChange = {
  taskId: string;
  title: string;
  occurrenceKey?: string;
  recurrence: string;
  timeZone: string;
  before: { start: string; end: string };
  after: { start: string; end: string };
};

export function taskTimeChange(task: TaskItem, occurrence: EventOccurrence, start: string, end: string): TaskTimeChange {
  return {taskId:task.id,title:task.title,occurrenceKey:task.recurrence?occurrence.occurrenceKey:undefined,
    recurrence:task.recurrence,timeZone:task.timeZone,
    before:{start:occurrence.start,end:occurrence.end},after:{start,end}};
}

/** Undo only our timing edit, never a later schedule change or unrelated task fields. */
export function canUndoTaskTime(task: TaskItem, change: TaskTimeChange): boolean {
  if (task.id!==change.taskId || task.timeZone!==change.timeZone || task.recurrence!==change.recurrence || task.allDay || !task.start) return false;
  const override=change.occurrenceKey?task.exceptions[change.occurrenceKey]:undefined;
  if (override?.cancelled || override?.allDay) return false;
  try {
    const start=change.occurrenceKey ? override?.start||change.occurrenceKey : task.start;
    const end=change.occurrenceKey ? override?.end||localFor(instantFor(start,task.timeZone)+instantFor(task.end,task.timeZone)-instantFor(task.start,task.timeZone),task.timeZone) : task.end;
    return instantFor(start,task.timeZone)===instantFor(change.after.start,task.timeZone) && instantFor(end,task.timeZone)===instantFor(change.after.end,task.timeZone);
  } catch { return false; }
}
