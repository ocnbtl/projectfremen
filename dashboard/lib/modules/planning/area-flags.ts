import cityFlags from "./city-flags.json";
import type { Place } from "./types";
import { countryDestinations, stateDestinations, type TravelDestination } from "./travel";

export function isAreaPlace(place: Partial<Place>) {
  return place.tags?.some(tag=>tag.trim().toLowerCase()==="area") || place.locationVerification?.precision==="area";
}

/** Names identify areas only within a country; never infer a flag from linked organizations. */
export function areaFlagUrl(area: {name:string;country?:string;latitude?:number;longitude?:number;kind?:string}) {
  const country=area.country?.toUpperCase();
  if(!countryDestinations.some(c=>c.country===country))return undefined;
  const name=area.name.split(/,|\s+·\s+/)[0].trim();
  if(!name)return undefined;
  const known=knownCityFlag(name,country!,area.latitude,area.longitude,area.kind);
  if(known)return `/map-flags/cities/${known.asset}`;
  const params=new URLSearchParams({country:country!,name});
  if(area.kind)params.set("kind",area.kind);
  if(Number.isFinite(area.latitude)&&Number.isFinite(area.longitude)){params.set("lat",String(area.latitude));params.set("lon",String(area.longitude));}
  return `/api/map/flags?${params}`;
}
export function travelFlagUrl(destination: TravelDestination) {
  if(destination.kind==="state")return `/map-flags/${destination.id.slice(-2).toLowerCase()}.png`;
  if(destination.kind==="country"||destination.kind==="city")return areaFlagUrl({name:destination.name,country:destination.country,latitude:destination.latitude,longitude:destination.longitude,kind:destination.kind});
  return undefined;
}
export function fixedAreaFlag(name:string,country:string,kind?:string) {
  const key=name.trim().toLocaleLowerCase();
  const nation=countryDestinations.find(c=>c.country===country && (c.name.toLocaleLowerCase()===key || key===country.toLowerCase() || (country==="US"&&["united states","usa","united states of america"].includes(key))));
  if(nation&&(!kind||kind==="country"))return {kind:"country" as const,code:country};
  const state=country==="US"&&(!kind||kind==="state")?stateDestinations.find(s=>s.name.toLocaleLowerCase()===key||s.id.slice(-2).toLowerCase()===key):undefined;
  return state?{kind:"state" as const,code:state.id.slice(-2).toLowerCase()}:undefined;
}

/** Curated public city identities are matched locally; custom place pictures still win. */
export function knownCityFlag(name:string,country:string,latitude?:number,longitude?:number,kind?:string) {
  if(kind && kind!=="city")return undefined;
  const key=name.split(/,|\s+·\s+/)[0].trim().toLocaleLowerCase();
  const coordinates=Number.isFinite(latitude)&&Number.isFinite(longitude);
  const matches=cityFlags.filter(flag=>flag.country===country && [flag.name,...flag.aliases].some(n=>n.toLocaleLowerCase()===key) &&
    (coordinates ? Math.hypot((latitude!-flag.latitude)*111,(longitude!-flag.longitude)*111*Math.cos(flag.latitude*Math.PI/180))<30 : !flag.requireCoordinates));
  return matches.length===1?matches[0]:undefined;
}
