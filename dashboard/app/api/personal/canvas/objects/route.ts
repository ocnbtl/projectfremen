import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { isModuleId } from "../../../../../lib/native-objects/types";
import { canvasObjectCatalog, reusableCanvasFiles } from "../../../../../lib/modules/canvas/object-catalog";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control":"private, no-store", Vary:"Cookie" };
const json = (body:unknown,status=200) => NextResponse.json(body,{status,headers});
export async function GET(request:Request) {
  if (!await hasAdminSession()) return json({error:"Sign in to open your objects."},401);
  const params = new URL(request.url).searchParams;
  try {
    if (params.get("files") === "1") return json({files:await reusableCanvasFiles()});
    const module = params.get("module") || "";
    if (!isModuleId(module)) return json({error:"Choose a module."},400);
    return json({items:await canvasObjectCatalog(module)});
  } catch {
    return json({error:"Couldn’t load these objects. Try again."},503);
  }
}
