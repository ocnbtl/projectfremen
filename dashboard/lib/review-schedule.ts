export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMonthDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

export function daysUntil(target: Date, from = new Date()): number {
  const targetDay = startOfLocalDay(target);
  const fromDay = startOfLocalDay(from);
  const diffMs = targetDay.getTime() - fromDay.getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

export function getNextSunday(from = new Date()): Date {
  const base = startOfLocalDay(from);
  const day = base.getDay();
  const add = (7 - day) % 7;
  base.setDate(base.getDate() + add);
  return base;
}

export function getFirstSundayOfMonth(year: number, monthIndex: number): Date {
  const first = new Date(year, monthIndex, 1);
  const add = (7 - first.getDay()) % 7;
  first.setDate(1 + add);
  return first;
}

export function getNextFirstSunday(from = new Date()): Date {
  const today = startOfLocalDay(from);
  const year = today.getFullYear();
  const month = today.getMonth();

  const thisMonthFirstSunday = getFirstSundayOfMonth(year, month);
  if (thisMonthFirstSunday.getTime() >= today.getTime()) {
    return thisMonthFirstSunday;
  }

  const nextMonth = new Date(year, month + 1, 1);
  return getFirstSundayOfMonth(nextMonth.getFullYear(), nextMonth.getMonth());
}

export function getNextFriday(from = new Date()): Date {
  const base = startOfLocalDay(from);
  const day = base.getDay();
  const add = (5 - day + 7) % 7;
  base.setDate(base.getDate() + add);
  return base;
}
