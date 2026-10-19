import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { areaFlagImage } from "../../../../lib/modules/planning/area-flag-provider";
export const runtime="nodejs";
export async function GET(request:Request){
  const headers={"Cache-Control":"private, max-age=86400",Vary:"Cookie","X-Content-Type-Options":"nosniff"};
  if(!await hasAdminSession())return NextResponse.json({error:"Unauthorized"},{status:401,headers:{...headers,"Cache-Control":"no-store"}});
  const p=new URL(request.url).searchParams,name=p.get("name")||"",country=p.get("country")||"",kind=p.get("kind")||undefined;
  const lat=p.has("lat")?Number(p.get("lat")):undefined,lon=p.has("lon")?Number(p.get("lon")):undefined;
  if(!/^[A-Z]{2}$/.test(country)||!name.trim()||name.length>120||(kind&&!['country','state','city'].includes(kind))||(lat!==undefined&&(!Number.isFinite(lat)||Math.abs(lat)>90))||(lon!==undefined&&(!Number.isFinite(lon)||Math.abs(lon)>180)))return new NextResponse(null,{status:400});
  try{const image=await areaFlagImage(name,country,kind,lat,lon);return image?new NextResponse(new Uint8Array(image),{headers:{...headers,"Content-Type":"image/png"}}):new NextResponse(null,{status:404,headers});}
  catch{return new NextResponse(null,{status:503,headers:{...headers,"Cache-Control":"no-store"}});}
}
