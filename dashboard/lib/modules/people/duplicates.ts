import type { PersonalRecord } from "../../personal-records-store";
import { normalizePhoneForStorage } from "./phone";

export type DuplicateMatch = { left: PersonalRecord; right: PersonalRecord; reasons: string[]; confidence: "Strong match" | "Review name" };
const nameKey = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function publicIdentity(value: string, website: boolean) {
  if (!value) return "";
  try {
    const url = new URL(/^https?:/i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (!host.includes(".")) return "";
    // A hosting/social platform alone is not an organization's identity.
    if (/^(facebook|instagram|linkedin|twitter|x|youtube|tiktok|sites\.google|linktr|wixsite|wordpress)\./.test(host) && !path) return "";
    return website ? `${host}${path}` : `${host === "twitter.com" ? "x.com" : host}${path}`;
  } catch {return "";}
}
function duplicateKeys(record: PersonalRecord): Map<string, string> {
    if (!["person","org"].includes(record.className) || Boolean(record.archivedAt)) return new Map();
    const profile = record.profile;
    const keys: [string,string][] = [];
    const normalizedName = nameKey(profile?.fullName || record.title);
    if (normalizedName.length > 2) keys.push([`name:${normalizedName}`,"Same name"]);
    const emails = [...(profile?.emails || []).map(entry => entry.address),profile?.primaryEmail,profile?.workEmail,profile?.universityEmail];
    emails.forEach(email => {const key=email?.trim().toLowerCase(); if (key?.includes("@")) keys.push([`email:${key}`,"Same email"]);});
    const phones = [...(profile?.phones || []).map(entry => normalizePhoneForStorage(entry.number,entry.countryCode)),normalizePhoneForStorage(profile?.phoneNumber || "",profile?.phoneCountryCode)];
    phones.forEach(phone => {if (phone.replace(/\D/g,"").length >= 7) keys.push([`phone:${phone}`,"Same phone"]);});
    for (const field of ["linkedin","instagram","x","tiktok","youtube"] as const) {const key=publicIdentity(profile?.[field] || "",false); if (key) keys.push([`social:${field}:${key}`,`Same ${field === "x" ? "X" : field} profile`]);}
    if (record.className === "org") {const key=publicIdentity(profile?.website || record.url || "",true); if (key) keys.push([`website:${key}`,"Same website"]);}
    return new Map(keys);
}
const sortMatches = (a: DuplicateMatch, b: DuplicateMatch) =>
  b.reasons.length - a.reasons.length || a.left.title.localeCompare(b.left.title);

/** A transaction/review-local index. Rebuild it when the source records change. */
export function createPeopleDuplicateIndex(records: readonly PersonalRecord[]) {
  const buckets = new Map<string, PersonalRecord[]>();
  function add(record: PersonalRecord) {
    for (const key of duplicateKeys(record).keys()) {
      const scoped = `${record.className}:${key}`;
      const bucket = buckets.get(scoped);
      if (bucket) bucket.push(record);
      else buckets.set(scoped, [record]);
    }
  }
  function find(record: PersonalRecord): DuplicateMatch[] {
    const matches = new Map<string, DuplicateMatch>();
    for (const [key, reason] of duplicateKeys(record)) {
      for (const previous of buckets.get(`${record.className}:${key}`) || []) {
        const match: DuplicateMatch = matches.get(previous.id) || {
          left: previous, right: record, reasons: [], confidence: "Review name",
        };
        if (!match.reasons.includes(reason)) match.reasons.push(reason);
        if (!key.startsWith("name:")) match.confidence = "Strong match";
        matches.set(previous.id, match);
      }
    }
    return [...matches.values()].sort(sortMatches);
  }
  records.forEach(add);
  return { add, find };
}

/** Review candidates only: no transitive merges and no mutation of the source records. */
export function findPeopleDuplicates(records: readonly PersonalRecord[]): DuplicateMatch[] {
  const buckets = new Map<string, {record:PersonalRecord; reason:string}[]>();
  const pairs = new Map<string, DuplicateMatch>();
  for (const record of records) {
    for (const [key,reason] of duplicateKeys(record)) {
      const scoped = `${record.className}:${key}`;
      for (const previous of buckets.get(scoped) || []) {
        const pairKey=[previous.record.id,record.id].sort().join(":");
        const match=pairs.get(pairKey) || {left:previous.record,right:record,reasons:[],confidence:"Review name" as const};
        if (!match.reasons.includes(reason)) match.reasons.push(reason);
        if (!key.startsWith("name:")) match.confidence="Strong match";
        pairs.set(pairKey,match);
      }
      buckets.set(scoped,[...(buckets.get(scoped) || []),{record,reason}]);
    }
  }
  return [...pairs.values()].sort(sortMatches);
}
