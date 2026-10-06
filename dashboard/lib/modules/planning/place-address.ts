import metadata from "./address-countries.json";

export type AddressParts = { street: string; city: string; region: string; postalCode: string; district: string };
type CountryFormat = { name: string; format: string; region: string; city: string; postal: string };
export const ADDRESS_COUNTRIES: Record<string, CountryFormat> = metadata;
export const addressCountries = Object.entries(ADDRESS_COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name));
export function normalizeAddressCountry(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !Object.hasOwn(ADDRESS_COUNTRIES, value.trim().toUpperCase())) throw new Error("Choose a valid address country");
  return value.trim().toUpperCase();
}
const fields = { A: "street", C: "city", S: "region", Z: "postalCode", D: "district" } as const;
export function addressFields(country: string): (keyof AddressParts)[] {
  const format = ADDRESS_COUNTRIES[country]?.format || "%A%n%C%n%S %Z";
  return [...new Set([...format.matchAll(/%([CSZD])/g)].map(match => fields[match[1] as keyof typeof fields]))];
}
export function addressFieldLabel(field: keyof AddressParts, country: string): string {
  const entry = ADDRESS_COUNTRIES[country];
  const value = field === "region" ? entry?.region || "region" : field === "city" ? entry?.city || "city" : field === "postalCode" ? entry?.postal === "zip" ? "ZIP code" : "postal code" : field === "district" ? "district" : "street address";
  return value.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}
export function formatPlaceAddress(parts: AddressParts, country: string): string {
  if (!Object.values(parts).some(value => value.trim())) return "";
  const entry = ADDRESS_COUNTRIES[country];
  const used = new Set<string>();
  const lines = (entry?.format || "%A%n%C%n%S %Z").split("%n").map(line => line.replace(/%([A-Z])/g, (_, token: string) => {
    const field = fields[token as keyof typeof fields];
    if (!field) return "";
    used.add(field);
    return parts[field]?.trim() || "";
  }).replace(/^[\s,〒-]+|[\s,-]+$/g, "").replace(/\s+/g, " ")).filter(Boolean);
  // Switching country never discards a field already entered by the user.
  for (const field of Object.values(fields)) if (!used.has(field) && parts[field]?.trim()) lines.push(parts[field].trim());
  if (lines.length && entry) lines.push(entry.name);
  return lines.join(", ");
}

export function normalizeAddressParts(value: unknown): AddressParts | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid address fields");
  return Object.fromEntries(Object.values(fields).map(field => {
    const raw = (value as Record<string, unknown>)[field];
    if (raw != null && typeof raw !== "string") throw new Error("Invalid address field");
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text.length > 240) throw new Error("Address fields must be 240 characters or fewer");
    return [field, text];
  })) as AddressParts;
}
