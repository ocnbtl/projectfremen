import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import { eventOccurrences } from "../../../../lib/modules/planning/calendar-model";
import { readProjectsState } from "../../../../lib/modules/projects/store";
import { readPersonalRecords } from "../../../../lib/personal-records-store";
import { readPersonalOpsState } from "../../../../lib/modules/personal-ops/store";
import { readFinanceState } from "../../../../lib/modules/finance/store";
import { reviewPeriod, type ReviewPeriodGroup } from "../../../../lib/modules/reviews/period-context";
const json = (value: unknown, status=200) => NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});
export async function GET(request: Request) {
  if (!(await hasAdminSession())) return json({error:"Unauthorized"},401);
  const params = new URL(request.url).searchParams;
  let period;
  const zone = params.get("zone") || "UTC";
  try { period = reviewPeriod(params.get("start") || "",params.get("end") || ""); new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(); }
  catch(error) { return json({error:error instanceof Error ? error.message : "Invalid review period"},400); }
  const configs = [
    {id:"calendar",label:"Calendar",icon:"module-calendar",href:`/admin/calendar?date=${period.start}`,description:"Scheduled events in this period"},
    {id:"people",label:"People",icon:"module-people",href:"/admin/people?view=interactions",description:"Recorded interactions in this period"},
    {id:"projects",label:"Projects",icon:"module-projects",href:"/admin/projects",description:"Projects updated in this period"},
    {id:"finance",label:"Finance",icon:"module-finance",href:"/admin/finance/transactions",description:"Recorded transactions in this period"},
    {id:"personal",label:"Personal",icon:"module-personal",href:"/admin/personal",description:"Goals, routines, decisions, and follow-ups updated in this period"}
  ];
  const results = await Promise.allSettled([
    readPlanningState().then(state => eventOccurrences(state.events, period.start, period.nextDay, zone).map(item => ({label:item.title,detail:item.start.slice(0,10)}))),
    readPersonalRecords().then(records => records.filter(item => !item.archivedAt && item.interaction && period.includes(item.interaction.occurredOn)).map(item => ({label:item.title,detail:item.interaction!.occurredOn}))),
    readProjectsState().then(state => state.projects.filter(item => item.lifecycle !== "archived" && period.includes(item.updatedAt)).map(item => ({label:item.name,detail:item.health === "blocked" ? "Blocked" : item.lifecycle.replaceAll("_"," ")}))),
    readFinanceState().then(state => state.transactions.filter(item => !item.archivedAt && period.includes(item.occurredOn)).map(item => ({label:item.merchant || item.category,detail:`${new Intl.NumberFormat("en-US",{style:"currency",currency:item.currency}).format(item.amount)} · ${item.direction}`}))),
    readPersonalOpsState().then(state => [...state.goals,...state.decisions,...state.followUps,...state.routines].filter(item => item.lifecycle !== "archived" && period.includes(item.updatedAt)).map(item => ({label:item.title,detail:item.objectType.replaceAll("_"," ")+" · "+item.lifecycle})))
  ]);
  const groups: ReviewPeriodGroup[] = results.map((result,index) => result.status === "fulfilled" ? {...configs[index],count:result.value.length,items:result.value.slice(0,4)} : {...configs[index],count:0,items:[],unavailable:true});
  return json({start:period.start,end:period.end,loadedAt:new Date().toISOString(),groups});
}
