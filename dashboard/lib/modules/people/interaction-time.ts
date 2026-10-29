import { Temporal } from "@js-temporal/polyfill";

export type InteractionTimeRange = { date: string; startTime: string; endTime: string };
const clock = (value: Temporal.PlainDateTime) => value.toPlainTime().toString({ smallestUnit: "minute" });

export function newInteractionTimeRange(now = new Date()): InteractionTimeRange {
  const end = Temporal.PlainDateTime.from({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() });
  const start = end.subtract({ hours: 1 });
  return { date: start.toPlainDate().toString(), startTime: clock(start), endTime: clock(end) };
}

export function adjustInteractionTime(range: InteractionTimeRange, field: "startTime" | "endTime", value: string): InteractionTimeRange {
  if (value === range[field]) return range;
  if (!value) return { ...range, [field]: "" };
  if (field === "startTime") {
    const end = Temporal.PlainDateTime.from(`${range.date}T${value}`).add({ hours: 1 });
    return { ...range, startTime: value, endTime: clock(end) };
  }
  // End edits belong to the user. An earlier clock time means the next day;
  // it must never rewrite the recorded start or its date.
  return { ...range, endTime: value };
}
