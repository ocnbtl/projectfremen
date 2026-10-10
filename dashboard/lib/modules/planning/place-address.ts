import metadata from "./address-countries.json";

export type AddressParts = { street: string; city: string; region: string; postalCode: string; district: string };
type CountryFormat = { name: string; format: string; region: string; city: string; postal: string };
export const ADDRESS_COUNTRIES: Record<string, CountryFormat> = metadata;
export const addressCountries = Object.entries(ADDRESS_COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name));

const usRegions = "AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|PR:Puerto Rico|VI:Virgin Islands|GU:Guam|AS:American Samoa|MP:Northern Mariana Islands".split("|").map(row => row.split(":"));

/** Split only recognizable US postal addresses. Ambiguous/international text stays intact. */
export function splitPastedAddress(text: string, country = "US"): AddressParts | undefined {
  if (country !== "US" || /^https?:\/\//i.test(text.trim())) return;
  const clean = text.trim().replace(/(?:,|\s)+(?:USA|US|U\.S\.A\.?|United States(?: of America)?)\.?$/i, "").trim();
  const postal = clean.match(/(?:\s|,)\s*(\d{5}(?:-\d{4})?)$/);
  if (!postal || postal.index === undefined) return;
  const beforeZip = clean.slice(0, postal.index).replace(/[\s,]+$/, "");
  const region = usRegions.flatMap(([code, name]) => [code, name].map(label => ({ code, label })))
    .sort((a, b) => b.label.length - a.label.length)
    .find(({ label }) => beforeZip.toLowerCase().endsWith(` ${label.toLowerCase()}`) || beforeZip.toLowerCase().endsWith(`,${label.toLowerCase()}`));
  if (!region) return;
  const beforeRegion = beforeZip.slice(0, -region.label.length).replace(/[\s,]+$/, "");
  let lines = beforeRegion.split(/\s*[,\n\r]+\s*/).filter(Boolean);
  // Copied map addresses often omit the comma after the street. Only split at a
  // recognizable street suffix, keeping directional and unit information attached.
  if (lines.length === 1) {
    const streetCity = lines[0].match(/^(\d[\w-]*\s+.+\s(?:street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|court|ct|circle|cir|parkway|pkwy|highway|hwy|way|place|pl|terrace|ter)\.?(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?(?:\s+(?:apt|suite|ste|unit|#)\.?\s*[\w-]+)?)\s+([A-Za-z][A-Za-z .'-]+)$/i);
    if (streetCity) lines = [streetCity[1], streetCity[2]];
  }
  if (lines.length < 2 || !/\d/.test(lines[0])) return;
  const city = lines.pop()!;
  if (/\d/.test(city)) return;
  return { street: lines.join(", "), city, region: region.code, postalCode: postal[1], district: "" };
}
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
