import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";

export type RecordSummary = {key:string; kind:string; title:string; audience:"private"|"workspace"; mine:boolean};
export type WorkspaceRecord = RecordSummary & {body:string; revision:number; links:Pick<RecordSummary,"key"|"title"|"kind">[];files:{id:string;name:string}[]};
export type WorkspaceIndex = {role:"owner"|"editor"|"viewer"; records:RecordSummary[]; defaultAudience:"private"|"workspace"; allowSensitive:boolean};
export type RecordGrant = {id:string;key:string;title:string|null;recipient:string;expires:string;revoked:string|null};
export const recordsEndpoint = (id:string) => "/api/workspaces/"+encodeURIComponent(id)+"/records";
export async function recordRequest<T>(workspace:string, action:string, args:Record<string,unknown>={}, write=false):Promise<T>{
  const url=recordsEndpoint(workspace);
  const response=await fetch(write ? url : url+"?"+new URLSearchParams({action,...Object.fromEntries(Object.entries(args).map(([k,v])=>[k,String(v)]))}), {
    method:write?"POST":"GET",cache:"no-store",
    ...(write ? {headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({...args,action})} : {})
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || "Couldn't open this workspace.");
  return data;
}
