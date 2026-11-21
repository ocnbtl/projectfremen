import { hasAdminSession } from "../../../../lib/admin-session";
import { canvasObjectCatalog } from "../../../../lib/modules/canvas/object-catalog";
import { listBoardSummaries } from "../../../../lib/modules/canvas/store";
import { readDogTrackerState } from "../../../../lib/modules/dog-tracker/store";
import { readWellnessState } from "../../../../lib/modules/personal-wellness/store";
import { WELLNESS_SECTIONS } from "../../../../lib/modules/personal-wellness/types";
import { readTravelRecords } from "../../../../lib/modules/planning/travel-store";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import { readProjectsState } from "../../../../lib/modules/projects/store";
import { NATIVE_MODULES, type NativeObjectRef } from "../../../../lib/native-objects/types";
import { readPersonalRecords } from "../../../../lib/personal-records-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control":"private, no-store", Vary:"Cookie" };
export async function GET() {
  if (!await hasAdminSession()) return Response.json({error:"Sign in to search workspace objects."},{status:401, headers});
  const reads = {records:readPersonalRecords(), projects:readProjectsState(), planning:readPlanningState()};
  const boards = listBoardSummaries().then(rows => rows.map((board): NativeObjectRef => ({
    module:"personal_ops", objectType:"canvas_board", objectId:board.id, label:board.title,
    route:"/admin/personal/canvas?board=" + encodeURIComponent(board.id)
  })));
  const pets = readDogTrackerState().then(state => (state.pets ?? []).filter(pet => !pet.archived).map((pet): NativeObjectRef => ({
    module:"personal_ops", objectType:"pet", objectId:pet.id, label:pet.name, route:"/admin/personal/pets/"+encodeURIComponent(pet.id)
  })));
  const wellness = WELLNESS_SECTIONS.map(async section => (await readWellnessState(section)).entries.filter(entry => !entry.archived).map((entry): NativeObjectRef => ({
    module:"personal_ops", objectType:entry.kind, objectId:entry.id, label:entry.title, route:"/admin/personal/"+section+"?entry="+encodeURIComponent(entry.id)
  })));
  const travel = readTravelRecords().then(records => records.filter(r => r.statuses.length || r.visits?.length).map((r): NativeObjectRef => ({
    module:"map", objectType:"travel_destination", objectId:r.id, label:r.name, route:"/admin/map?travel="+encodeURIComponent(r.id)
  })));
  const catalogs = await Promise.allSettled([...NATIVE_MODULES.map(module => canvasObjectCatalog(module,reads)), boards, pets, travel, ...wellness]);
  return Response.json({items:catalogs.flatMap(result => result.status === "fulfilled" ? result.value : []),
    incomplete:catalogs.some(result => result.status === "rejected")},{headers});
}
