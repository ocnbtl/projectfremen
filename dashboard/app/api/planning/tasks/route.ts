import { taskMatchesPerson } from "../../../../lib/modules/planning/task-model";
import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { changeTask, readTasks } from "../../../../lib/modules/planning/task-store";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});
export async function GET(request:Request){
  if(!await hasAdminSession())return json({ok:false,error:"Unauthorized"},401);
  try{const result=await readTasks(new URL(request.url).searchParams.get("zone")||"America/New_York");const person=new URL(request.url).searchParams.get("person");const items=person?result.items.filter(item=>taskMatchesPerson(item,person)):result.items;return json({ok:true,items,calendars:result.state.calendars,events:result.state.events.filter(event=>items.some(item=>item.source?.family==="events"&&item.source.id===event.id))});}catch{return json({ok:false,error:"Tasks could not be loaded. Your records are unchanged."},503);}
}
export async function POST(request:Request){
  if(!await hasAdminSession())return json({ok:false,error:"Unauthorized"},401);
  if(!isCsrfRequestValid(request))return json({ok:false,error:"Invalid CSRF token"},403);
  try{const raw=await request.text();if(Buffer.byteLength(raw)>50000)throw new Error("Task request is too large");const body=JSON.parse(raw);const item=await changeTask(body);await appendAuditEvent({action:"planning.task."+body.operation,at:new Date().toISOString(),path:"/api/planning/tasks",method:"POST",ip:getRequestIp(request),status:"ok"});return json({ok:true,item});}
  catch(error){return json({ok:false,error:error instanceof Error?error.message:"Task could not be saved"},Number((error as {status?:number}).status)||400);}
}
