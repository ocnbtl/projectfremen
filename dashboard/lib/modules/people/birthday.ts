export type BirthdayParts = {
  month: number;
  day: number;
  year?: number;
};

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseBirthday(value?: string): BirthdayParts | null {
  if (!value) return null;
  const complete = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const partial = value.match(/^--(\d{2})-(\d{2})$/);
  if (!complete && !partial) return null;
  const year = complete ? Number(complete[1]) : undefined;
  const month = Number((complete || partial)![complete ? 2 : 1]);
  const day = Number((complete || partial)![complete ? 3 : 2]);
  const validationYear = year || 2000;
  if (!isRealDate(validationYear, month, day)) return null;
  return { month, day, ...(year ? { year } : {}) };
}

export function birthdayForStorage(parts: Partial<BirthdayParts>): string {
  const month = Number(parts.month || 0);
  const day = Number(parts.day || 0);
  const year = Number(parts.year || 0);
  if (!month && !day && !year) return "";
  if (!month || !day) throw new Error("Birthday needs both a month and day.");
  const validationYear = year || 2000;
  if (!isRealDate(validationYear, month, day)) throw new Error("Birthday is not a valid calendar date.");
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return year ? `${String(year).padStart(4, "0")}-${monthText}-${dayText}` : `--${monthText}-${dayText}`;
}

export function normalizeBirthday(value: string, strict = false): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = parseBirthday(trimmed);
  if (parts) return birthdayForStorage(parts);
  if (strict) throw new Error("Birthday must include a valid month and day; the year is optional.");
  return "";
}

export function formatBirthday(value?: string, includeYear = true): string {
  const parts = parseBirthday(value);
  if (!parts) return value || "-";
  const date = new Date(parts.year || 2000, parts.month - 1, parts.day);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear && parts.year ? { year: "numeric" } : {})
  }).format(date);
}
