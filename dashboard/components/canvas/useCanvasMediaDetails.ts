"use client";
import {useEffect,useMemo,useState} from "react";
import {buildJsonHeadersWithCsrf} from "../../lib/client-csrf";
import {browserVault} from "../../lib/local-first/browser-engine";
import {pendingCanonicalCommands} from "../../lib/local-first/canonical-record";
import {announceMediaDetails,watchMediaDetails} from "../../lib/modules/media/detail-events";
import type {MediaText,SharedMediaDetails} from "../../lib/modules/media/shared-details";
import type {CanvasNode} from "../../lib/modules/canvas/model";

export function linkedMediaId(node:CanvasNode) {
  if(node.ref?.module!=="media") return;
  if(node.ref.objectType==="media_asset") return node.ref.objectId;
  if(node.ref.objectType==="workspace_link") {
    const url=new URL(node.ref.route,"https://workspace.invalid");
    const segment=/^\/admin\/media\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    const id=url.searchParams.get("selected") || (segment && !["duplicates","in-use","missing-metadata","needs-review","rights-usage","upload-queue"].includes(segment)?segment:undefined);
    if(id) {try{return decodeURIComponent(id);}catch{return;}}
  }
}
export function displayMediaDetails(node:CanvasNode,details?:SharedMediaDetails):CanvasNode {
  if(!details) return node;
  const boardTitle=!details.titleEdited && details.title===node.ref?.label && node.title && node.title!==node.ref.label;
  return {...node,title:boardTitle?node.title:details.title,body:details.body || (details.captionEdited?"":node.body),notes:details.notes,ref:node.ref&&{...node.ref,label:details.title}};
}
async function readDetails(ids:string[],signal?:AbortSignal) {
  const response=await fetch("/api/media/details",{method:"POST",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({ids}),signal,cache:"no-store"});
  const result=await response.json();
  if(!response.ok)throw Error(result.error || "Media details could not be loaded.");
  const items=new Map<string,SharedMediaDetails>((result.items as SharedMediaDetails[]).map(row=>[row.id,row]));
  if(browserVault.isUnlocked() && ids.some(id=>items.get(id)?.storage==="vault" || !items.has(id))) {
    const wanted=new Set(ids);
    for(const local of await browserVault.listObjects(["media"])) {
      const id=String(local.fields.id || "");
      if(!wanted.has(id) || !local.fields.mediaManifest || items.get(id)?.storage==="account")continue;
      const pending=pendingCanonicalCommands(local);
      if(!pending.length)continue;
      const remote=items.get(id);
      const dirty=(field:string)=>pending.some(({command})=>field in command.patch);
      items.set(id,{id,title:!remote||dirty("title")?String(local.fields.title||""):remote.title,
        body:!remote||dirty("body")?String(local.fields.body||""):remote.body,
        notes:!remote||dirty("mediaNotes")?String(local.fields.mediaNotes||""):remote.notes,
        updatedAt:local.versionId,captionEdited:dirty("body") || Boolean(remote?.captionEdited),titleEdited:dirty("title") || Boolean(remote?.titleEdited),storage:"vault"});
    }
  }
  return items;
}
export async function readCardMedia(id:string) {
  const result=(await readDetails([id])).get(id);
  if(!result)throw Error("This linked Media file is unavailable.");
  return result;
}
export async function writeCardMedia(base:SharedMediaDetails,patch:Partial<MediaText>) {
  if(base.storage==="vault" && browserVault.isUnlocked()) {
    const local=(await browserVault.listObjects(["media"])).find(item=>item.fields.id===base.id);
    if(local && pendingCanonicalCommands(local).length) {
      if(local.versionId!==base.updatedAt)throw Error("Media changed. Review the latest details before saving.");
      const {notes,...fields}=patch;
      const saved=await browserVault.saveCanonicalFields(local,{...fields,...(notes!==undefined?{mediaNotes:notes}:{})});
      announceMediaDetails();
      return {...base,...patch,updatedAt:saved.versionId,captionEdited:base.captionEdited || patch.body!==undefined,titleEdited:base.titleEdited || patch.title!==undefined};
    }
  }
  const response=await fetch("/api/media/details",{method:"PATCH",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({id:base.id,expectedUpdatedAt:base.updatedAt,patch})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error || "Media details could not be saved.");
  announceMediaDetails();
  return result.item as SharedMediaDetails;
}

export function useCanvasMediaDetails(nodes:CanvasNode[]) {
  const [items,setItems]=useState(new Map<string,SharedMediaDetails>());
  const key=useMemo(()=>JSON.stringify([...new Set(nodes.map(linkedMediaId).filter((id):id is string=>Boolean(id)))].sort()),[nodes]);
  useEffect(()=>{
    const ids=JSON.parse(key) as string[];
    if(!ids.length){setItems(new Map());return;}
    let controller:AbortController|undefined;
    const update=()=>{
      controller?.abort();
      const current=new AbortController();
      controller=current;
      void readDetails(ids,current.signal).then(result=>{if(!current.signal.aborted)setItems(result);}).catch(()=>{ /* Saved card text stays visible. The editor reports read errors. */ });
    };
    update();
    const unwatch=watchMediaDetails(update);
    window.addEventListener("unigentamos-vault-data-changed",update);
    return ()=>{controller?.abort();unwatch();window.removeEventListener("unigentamos-vault-data-changed",update);};
  },[key]);
  return items;
}
