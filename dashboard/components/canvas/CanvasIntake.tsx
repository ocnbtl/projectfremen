"use client";
import * as Popover from "@radix-ui/react-popover";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SearchField from "../ui/SearchField";
import SelectField from "../ui/SelectField";
import type {ModuleId,NativeObjectRef} from "../../lib/native-objects/types";
import {createNativeObjectRef} from "../../lib/native-objects/routes";
import {canvasWorkspaceLink} from "../../lib/modules/canvas/object-link";
import {uploadAccountFile} from "../../lib/modules/media/account-client";
import styles from "./CanvasIntake.module.css";

const modules:Record<ModuleId,string>={media:"Media",people:"People",projects:"Projects",notes:"Notes",finance:"Finance",calendar:"Calendar",map:"Map",personal_ops:"Personal",reviews:"Reviews",resources:"Resources"};
const icons:Record<ModuleId,string>={media:"module-media",people:"person",projects:"module-projects",notes:"module-notes",finance:"module-finance",calendar:"calendar",map:"location",personal_ops:"object",reviews:"module-reviews",resources:"module-resources"};
const keyOf=(ref:NativeObjectRef)=>[ref.module,ref.objectType,ref.containerObjectId,ref.objectId].join(":");

export function CanvasObjectPicker({onAdd}:{onAdd:(refs:NativeObjectRef[])=>void}) {
  const [open,setOpen]=useState(false),[module,setModule]=useState<ModuleId>("media");
  const [query,setQuery]=useState(""),[limit,setLimit]=useState(60),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const [linkLabel,setLinkLabel]=useState("");
  const [picked,setPicked]=useState<Map<string,NativeObjectRef>>(new Map());
  const [catalog,setCatalog]=useState<Partial<Record<ModuleId,NativeObjectRef[]>>>({});
  const input=useRef<HTMLInputElement>(null);
  const pasted=useMemo(()=>typeof window==="undefined"?undefined:canvasWorkspaceLink(query,window.location.origin),[query]);
  const source=pasted?.module || module;
  useEffect(()=>{
    if (!open || catalog[source]) return;
    const controller=new AbortController();
    setError("");
    fetch("/api/personal/canvas/objects?module="+source,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      if (!response.ok) throw new Error();
      const {items}=await response.json();
      if (!controller.signal.aborted) setCatalog(old=>({...old,[source]:items}));
    }).catch(()=>{if (!controller.signal.aborted) setError("Couldn’t load "+modules[source]+".");});
    return ()=>controller.abort();
  },[source,open,catalog,retry]);
  const canonical=pasted && catalog[source]?.find(ref=>ref.route===pasted.route);
  const matches=useMemo(()=>{
    if (pasted) return [canonical || {...pasted,label:linkLabel.trim() || pasted.label}];
    const words=query.toLowerCase().trim().split(/\s+/);
    return (catalog[module]||[]).filter(row=>words.every(word=>(row.label+" "+row.objectType.replaceAll("_"," ")).toLowerCase().includes(word)));
  },[query,module,catalog,pasted,canonical,linkLabel]);
  const toggle=(ref:NativeObjectRef)=>setPicked(old=>{
    const next=new Map(old),key=keyOf(ref);
    if(next.has(key)) next.delete(key); else next.set(key,ref);
    return next;
  });
  return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next){setCatalog({});setQuery("");setLimit(60);setPicked(new Map());}}}>
    <Popover.Trigger asChild><button type="button" className={styles.trigger} title="Add objects" aria-label="Add objects"><UnigentamosIcon role="object" size={18}/><span>Objects</span></button></Popover.Trigger>
    <Popover.Portal><Popover.Content className={styles.panel} collisionPadding={10} sideOffset={8} align="start" aria-label="Add objects to canvas" onOpenAutoFocus={event=>{event.preventDefault();input.current?.focus();}}>
      <header><strong>Add objects</strong><Popover.Close aria-label="Close object picker"><UnigentamosIcon role="close" size={16}/></Popover.Close></header>
      <div className={styles.search}><SelectField aria-label="Object module" value={module} onChange={event=>{setModule(event.target.value as ModuleId);setQuery("");setLimit(60);setError("");}}>{(Object.keys(modules) as ModuleId[]).map(id=><option key={id} value={id}>{modules[id]}</option>)}</SelectField>
        <SearchField ref={input} aria-label="Search canvas objects" placeholder="Search or paste object link" value={query} onChange={event=>{setQuery(event.target.value);setLinkLabel("");setLimit(60);}}/></div>
      {pasted && !canonical && catalog[source] && <input className={styles.linkLabel} aria-label="Object link name" placeholder="Name this link" maxLength={180} value={linkLabel} onChange={event=>{setLinkLabel(event.target.value);setPicked(old=>{const next=new Map(old);next.delete(keyOf(pasted));return next;});}}/>}
      <div className={styles.results}>
        {error?<div role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:!catalog[source]?<p role="status">Loading {modules[source]}…</p>:!matches.length?<p>{query?"No matching objects.":"Nothing here yet."}</p>:matches.slice(0,limit).map(ref=><button type="button" className={styles.row} key={keyOf(ref)} aria-pressed={picked.has(keyOf(ref))} onClick={()=>toggle(ref)}>
          <UnigentamosIcon role={icons[ref.module]} size={17}/><span><strong>{ref.label}</strong><small>{ref.objectType.replaceAll("_"," ")}</small></span><UnigentamosIcon role={picked.has(keyOf(ref))?"check":"plus"} size={16}/></button>)}
        {matches.length>limit&&<button type="button" className={styles.more} onClick={()=>setLimit(n=>n+60)}>Show more</button>}
      </div>
      <footer><span aria-live="polite">{picked.size} selected</span><button disabled={!picked.size} onClick={()=>{onAdd([...picked.values()]);setOpen(false);}}>Add to canvas</button></footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function CanvasMediaThumbnail({target}:{target:NativeObjectRef}) {
  const [failed,setFailed]=useState("");
  const container=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const element=container.current;
    if (!element || visible) return;
    if (typeof IntersectionObserver==="undefined") {setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if (entries.some(entry=>entry.isIntersecting)) {setVisible(true);observer.disconnect();}
    },{rootMargin:"48px"});
    observer.observe(element);
    return ()=>observer.disconnect();
  },[visible,target.module]);
  const src="/api/personal/canvas/thumbnail?"+new URLSearchParams({id:target.objectId,v:target.versionId||""});
  if(target.module!=="media") return null;
  return <div ref={container} className={styles.thumb}>{!visible||failed===src||target.objectType==="workspace_link"?<UnigentamosIcon role="module-media" size={25}/>:<img src={src} alt="" draggable={false} decoding="async" onError={()=>setFailed(src)}/>}</div>;
}

