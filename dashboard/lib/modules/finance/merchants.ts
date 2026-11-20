import type { PersonalRecord } from "../../personal-records-store";
import type { ObjectLink } from "../../native-objects/links";
export type FinanceOrganization={id:string;title:string;photoUrl?:string;photoUpdatedAt?:string;website?:string};
export type FinanceMerchantsData={organizations:FinanceOrganization[];links:ObjectLink[]};
// Official standalone marks for the named merchants. This presentation override
// leaves the canonical organization picture and its crop untouched.
const merchantMarks = new Map([
  ["7brew.com", "7-brew.png"],
  ["about.google", "google.png"],
  ["allstate.com", "allstate.svg"],
  ["canva.com", "canva.svg"],
  ["coinbase.com", "coinbase.png"],
  ["kroger.com", "kroger.png"],
  ["thekrogerco.com", "kroger.png"],
  ["ohiosos.gov", "ohio-secretary.png"],
  ["sos.state.oh.us", "ohio-secretary.png"],
  ["discord.com", "discord.svg"],
  ["google.com", "google.png"],
  ["jimmyjohns.com", "jimmy-johns.png"],
  ["retellai.com", "retell.svg"],
  ["vercel.com", "vercel.svg"],
]);

const namedMarks: [RegExp, string][] = [
  [/^google(?: llc| one| workspace| cloud| storage| services| play)?$/, "google.png"],
  [/^google\s*\*\s*(?:one|workspace|storage|cloud|google one|youtube)(?:\b.*)?$/, "google.png"],
  [/^(?:ohio (?:secretary|sec) (?:of )?state|oh sos)(?:\s+(?:online|filing|fees?))?$/, "ohio-secretary.png"],
  [/^kroger(?: co| company| store)?(?:\s*#?\s*\d+(?:\b.*)?)?$/, "kroger.png"],
  [/^coinbase(?: inc| com| pro| one)?$/, "coinbase.png"],
];

export function financeMerchantMark(organization?: FinanceOrganization, merchant = "") {
  if (organization?.website) {
    try {
      const url = organization.website.trim();
      const host = new URL(url.includes("://") ? url : "https://" + url).hostname.toLowerCase();
      for (const [domain, mark] of merchantMarks) {
        if (host === domain || host.endsWith("." + domain)) return mark;
      }
    } catch { /* A saved organization can still be identified by its name. */ }
  }
  const label = (organization?.title || merchant).toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  return namedMarks.find(([pattern]) => pattern.test(label))?.[1];
}
export function financeOrganization(record:PersonalRecord):FinanceOrganization{return {id:record.id,title:record.title,photoUrl:record.profile?.photoUrl,photoUpdatedAt:record.profile?.photoUpdatedAt,website:record.profile?.website};}
export function financeMerchantLinks(links:ObjectLink[]){return links.filter(link=>link.status==="active"&&link.source.module==="finance"&&["transaction","bill"].includes(link.source.objectType)&&link.target.module==="people"&&link.target.objectType==="organization"&&link.relationship==="merchant");}
