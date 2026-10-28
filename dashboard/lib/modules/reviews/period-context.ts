export type ReviewPeriodItem = { label: string; detail: string };
export type ReviewPeriodGroup = { id: string; label: string; icon: string; href: string; count: number; description: string; items: ReviewPeriodItem[]; unavailable?: boolean };
export type ReviewPeriodContext = { start: string; end: string; loadedAt: string; groups: ReviewPeriodGroup[] };
export function reviewPeriod(start: string, end: string) {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
  if (!valid(start) || !valid(end)) throw new Error("Choose valid review dates");
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days < 0 || days > 62) throw new Error("Choose a review period of up to 63 days");
  return { start, end, nextDay: new Date(Date.parse(end)+86400000).toISOString().slice(0,10), includes: (value?: string) => Boolean(value && value.slice(0,10) >= start && value.slice(0,10) <= end) };
}