type FileMatch={hash:string;archived:boolean;ref:NativeObjectRef};
async function fileHash(file:File) {
  const bytes=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}
// A repeat or a recovered response reuses the same immutable upload chunks.
function uploadId(hash:string) {
  return hash.slice(0,8)+"-"+hash.slice(8,12)+"-8"+hash.slice(13,16)+"-a"+hash.slice(17,20)+"-"+hash.slice(20,32);
}

export function useCanvasMediaImport(onAdd:(refs:NativeObjectRef[])=>void) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const running=useRef<AbortController|null>(null);
  useEffect(()=>()=>running.current?.abort(),[]);
  const importFiles=useCallback(async(files:File[])=>{
    if(!files.length || running.current) return;
    const controller=new AbortController();
    running.current=controller;setBusy(true);setMessage("Checking Media…");
    const added=new Map<string,NativeObjectRef>(),failures:string[]=[];
    try {
      const response=await fetch("/api/personal/canvas/objects?files=1",{cache:"no-store",signal:controller.signal});
      if(!response.ok) throw new Error("Couldn’t check existing Media files. Try again.");
      const {files:existing}=await response.json() as {files:FileMatch[]};
      const known=new Map<string,FileMatch>();
      for(const item of existing) if(!known.has(item.hash)||!item.archived) known.set(item.hash,item);
      for(const [index,file] of files.entries()) {
        controller.signal.throwIfAborted();
        setMessage("Adding "+(index+1)+" of "+files.length+" · "+file.name);
        try {
          if(!file.size||file.size>256*1024*1024) throw new Error("Choose a file between 1 byte and 256 MB.");
          const hash=await fileHash(file);
          let match=known.get(hash);
          if(match?.archived) throw new Error("Restore the archived file in Media first.");
          if(!match) {
            const object=await uploadAccountFile(file,()=>{},controller.signal,undefined,{uploadId:uploadId(hash)});
            const ref=createNativeObjectRef({module:"media",objectType:"media_asset",objectId:String(object.fields.id),label:String(object.fields.title),versionId:object.updatedAt});
            match={hash,ref,archived:false};known.set(hash,match);
          }
          added.set(keyOf(match.ref),match.ref);
        } catch(error) {
          controller.signal.throwIfAborted();
          failures.push(file.name+" — "+(error instanceof Error?error.message:"Couldn’t add file."));
        }
      }
      if(added.size) onAdd([...added.values()]);
      setMessage(added.size+" "+(added.size===1?"file":"files")+" linked."+(failures.length?" "+failures.length+" failed. "+failures[0]:""));
    } catch(error) {
      if(!controller.signal.aborted) setMessage(error instanceof Error?error.message:"Couldn’t add files.");
    } finally {if(!controller.signal.aborted)setBusy(false);running.current=null;}
  },[onAdd]);
  return {importFiles,busy,message};
}
