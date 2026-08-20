export type PhoneCountryFormat = {
  code: string;
  country: string;
  localDigits: number;
  groups: number[];
};

export const PHONE_COUNTRY_FORMATS: readonly PhoneCountryFormat[] = [
  { code: "+1", country: "United States / Canada", localDigits: 10, groups: [3, 3, 4] },
  { code: "+51", country: "Peru", localDigits: 9, groups: [3, 3, 3] },
  { code: "+52", country: "Mexico", localDigits: 10, groups: [3, 3, 4] },
  { code: "+54", country: "Argentina", localDigits: 10, groups: [2, 4, 4] },
  { code: "+55", country: "Brazil", localDigits: 11, groups: [2, 5, 4] },
  { code: "+34", country: "Spain", localDigits: 9, groups: [3, 3, 3] },
  { code: "+44", country: "United Kingdom", localDigits: 10, groups: [4, 3, 3] },
  { code: "+49", country: "Germany", localDigits: 10, groups: [3, 3, 4] },
  { code: "+33", country: "France", localDigits: 9, groups: [1, 2, 2, 2, 2] },
  { code: "+39", country: "Italy", localDigits: 10, groups: [3, 3, 4] },
  { code: "+81", country: "Japan", localDigits: 10, groups: [2, 4, 4] },
  { code: "+61", country: "Australia", localDigits: 9, groups: [1, 4, 4] }
] as const;

const COUNTRY_CODES_LONGEST_FIRST = [...PHONE_COUNTRY_FORMATS].sort((left, right) => right.code.length - left.code.length);

export function normalizeCountryCodeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "").slice(0, 4);
  if (!digits) return trimmed.includes("+") ? "+" : "";
  return `+${digits}`;
}

export function canonicalCountryCode(value: string, fallback = "+1"): string {
  const normalized = normalizeCountryCodeInput(value);
  return /^\+\d{1,4}$/.test(normalized) ? normalized : fallback;
}

function formatForCode(code: string): PhoneCountryFormat | undefined {
  return PHONE_COUNTRY_FORMATS.find((entry) => entry.code === code);
}

function detectCode(canonicalDigits: string, preferredCode: string): string {
  const preferredDigits = canonicalCountryCode(preferredCode, "").replace(/\D/g, "");
  if (preferredDigits && canonicalDigits.startsWith(preferredDigits)) return `+${preferredDigits}`;
  return COUNTRY_CODES_LONGEST_FIRST.find((entry) => canonicalDigits.startsWith(entry.code.slice(1)))?.code || "";
}

function groupUnknownLocalNumber(local: string): string[] {
  if (local.length <= 4) return [local];
  const groups: string[] = [];
  let remaining = local;
  const leadLength = remaining.length % 3 || 3;
  groups.push(remaining.slice(0, leadLength));
  remaining = remaining.slice(leadLength);
  while (remaining) {
    groups.push(remaining.slice(0, 3));
    remaining = remaining.slice(3);
  }
  return groups.filter(Boolean);
}

function groupLocalNumber(local: string, groups: readonly number[]): string[] {
  const parts: string[] = [];
  let offset = 0;
  for (const size of groups) {
    if (offset >= local.length) break;
    parts.push(local.slice(offset, offset + size));
    offset += size;
  }
  if (offset < local.length) parts.push(local.slice(offset));
  return parts.filter(Boolean);
}

export function normalizePhoneForStorage(value: string, countryCode = "+1"): string {
  const clean = value.trim();
  if (!clean) return "";
  const digits = clean.replace(/\D/g, "");
  if (!digits) return "";
  if (clean.startsWith("+")) return `+${digits}`;
  const code = canonicalCountryCode(countryCode, "").replace(/\D/g, "");
  return code ? `+${code}${digits}` : "";
}

export function phoneLocalDigits(value: string, countryCode: string): string {
  const canonical = normalizePhoneForStorage(value, countryCode).replace(/\D/g, "");
  if (!canonical) return "";
  const code = detectCode(canonical, countryCode).replace(/\D/g, "");
  return code && canonical.startsWith(code) ? canonical.slice(code.length) : canonical;
}

export function validateInternationalPhone(value: string, countryCode: string): string | null {
  const canonical = normalizePhoneForStorage(value, countryCode);
  const digits = canonical.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "Phone numbers must contain 7 to 15 international digits.";
  const code = detectCode(digits, countryCode);
  const format = formatForCode(code);
  if (format) {
    const local = digits.slice(code.slice(1).length);
    if (local.length !== format.localDigits) {
      return `${format.country} phone numbers use ${format.localDigits} digits after ${format.code}.`;
    }
  }
  return null;
}

export function formatInternationalPhone(value: string, countryCode = "+1"): string {
  const canonical = normalizePhoneForStorage(value, countryCode);
  const digits = canonical.replace(/\D/g, "");
  if (!digits) return "";
  const code = detectCode(digits, countryCode);
  const codeDigits = code.replace(/\D/g, "");
  const local = codeDigits && digits.startsWith(codeDigits) ? digits.slice(codeDigits.length) : digits;
  const format = formatForCode(code);
  const grouped = format && local.length <= format.localDigits
    ? groupLocalNumber(local, format.groups)
    : groupUnknownLocalNumber(local);
  return `${code || "+"} ${grouped.join("-")}`.trim();
}

export function rebasePhoneCountryCode(value: string, previousCode: string, nextCode: string): string {
  const canonicalNext = canonicalCountryCode(nextCode, "");
  if (!value.trim() || !canonicalNext) return value;
  const local = phoneLocalDigits(value, previousCode);
  return formatInternationalPhone(local, canonicalNext);
}
