import {readFile} from "node:fs/promises";
import {gunzip} from "node:zlib";
import {promisify} from "node:util";
import path from "node:path";
import type {FeatureCollection} from "geojson";
import {MAP_CATALOG} from "./map-catalog";
import type {MapData} from "./map-analysis";
type Table=Record<string,Record<string,[number|null,number|null]>>;
const unzip=promisify(gunzip),cache=new Map<string,Promise<Table>>();
export async function acsIndicators(metric:string,level:string,state:string,geometry:FeatureCollection|null):Promise<MapData>{
 if(!metric.startsWith('us-')||!Object.hasOwn(MAP_CATALOG,metric)||!['state','county','place','tract'].includes(level)||level!=='state'&&!/^\d{2}$/.test(state))throw Error('Choose a supported U.S. region and layer.');
 const key=`${level==='state'?'states':state}-${level}`;
 let pending=cache.get(key);if(!pending){if(cache.size>=12)cache.delete(cache.keys().next().value!);pending=readFile(path.join(process.cwd(),'data/map/acs-indicators',key+'.json.gz')).then(unzip).then(b=>JSON.parse(b.toString()) as Table).catch(()=>{cache.delete(key);throw Error('No published ACS data for this region.');});cache.set(key,pending);}
 const values=(await pending)[metric],names=new Map(geometry?.features.map(f=>[String(f.properties?.GEOID),String(f.properties?.NAME)]));
 return {rows:Object.entries(values).map(([id,[value,uncertainty]])=>({id,name:names.get(id)||`Census area ${id}`,value,uncertainty,year:'2020–2024'})),source:'U.S. Census ACS 5-year summary file',sourceUrl:'https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html',period:'2020–2024',unit:MAP_CATALOG[metric].unit,geography:level,geometry,geometryNote:'Published 2020–2024 five-year estimates and 90% margins of error; suppressed or unavailable estimates remain no data. Dollar amounts use 2024 dollars. Boundaries are TIGERweb ACS2024; unmatched areas remain in the table under their Census GEOIDs.'};
}
