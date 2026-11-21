import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { CanvasError } from "../../../../../lib/modules/canvas/model";
import { boardPlacements } from "../../../../../lib/modules/canvas/placements";
import { isBoardSourceModule } from "../../../../../lib/modules/canvas/source-reference";

export const dynamic = "force-dynamic";
const json = (body:unknown,status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});

export async function GET(request:Request) {
  if (!await hasAdminSession()) return json({error:"Sign in to view board links."},401);
  const params = new URL(request.url).searchParams;
  const module = params.get("module") ?? "";
  if (!isBoardSourceModule(module)) return json({error:"Choose a supported source object."},400);
  try {
    return json(await boardPlacements(module,params.getAll("id"),params.get("after")));
  } catch (error) {
    if (error instanceof CanvasError) return json({error:error.message},error.status);
    return json({error:"Board links could not be loaded."},503);
  }
}
