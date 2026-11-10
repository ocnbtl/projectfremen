import { createHash } from "node:crypto";
import { readJsonFile, mutateJsonFile } from "../../file-store";
import { ENTITY_HUBS } from "../../entity-hub";
import { normalizeGoalItems, type EntityGoalItem } from "../../entity-goals";
import type { TaskItem, TaskPlan } from "./task-model";
type State={goalsBySlug:Record<string,EntityGoalItem[]>};
const file="entity-goals.json",empty:State={goalsBySlug:{}};
const revision=(goals:EntityGoalItem[])=>createHash("sha256").update(JSON.stringify(goals)).digest("hex");
export async function legacyGoalTasks(plans:TaskPlan[],zone:string):Promise<TaskItem[]>{
  const state=await readJsonFile<State>(file,empty);
  return ENTITY_HUBS.flatMap(hub=>{
    const goals=normalizeGoalItems(state.goalsBySlug[hub.slug]?.length?state.goalsBySlug[hub.slug]:hub.defaultGoals);
    return goals.flatMap((goal,index)=>{
      if(goal.status==="cancelled")return [];
      const identity=createHash("sha256").update(goal.text).digest("hex").slice(0,20)+":"+goals.slice(0,index).filter(g=>g.text===goal.text).length;
      const id=`legacyGoals:${hub.slug}:${identity}`,plan=plans.find(p=>p.id===id);
      return [{id,source:{family:"legacyGoals" as const,id:`${hub.slug}:${identity}`},kind:"goal" as const,start:"",end:"",allDay:true,timeZone:zone,recurrence:"",calendarIds:[],exceptions:{},createdAt:"",updatedAt:"",...plan,title:goal.text,description:hub.entity,completed:goal.done,sourceUpdatedAt:revision(goals),ownerRef:{module:"projects" as const,objectType:"entity",objectId:hub.slug,label:hub.entity,route:`/admin/entities/${hub.slug}`}}];
    });
  });
}
export async function completeLegacyGoal(item:TaskItem,completed:boolean){
  const [slug,hash,ordinal]=item.source!.id.split(":"),hub=ENTITY_HUBS.find(h=>h.slug===slug);
  if(!hub)throw new Error("This goal is no longer available.");
  return mutateJsonFile<State,EntityGoalItem>(file,empty,state=>{
    const goals=normalizeGoalItems(state.goalsBySlug[slug]?.length?state.goalsBySlug[slug]:hub.defaultGoals);
    const index=goals.map((goal,index)=>({goal,index})).filter(({goal})=>createHash("sha256").update(goal.text).digest("hex").slice(0,20)===hash)[Number(ordinal)]?.index ?? -1;
    if(revision(goals)!==item.sourceUpdatedAt||!goals[index])throw Object.assign(new Error("This goal changed elsewhere. Reload before saving."),{status:409});
    const next=goals.map((goal,i)=>i===index?{...goal,done:completed}:goal);
    return {value:{...state,goalsBySlug:{...state.goalsBySlug,[slug]:next}},result:next[index]};
  });
}
