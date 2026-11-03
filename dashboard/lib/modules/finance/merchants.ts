import type { PersonalRecord } from "../../personal-records-store";
import type { ObjectLink } from "../../native-objects/links";
export type FinanceOrganization={id:string;title:string;photoUrl?:string;photoUpdatedAt?:string;website?:string};
export type FinanceMerchantsData={organizations:FinanceOrganization[];links:ObjectLink[]};
export function financeOrganization(record:PersonalRecord):FinanceOrganization{return {id:record.id,title:record.title,photoUrl:record.profile?.photoUrl,photoUpdatedAt:record.profile?.photoUpdatedAt,website:record.profile?.website};}
export function financeMerchantLinks(links:ObjectLink[]){return links.filter(link=>link.status==="active"&&link.source.module==="finance"&&["transaction","bill"].includes(link.source.objectType)&&link.target.module==="people"&&link.target.objectType==="organization"&&link.relationship==="merchant");}
