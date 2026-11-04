import type { PersonalRecord } from "../../personal-records-store";
import type { ObjectLink } from "../../native-objects/links";
export type FinanceOrganization={id:string;title:string;photoUrl?:string;photoUpdatedAt?:string;website?:string};
export type FinanceMerchantsData={organizations:FinanceOrganization[];links:ObjectLink[]};
// Official standalone marks for the named merchants. This presentation override
// leaves the canonical organization picture and its crop untouched.
export function financeMerchantMark(organization?: FinanceOrganization) {
  if (!organization?.website) return undefined;
  try {
    const host = new URL(organization.website).hostname.toLowerCase().replace(/^www\./, "");
    return ({ "about.google": "google.png", "google.com": "google.png", "retellai.com": "retell.svg", "vercel.com": "vercel.svg", "discord.com": "discord.svg" } as Record<string,string>)[host];
  } catch { return undefined; }
}
export function financeOrganization(record:PersonalRecord):FinanceOrganization{return {id:record.id,title:record.title,photoUrl:record.profile?.photoUrl,photoUpdatedAt:record.profile?.photoUpdatedAt,website:record.profile?.website};}
export function financeMerchantLinks(links:ObjectLink[]){return links.filter(link=>link.status==="active"&&link.source.module==="finance"&&["transaction","bill"].includes(link.source.objectType)&&link.target.module==="people"&&link.target.objectType==="organization"&&link.relationship==="merchant");}
