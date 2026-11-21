import { readProjectsState } from "../modules/projects/store";
import { readPlanningState } from "../modules/planning/store";
import { readTravelRecords } from "../modules/planning/travel-store";
import { effectiveEvent } from "../modules/planning/types";
import { readPersonalOpsState } from "../modules/personal-ops/store";
import { readReviewsState } from "../modules/reviews/store";
import { readFinanceState } from "../modules/finance/store";
import { readPersonalLifeState } from "../modules/personal-life/store";
import { readDogTrackerState } from "../modules/dog-tracker/store";
import { LEGACY_PET_ID, PET_PROFILE_FIELDS } from "../modules/dog-tracker/types";
import { readWellnessState } from "../modules/personal-wellness/store";
import { WELLNESS_SECTIONS, WELLNESS_CONFIG } from "../modules/personal-wellness/types";
import { getNativeObjectRoute } from "../native-objects/routes";
import type { ModuleId } from "../native-objects/types";
import type { WritingSource } from "./usage";

// Read on an explicit library request. Only marked, user-authored fields become results.
export async function readExtraWritingSources(unavailable: Set<string> = new Set()): Promise<WritingSource[]> {
  const read = <T,>(area:string, operation:Promise<T>) => operation.catch(() => { unavailable.add(area); return undefined; });
  const [projects, planning, personal, reviews, finance, life, pets, wellness, travel] = await Promise.all([
    read("Projects",readProjectsState()), read("Calendar and Map",readPlanningState()), read("Personal tasks",readPersonalOpsState()),
    read("Reviews",readReviewsState()), read("Finance",readFinanceState()),read("Personal",readPersonalLifeState()),
    read("Pets",readDogTrackerState()), Promise.all(WELLNESS_SECTIONS.map(section => read(section,readWellnessState(section)))), read("Travel",readTravelRecords())
  ]);
  const sources: WritingSource[] = [];
  function collect(area: string, href: string, row: { updatedAt?: string; archivedAt?: string }, title: string, fields: Record<string, string | undefined>) {
    if (row.archivedAt) return;
    for (const [field, text] of Object.entries(fields)) {
      if (text?.includes("](/admin/personal/settings?skill=")) sources.push({ key: href + ":" + field, area, href, field, title, text, updatedAt: row.updatedAt });
    }
  }
  const route = (module: ModuleId, objectType: string, objectId: string, containerObjectId?: string) => getNativeObjectRoute({ module, objectType, objectId, containerObjectId });
  const activeProjects = new Set(projects?.projects.filter(p => !p.archivedAt).map(p => p.id));
  for (const p of projects?.projects ?? []) collect("Projects", route("projects", "project", p.id), p, p.name, { Description: p.description });
  for (const m of projects?.milestones ?? []) if (activeProjects.has(m.projectId)) collect("Projects", route("projects","milestone",m.id,m.projectId), m, m.title, { Description: m.description, Completion: m.completionNote });
  for (const b of projects?.blockers ?? []) if (activeProjects.has(b.projectId)) collect("Projects", route("projects","blocker",b.id,b.projectId), b, b.title, { Condition: b.condition, Resolution: b.resolution });
  for (const update of projects?.timelineEvents ?? []) if (update.isManual && activeProjects.has(update.projectId)) collect("Projects", route("projects","timeline_event",update.id,update.projectId), update, update.title, { Summary: update.summary });
  for (const place of planning?.places ?? []) collect("Map", route("map","place",place.id), place, place.name, { Notes: place.notes });
  for (const place of travel ?? []) for (const [index,visit] of (place.visits ?? []).entries()) {
    collect("Map",route("map","travel_destination",place.id),place,place.name,{ ["Visit "+(index+1)]:visit.note });
  }
  for (const entry of planning?.events ?? []) {
    const event = effectiveEvent(entry);
    if (!event.source?.cancelled) collect("Calendar", route("calendar","event",event.id), event, event.title, { Description: event.description });
  }
  for (const task of planning?.taskPlans ?? []) if (!task.source) collect("Personal","/admin/personal?task="+encodeURIComponent(task.id), task, task.title ?? "Task", { Notes: task.description });
  for (const item of personal ? [...personal.goals,...personal.followUps,...personal.decisions,...personal.obligations,...personal.routines] : []) {
    collect("Personal",route("personal_ops",item.objectType,item.id),item,item.title,{
      Description: "description" in item ? item.description : item.summary,
      Question: "question" in item ? item.question : undefined, Decision: "finalDecision" in item ? item.finalDecision : undefined,
      Reasoning: "rationale" in item ? item.rationale : undefined, Context: "context" in item ? item.context : undefined,
      Outcome: "outcome" in item ? item.outcome : undefined, Completion: "completionNote" in item ? item.completionNote : undefined
    });
  }
  for (const run of reviews?.runs ?? []) collect("Reviews",route("reviews","review",run.id),run,run.title,run.summary);
  for (const transaction of finance?.transactions ?? []) collect("Finance",route("finance","transaction",transaction.id),transaction,transaction.merchant,{ Memo: transaction.memo });
  for (const rule of finance?.rules ?? []) collect("Finance",route("finance","finance_rule",rule.id),rule,rule.name,{ Description:rule.description });
  for (const list of life?.lists ?? []) collect("Personal",route("personal_ops","list",list.id),list,list.title,{ Description:list.description });
  for (const trip of life?.trips ?? []) collect("Personal",route("personal_ops","trip",trip.id),trip,trip.name,{ Notes:trip.notes });
  for (const item of life?.buildItems ?? []) collect("Personal",route("personal_ops","build_item",item.id),item,item.name,{ Notes:item.notes });
  for (const car of life?.vehicles ?? []) collect("Personal",route("personal_ops","vehicle",car.id),car,car.name,{ Notes:car.notes });
  for (const pet of pets?.pets ?? []) if (!pet.archived) {
    const fields = Object.fromEntries(PET_PROFILE_FIELDS.filter(f => "long" in f).map(f => [f.label,pet.fields[f.id]]));
    collect("Pets","/admin/personal/pets/"+encodeURIComponent(pet.id),pet,pet.name,fields);
  }
  for (const entry of pets?.events ?? []) if (!entry.archived && !pets?.pets?.find(p=>p.id === entry.petId)?.archived) {
    collect("Pets","/admin/personal/pets/"+encodeURIComponent(entry.petId || LEGACY_PET_ID)+"?entry="+encodeURIComponent(entry.id),entry,entry.title || entry.kind,{ Notes:entry.notes, Instructions:entry.instructions });
  }
  for (const [index,state] of wellness.entries()) {
    const section = WELLNESS_SECTIONS[index], config = WELLNESS_CONFIG[section];
    for (const entry of state?.entries ?? []) if (!entry.archived) {
      const fields = config.kinds.find(kind => kind.id === entry.kind)?.fields.filter(field => field.type === "textarea") ?? [];
      collect(config.title,"/admin/personal/"+section+"?entry="+encodeURIComponent(entry.id),entry,entry.title,{
        Notes:entry.notes,...Object.fromEntries(fields.map(field => [field.label,entry.fields[field.id]]))
      });
    }
  }
  return sources;
}
