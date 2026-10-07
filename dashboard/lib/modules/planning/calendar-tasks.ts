import { effectiveEvent, type CalendarEvent, type EventOccurrence, type ReminderReceipt } from "./types";

/** Completion belongs to an occurrence, never implicitly to a repeating series. */
export function taskCompletionPatch(record: CalendarEvent, occurrenceKey: string, completed: boolean) {
  const event = effectiveEvent(record);
  const exception = { ...record.sourceExceptions?.[occurrenceKey], ...record.exceptions?.[occurrenceKey] };
  if (record.archivedAt || !(exception.isTask ?? event.isTask) || exception.cancelled || record.overrides?.cancelled || event.source?.cancelled)
    throw new Error("This task is no longer available. Refresh your calendar.");
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(occurrenceKey))
    throw new Error("Choose a valid task occurrence");
  if (event.recurrence || event.recurrenceDates?.length)
    return { id: record.id, exceptions: { ...record.exceptions, [occurrenceKey]: { ...record.exceptions?.[occurrenceKey], completed } } };
  if (occurrenceKey !== event.start) throw new Error("This task changed. Refresh your calendar.");
  return record.source
    ? { id: record.id, overrides: { ...record.overrides, completed } }
    : { id: record.id, completed };
}

export function reminderIsDue(event: EventOccurrence, receipt: ReminderReceipt | undefined, now: number) {
  if (event.isTask && event.completed) return false;
  if (event.reminderMinutes === null || event.startMs - event.reminderMinutes * 60000 > now) return false;
  return !receipt || (receipt.state !== "dismissed" && !(Date.parse(receipt.until || "") > now));
}

export function taskReminderStatus(startMs: number, endMs: number, now: number) {
  if (now < startMs) return `Upcoming task in ${Math.ceil((startMs - now) / 60000)} min`;
  return now < endMs ? "Task ongoing" : "Task overdue";
}

export function resizedEventTime(event: Pick<EventOccurrence, "startMs" | "endMs">, edge: "start" | "end", value: number) {
  return edge === "start"
    ? { startMs: Math.min(value, event.endMs - 300000), endMs: event.endMs }
    : { startMs: event.startMs, endMs: Math.max(value, event.startMs + 300000) };
}
