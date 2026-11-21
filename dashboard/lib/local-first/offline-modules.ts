export const offlineModules = {
  notes:"Notes",people:"People",media:"Media",resources:"Resources",projects:"Projects",calendar:"Calendar",
  map:"Map",reviews:"Reviews",finance:"Finance",personal:"Personal"
} as const;
export type OfflineModule=keyof typeof offlineModules;
export function offlineModuleFor(canonicalId:string):OfflineModule|undefined{
  const [module,collection]=canonicalId.split(":",2);
  if(module==="personal-records"){
    if(collection==="person"||collection==="org")return "people";
    if(collection==="note")return "notes";
    if(collection==="resource")return "resources";
    if(collection==="file")return "media";
    return "personal";
  }
  if(module==="personal-ops"||module==="personal-life")return "personal";
  return Object.hasOwn(offlineModules,module)?module as OfflineModule:undefined;
}
