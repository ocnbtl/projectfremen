import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import { readTravelRecords, saveTravelRecord } from "../../../../lib/modules/planning/travel-store";
export const runtime="nodejs";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});
export async function GET(){if(!await hasAdminSession())return json({error:"Unauthorized"},401);return json({records:await readTravelRecords()});}
export async function PUT(request:Request){
  if(!await hasAdminSession())return json({error:"Unauthorized"},401);
  if(!isCsrfRequestValid(request))return json({error:"Invalid CSRF token"},403);
  try{
    const raw=await request.text();if(raw.length>6000)throw new Error("Travel update is too large");
    const body=JSON.parse(raw);const record=await saveTravelRecord(body.record,body.expectedUpdatedAt);
    await appendAuditEvent({at:new Date().toISOString(),action:"map.travel.update",path:"/api/map/travel",method:"PUT",ip:getRequestIp(request),status:"ok",detail:record.id});
    return json({record});
  }catch(e){const error=e instanceof Error?e.message:"Could not save travel status";return json({error},error.startsWith("This record changed")?409:400);}
}
