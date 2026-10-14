import heritage from "./travel-heritage.json";
import entities from "./travel-country-entities.json";
import { travelCountries, type TravelDestination, type TravelKind } from "./travel";

// Country identifiers: Wikidata P297 (ISO 3166-1 alpha-2), retrieved 2026-10-13, CC0.
// Curated type boundaries, live catalogue: national parks; attractions/monuments/heritage; cities/towns.
export function travelCatalogQuery(kind: TravelKind, country: string, search: string, page: number) {
  const entity=(entities as Record<string,string>)[country];
  if (!entity || !/^Q\d+$/.test(entity) || !travelCountries.some(c=>c.code===country)) throw new Error("No catalogue is available for this country yet. You can add a destination by name.");
  if(kind!=="park")throw new Error("Choose national parks");
  const needle=JSON.stringify(search.trim().slice(0,80).toLowerCase());
  return `SELECT DISTINCT ?item ?itemLabel ?coord WHERE { hint:Query hint:optimizer "None". ?type wdt:P279* wd:Q46169. ?item wdt:P31 ?type; wdt:P17 wd:${entity}; wdt:P625 ?coord; rdfs:label ?itemLabel. FILTER(LANG(?itemLabel)="en") ${search.trim()?`FILTER(CONTAINS(LCASE(?itemLabel), ${needle}))`:""} } ORDER BY ?itemLabel ?item LIMIT 101 OFFSET ${page*100}`;
}
export async function travelCatalog(kind:TravelKind,country:string,search:string,page:number) {
  if(!travelCountries.some(c=>c.code===country))throw new Error("Choose a country");
  if(kind==="city")return searchTravelPlaces(country,search,"city");
  if(kind==="landmark"){
    const saved=heritage.items.filter(d=>d.country===country&&d.name.toLowerCase().includes(search.trim().toLowerCase())) as TravelDestination[];
    if(search.trim().length>=3){
      const found=await searchTravelPlaces(country,search,"landmark").catch(e=>{if(saved.length)return {items:[] as TravelDestination[],hasMore:false};throw e});
      return {items:[...new Map([...found.items,...saved].map(d=>[d.id,d])).values()],hasMore:false};
    }
    const sorted=saved.sort((a,b)=>a.name.localeCompare(b.name));return {items:sorted.slice(page*100,page*100+100),hasMore:sorted.length>(page+1)*100};
  }
  const query=travelCatalogQuery(kind,country,search,page);
  const response=await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,{headers:{Accept:"application/sparql-results+json","User-Agent":"Unigentamos/1.0 (https://unigentamos.com)"},signal:AbortSignal.timeout(18000),next:{revalidate:86400}});
  if(!response.ok)throw new Error("The destination catalogue is temporarily unavailable. Try again or add a destination by name.");
  const json=await response.json() as {results?:{bindings?:{item:{value:string};itemLabel:{value:string};coord?:{value:string}}[]}};
  const rows=json.results?.bindings || [];
  const items:TravelDestination[]=rows.slice(0,100).flatMap(row=>{
    const qid=row.item.value.split("/").pop() || "";
    const point=row.coord?.value.match(/^Point\(([-.\d]+) ([-.\d]+)\)$/);
    if(!/^Q\d+$/.test(qid)||!point)return [];
    return [{id:`${kind}:${qid}`,kind,country,name:row.itemLabel.value,source:`https://www.wikidata.org/wiki/${qid}`,longitude:Number(point[1]),latitude:Number(point[2])}];
  });
  return {items:[...new Map(items.map(i=>[i.id,i])).values()],hasMore:rows.length>100};
}

async function searchTravelPlaces(country:string,search:string,kind:"city"|"landmark"):Promise<{items:TravelDestination[];hasMore:boolean}>{
  if(!travelCountries.some(c=>c.code===country))throw new Error("Choose a country");
  if(search.trim().length<3)return {items:[],hasMore:false};
  const params=new URLSearchParams({q:search.trim().slice(0,80),countrycode:country,limit:"20",lang:"en"});
  if(kind==="city"){params.append("osm_tag","place:city");params.append("osm_tag","place:town");}
  else {params.append("osm_tag","tourism:attraction");params.append("osm_tag","tourism:museum");params.append("osm_tag","historic");params.append("osm_tag","man_made:tower");params.append("osm_tag","man_made:bridge");}
  const response=await fetch(`https://photon.komoot.io/api/?${params}`,{headers:{Accept:"application/json","User-Agent":"Unigentamos/1.0"},signal:AbortSignal.timeout(12000),next:{revalidate:86400}});
  if(!response.ok)throw new Error("Destination search is temporarily unavailable. Try again or add a place by name.");
  const data=await response.json() as {features?:{properties?:{name?:string;countrycode?:string;state?:string;osm_type?:string;osm_id?:number;osm_value?:string;osm_key?:string};geometry?:{coordinates?:number[]}}[]};
  const items:TravelDestination[]=(data.features||[]).flatMap(f=>{
    const p=f.properties,point=f.geometry?.coordinates;
    if(!p?.name||p.countrycode!==country||!p.osm_type||!/^[NWR]$/.test(p.osm_type)||!Number.isSafeInteger(p.osm_id)||!point||!point.every(Number.isFinite)||(kind==="city"?!['city','town'].includes(p.osm_value||''):!['tourism','historic','man_made'].includes(p.osm_key||'')))return [];
    return [{id:`${kind}:osm:${p.osm_type}${p.osm_id}`,kind,country,name:p.name,description:p.state,longitude:point[0],latitude:point[1],source:`https://www.openstreetmap.org/${({N:"node",W:"way",R:"relation"} as Record<string,string>)[p.osm_type]}/${p.osm_id}`}];
  });return {items,hasMore:false};
}
