import {NextResponse} from "next/server";
import {hasAdminSession} from "../../../../lib/admin-session";
import {isCsrfRequestValid} from "../../../../lib/csrf";
import {readMediaFileRecords, updatePersonalRecord, type PersonalRecordPatch} from "../../../../lib/personal-records-store";
import {mediaRecordDetails} from "../../../../lib/modules/media/shared-details";

export const dynamic = "force-dynamic";
const json = (body:unknown,status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});

// Batch reads keep a large canvas to a single catalogue lookup and omit file data.
export async function POST(request:Request) {
  if (!await hasAdminSession()) return json({error:"Sign in to see Media details."},401);
  if (!isCsrfRequestValid(request)) return json({error:"Refresh this page before trying again."},403);
  const body = await request.json().catch(()=>null);
  if (!Array.isArray(body?.ids) || body.ids.length>1000 || body.ids.some((id:unknown)=>typeof id!=="string" || id.length>350)) return json({error:"Choose valid Media files."},400);
  try {
    const ids = new Set(body.ids);
    return json({items:(await readMediaFileRecords()).filter(row=>ids.has(row.id)).map(mediaRecordDetails)});
  } catch {
    return json({error:"Media details could not be loaded."},503);
  }
}

export async function PATCH(request:Request) {
  if (!await hasAdminSession()) return json({error:"Sign in to edit Media details."},401);
  if (!isCsrfRequestValid(request)) return json({error:"Refresh this page before trying again."},403);
  const body=await request.json().catch(()=>null);
  if(typeof body?.id!=="string" || typeof body.expectedUpdatedAt!=="string" || !body.expectedUpdatedAt || !body.patch || typeof body.patch!=="object") return json({error:"Reopen this file before saving."},400);
  const patch:PersonalRecordPatch={};
  for(const [key,value] of Object.entries(body.patch)) {
    if(typeof value!=="string" || !["title","body","notes"].includes(key) || value.length>(key==="title"?240:20000) || (key==="title"&&!value.trim())) return json({error:"Check the Media details."},400);
    if(key==="title") patch.title=value;
    if(key==="body") patch.body=value;
    if(key==="notes") patch.mediaNotes=value;
  }
  if(!Object.keys(patch).length) return json({error:"Choose a field to update."},400);
  try {
    const record=(await readMediaFileRecords()).find(row=>row.id===body.id);
    if(!record) return json({error:"This Media file is unavailable."},404);
    if(record.updatedAt!==body.expectedUpdatedAt) return json({error:"Media changed. Review the latest details before saving.",current:mediaRecordDetails(record)},409);
    const updated=(await updatePersonalRecord(record.id,patch,{expectedUpdatedAt:record.updatedAt,markMediaCaptionEdited:patch.body!==undefined})).find(row=>row.id===record.id)!;
    return json({item:mediaRecordDetails(updated)});
  } catch(error) {
    const message=error instanceof Error ? error.message : "Media details could not be saved.";
    return json({error:message},message.includes("changed after")?409:400);
  }
}
