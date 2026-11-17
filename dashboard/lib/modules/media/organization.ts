import type { NativeObjectRef } from "../../native-objects/types";
import type { Place } from "../planning/types";
export const MEDIA_PURPOSES = ["Personal memory", "Project work", "Client delivery", "Social content", "Marketing", "Reference", "Documentation", "Learning"] as const;
export type PhotoMetadata = { capturedAt?: string; camera?: string; width?: number; height?: number; creator?: string; copyright?: string };
export type MediaOrganization = { tags?: string[]; purposes?: string[]; metadata?: PhotoMetadata };
export type UploadDetails = MediaOrganization & { title: string; description: string; linkedRefs: NativeObjectRef[]; altText?: string; location?: {latitude:number;longitude:number;source:"embedded"|"manual"} };
export function cleanMediaLabels(value:unknown):string[]{
 if(value==null)return [];
 if(!Array.isArray(value)||value.length>30)throw Error("Use up to 30 tags or purposes.");
 const labels:string[]=[];
 for(const item of value){if(typeof item!=="string"||item.length>60)throw Error("Keep each tag under 60 characters.");const label=item.trim();if(label&&!labels.some(other=>other.toLocaleLowerCase()===label.toLocaleLowerCase()))labels.push(label);}
 return labels;
}
export function normalizeMediaOrganization(raw:MediaOrganization):MediaOrganization{
 const tags=cleanMediaLabels(raw.tags),purposes=cleanMediaLabels(raw.purposes);
 if(purposes.some(value=>!MEDIA_PURPOSES.includes(value as typeof MEDIA_PURPOSES[number])))throw Error("Choose a supported media purpose.");
 const source=raw.metadata,metadata:PhotoMetadata={};
 if(source){
  if(typeof source!=="object"||Array.isArray(source))throw Error("Invalid photo details");
  for(const key of ["camera","creator","copyright"] as const)if(typeof source[key]==="string"&&source[key]!.trim())metadata[key]=source[key]!.trim().slice(0,240);
  if(source.capturedAt){if(typeof source.capturedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(source.capturedAt)||(!Number.isFinite(Date.parse(source.capturedAt+"Z"))||new Date(source.capturedAt+"Z").toISOString().slice(0,19)!==source.capturedAt))throw Error("Invalid capture date");metadata.capturedAt=source.capturedAt;}
  for(const key of ["width","height"] as const)if(source[key]!=null){if(!Number.isSafeInteger(source[key])||source[key]!<1||source[key]!>100000)throw Error("Invalid image dimensions");metadata[key]=source[key];}
 }
 return {tags,purposes,...(Object.keys(metadata).length?{metadata}:{})};
}
export function mediaSearchText(title:string,description:string,profile:MediaOrganization&{linkedRefs?:NativeObjectRef[]}){return [title,description,...(profile.tags||[]),...(profile.purposes||[]),...(profile.linkedRefs||[]).map(ref=>ref.label)].join(" ").toLocaleLowerCase();}
export function mergeMediaLinks(refs:NativeObjectRef[]){return refs.filter((ref,index)=>refs.findIndex(other=>other.module===ref.module&&other.objectType===ref.objectType&&other.objectId===ref.objectId)===index);}
export function nearbyMediaPlace(location:{latitude:number;longitude:number}|undefined,places:Place[]):Place|undefined{
 if(!location||!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude)||Math.abs(location.latitude)>90||Math.abs(location.longitude)>180)return;
 const rad=(n:number)=>n*Math.PI/180;
 const candidates=places.filter(place=>!place.archivedAt&&!place.mergedIntoId&&Number.isFinite(place.latitude)&&Number.isFinite(place.longitude)&&place.lookup?.precision!=="area"&&place.lookup?.precision!=="approximate"&&place.locationVerification?.precision!=="area"&&place.locationVerification?.precision!=="approximate").map(place=>{
  const a=Math.sin(rad(place.latitude!-location.latitude)/2)**2+Math.cos(rad(location.latitude))*Math.cos(rad(place.latitude!))*Math.sin(rad(place.longitude!-location.longitude)/2)**2;
  return {place,distance:6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))};
 }).sort((a,b)=>a.distance-b.distance);
 // Do not guess between neighboring venues or link a large region as a photo venue.
 if(candidates[0]?.distance<=25&&(!candidates[1]||candidates[1].distance>100))return candidates[0].place;
}
