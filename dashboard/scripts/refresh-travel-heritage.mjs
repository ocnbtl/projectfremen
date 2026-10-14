// Public factual catalogue only: names, country codes and representative coordinates.
// No descriptions, photos, or user travel records are copied.
import { writeFile } from "node:fs/promises";
const source="https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/json";
const response=await fetch(source,{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`UNESCO catalogue returned ${response.status}`);
const data=await response.json();
if(!Array.isArray(data)||data.length<1000)throw new Error("Unexpected UNESCO catalogue; existing snapshot was preserved");
const items=data.flatMap(record=>{
  const codes=(record.iso_codes||"").split(/[,; ]+/).filter(code=>/^[A-Z]{2}$/.test(code));
  if(!/^\d+$/.test(record.id_no)||typeof record.name_en!=="string")return [];
  return codes.map(country=>({id:`landmark:unesco:${record.id_no}-${country}`,kind:"landmark",country,name:record.name_en.replace(/<[^>]*>/g,"").slice(0,240),description:"UNESCO World Heritage",source:`https://whc.unesco.org/en/list/${record.id_no}/`,...(codes.length===1&&Number.isFinite(record.coordinates?.lat)&&Number.isFinite(record.coordinates?.lon)?{latitude:record.coordinates.lat,longitude:record.coordinates.lon}:{})}));
});
await writeFile(new URL("../lib/modules/planning/travel-heritage.json",import.meta.url),JSON.stringify({source:"https://data.unesco.org/explore/dataset/whc001/",retrievedAt:new Date().toISOString(),items},null,2)+"\n");
console.log(`${items.length} entries across ${new Set(items.map(item=>item.country)).size} countries and territories`);
