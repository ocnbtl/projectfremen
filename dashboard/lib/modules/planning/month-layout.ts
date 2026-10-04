import { localFor } from "./calendar-model";
import type { EventOccurrence } from "./types";

export type MonthSegment = {
  event: EventOccurrence; first: number; last: number; lane: number;
  continuesBefore: boolean; continuesAfter: boolean;
};

/** Pack a visible week into shared lanes so spanning events never overlap. */
export function monthWeekLayout(days: string[], events: EventOccurrence[], zone: string, laneLimit = 2) {
  const candidates: Omit<MonthSegment, "lane">[] = [];
  for (const event of events) {
    const start = localFor(event.startMs, zone).slice(0, 10);
    const end = localFor(event.endMs - 1, zone).slice(0, 10);
    const columns = days.flatMap((day, index) => start <= day && day <= end ? [index] : []);
    if (!columns.length) continue;
    const first = columns[0], last = columns[columns.length - 1];
    if (event.allDay) candidates.push({ event, first, last, continuesBefore: start < days[first], continuesAfter: end > days[last] });
    else for (const column of columns) candidates.push({ event, first: column, last: column, continuesBefore: false, continuesAfter: false });
  }
  candidates.sort((a, b) => Number(b.event.allDay) - Number(a.event.allDay) || (b.last - b.first) - (a.last - a.first) || a.event.startMs - b.event.startMs || a.event.id.localeCompare(b.event.id));
  const occupied: boolean[][] = [], segments: MonthSegment[] = [], hidden = days.map(() => 0);
  for (const candidate of candidates) {
    let lane = 0;
    while (occupied[lane]?.some((used, column) => used && column >= candidate.first && column <= candidate.last)) lane++;
    occupied[lane] ||= days.map(() => false);
    for (let column = candidate.first; column <= candidate.last; column++) {
      occupied[lane][column] = true;
      if (lane >= laneLimit) hidden[column]++;
    }
    if (lane < laneLimit) segments.push({ ...candidate, lane });
  }
  return { segments, hidden };
}
