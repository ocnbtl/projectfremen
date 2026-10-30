import type { MediaProfile } from "./profile";
export const MEDIA_TYPES=[{id:"all",label:"All"},{id:"image",label:"Images"},{id:"video",label:"Video"},{id:"audio",label:"Audio"},{id:"document",label:"Documents"},{id:"other",label:"Other"}] as const;
export type MediaFilters={type:typeof MEDIA_TYPES[number]["id"];links:"all"|"linked"|"unlinked";storage:"all"|"account"|"encrypted"|"references"};
export const EMPTY_MEDIA_FILTERS:MediaFilters={type:"all",links:"all",storage:"all"};
export function matchesMediaFilters(profile:MediaProfile|undefined,filter:MediaFilters,referenceLinked=false){
 const mime=(profile?.manifest.mimeType || "").toLowerCase();
 const type=mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":/^(text\/|application\/(pdf|rtf|msword|vnd\.(openxmlformats|ms-|oasis)))/.test(mime)?"document":"other";
 const storage=!profile?"references":profile.accountFile?"account":"encrypted";
 const linked=profile?Boolean(profile.linkedRefs?.length):referenceLinked;
 return (filter.type==="all"||filter.type===type)&&(filter.storage==="all"||filter.storage===storage)&&(filter.links==="all"||(filter.links==="linked"?linked:!linked));
}
