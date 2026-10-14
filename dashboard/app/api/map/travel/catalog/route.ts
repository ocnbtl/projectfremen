import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { travelCatalog } from "../../../../../lib/modules/planning/travel-catalog";
import type { TravelKind } from "../../../../../lib/modules/planning/travel";
export const runtime="nodejs";
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store",Vary:"Cookie"};
  if(!await hasAdminSession())return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  const p=new URL(request.url).searchParams;
  const page=Number(p.get("page")||0);
  if(!Number.isInteger(page)||page<0||page>99)return NextResponse.json({error:"Invalid catalogue page"},{status:400,headers});
  try { return NextResponse.json(await travelCatalog(p.get("kind") as TravelKind,p.get("country")||"US",p.get("q")||"",page),{headers}); }
  catch(e){return NextResponse.json({error:e instanceof Error && e.name!=="TimeoutError"?e.message:"The catalogue is taking longer than usual. Try again or add a destination by name."},{status:503,headers});}
}
