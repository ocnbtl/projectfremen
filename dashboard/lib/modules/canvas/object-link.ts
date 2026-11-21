import { MODULE_ROUTES } from "../../native-objects/routes";
import type { ModuleId, NativeObjectRef } from "../../native-objects/types";
import { isBoardSourceModule, sourceFromUrl } from "./source-reference";

/** Accept copied workspace object links, including specialized views outside the search index. */
export function canvasWorkspaceLink(value:string, origin:string):NativeObjectRef | undefined {
  if (!/^(https?:\/\/|\/admin\/)/i.test(value.trim())) return;
  try {
    const url=new URL(value.trim(),origin);
    if (url.origin!==origin || url.username || url.password || /[\\\u0000-\u001f]/.test(value)) return;
    if (url.pathname.startsWith("/admin/personal/passwords")) return;
    const entry=(Object.entries(MODULE_ROUTES) as [ModuleId,string][]).find(([,base])=>url.pathname===base || url.pathname.startsWith(base+"/"));
    if (!entry) return;
    const [module,base]=entry;
    const parts=url.pathname.slice(base.length).split("/").filter(Boolean);
    const sourceId=isBoardSourceModule(module) ? sourceFromUrl(module,url) : undefined;
    const id=sourceId || url.searchParams.get("item") || url.searchParams.get("selected") || url.searchParams.get("task") || url.searchParams.get("interaction") || url.searchParams.get("travel") || parts.at(-1);
    if (!id || id.length>350) return;
    const route=url.pathname+url.search+url.hash;
    if(route.length>2048) return;
    const type=parts.length>1 ? parts[0].replace(/[-_]/g," ") : module==="personal_ops" ? "Personal" : module;
    return {module,objectType:"workspace_link",objectId:route.length<=350?route:id,route,label:type.charAt(0).toUpperCase()+type.slice(1)+" link"};
  } catch { return; }
}
