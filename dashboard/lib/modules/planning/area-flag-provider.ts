import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import entities from "./travel-country-entities.json";
import { fixedAreaFlag } from "./area-flags";

export function areaFlagQuery(name:string,country:string,latitude?:number,longitude?:number) {
  const entity=(entities as Record<string,string>)[country];
  if(!/^Q\d+$/.test(entity||"")||!name.trim()||name.length>120)throw new Error("Invalid area");
  const coordinates=Number.isFinite(latitude)&&Number.isFinite(longitude);
  if(coordinates&&(Math.abs(latitude!)>90||Math.abs(longitude!)>180))throw new Error("Invalid coordinates");
  return `SELECT DISTINCT ?item ?flag WHERE { hint:Query hint:optimizer "None". ?item rdfs:label ${JSON.stringify(name.trim())}@en; wdt:P17 wd:${entity}; wdt:P41 ?flag. { ?item wdt:P31/wdt:P279* wd:Q486972 } UNION { ?item wdt:P31/wdt:P279* wd:Q56061 } ${coordinates?`?item wdt:P625 ?coord. FILTER(geof:distance(?coord, "Point(${longitude} ${latitude})"^^geo:wktLiteral)<30)` : ""} } LIMIT 3`;
}
export function uniqueFlagFile(rows: {item?:{value?:string};flag?:{value?:string}}[]) {
  const valid=rows.filter(row=>/^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(row.item?.value||""));
  if(new Set(valid.map(row=>row.item!.value)).size!==1)return undefined;
  const flags=[...new Set(valid.map(row=>row.flag?.value))];
  if(flags.length!==1||!flags[0])return undefined;
  const url=new URL(flags[0]);
  if(url.hostname!=="commons.wikimedia.org"||!url.pathname.startsWith("/wiki/Special:FilePath/"))return undefined;
  const file=decodeURIComponent(url.pathname.slice("/wiki/Special:FilePath/".length)).replace(/ /g,"_");
  return /^[^/\\<>\x00-\x1f]+\.(svg|png|jpg|jpeg)$/i.test(file)?file:undefined;
}
export async function areaFlagImage(name:string,country:string,kind?:string,latitude?:number,longitude?:number) {
  const fixed=fixedAreaFlag(name,country,kind);
  let buffer:Buffer;
  if(fixed?.kind==="state")buffer=await readFile(path.join(process.cwd(),"public","map-flags",`${fixed.code}.png`));
  else if(fixed?.kind==="country"){
    const sprite=await readFile(path.join(process.cwd(),"public","country-flags.svg"),"utf8");
    const symbol=sprite.match(new RegExp(`<symbol id="flag-${fixed.code}"[^>]*>([\\s\\S]*?)</symbol>`));
    buffer=symbol?Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="513" height="342" viewBox="0 0 513 342">${symbol[1]}</svg>`):await readFile(path.join(process.cwd(),"public","address-flags",`${fixed.code}.svg`));
  }else{
    const query=areaFlagQuery(name,country,latitude,longitude);
    const response=await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,{headers:{Accept:"application/sparql-results+json","User-Agent":"Unigentamos/1.0 (https://unigentamos.com)"},signal:AbortSignal.timeout(15000),next:{revalidate:604800}});
    if(!response.ok)throw new Error("Flag lookup unavailable");
    const data=await response.json();const file=uniqueFlagFile(data.results?.bindings||[]);if(!file)return undefined;
    const hash=createHash("md5").update(file).digest("hex");
    const base=`https://upload.wikimedia.org/wikipedia/commons`;
    const key=`${hash[0]}/${hash.slice(0,2)}/${encodeURIComponent(file)}`;
    const options={redirect:"error" as const,signal:AbortSignal.timeout(10000),next:{revalidate:604800},headers:{"User-Agent":"Unigentamos/1.0 (https://unigentamos.com)"}};
    let image=await fetch(`${base}/thumb/${key}/250px-${encodeURIComponent(file)}${/\.svg$/i.test(file)?".png":""}`,options);
    if(!image.ok)image=await fetch(`${base}/${key}`,{...options,signal:AbortSignal.timeout(10000)});
    if(!image.ok||Number(image.headers.get("content-length"))>2000000)throw new Error("Flag image unavailable");
    const reader=image.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw new Error("Flag image too large");}chunks.push(value);}}finally{reader.releaseLock();}
    buffer=Buffer.concat(chunks);
  }
  return sharp(buffer,{limitInputPixels:16000000}).resize({width:192,height:128,fit:"inside",withoutEnlargement:true}).png().toBuffer();
}
