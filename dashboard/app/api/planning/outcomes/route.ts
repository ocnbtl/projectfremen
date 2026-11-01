import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { completeEventOutcome, outcomeId, outcomeSource } from "../../../../lib/modules/planning/event-outcomes";
import { readPlanningState } from "../../../../lib/modules/planning/store";
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request){
 if(!await hasAdminSession())return json({ok:false,error:"Unauthorized"},401);
 try{const params=new URL(request.url).searchParams,source=outcomeSource(Object.fromEntries(params));const state=await readPlanningState();const receipt=state.outcomeReceipts?.find(r=>r.id===outcomeId(source,state));return json({ok:true,receipt:receipt||null});}catch{return json({ok:false,error:"Completion details could not be loaded"},400);}
}
export async function POST(request:Request){
 if(!await hasAdminSession())return json({ok:false,error:"Unauthorized"},401);
 if(!isCsrfRequestValid(request))return json({ok:false,error:"Invalid CSRF token"},403);
 try{const raw=await request.text();if(Buffer.byteLength(raw)>50000)throw new Error("Completion details are too large");const body=JSON.parse(raw);return json({ok:true,receipt:await completeEventOutcome(body.source,body.input)});}catch(error){return json({ok:false,error:error instanceof Error?error.message:"Completion could not be saved. Retry to resume safely."},(error as {status?:number}).status||400);}
}
