"use client";
import {useEffect,useRef,useState} from "react";
import {WorkspaceSheet,WorkspaceButton as Button} from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import MediaDetailsFields from "./MediaDetailsFields";
import {readPhotoDetails} from "../../lib/modules/media/photo-metadata";
import {nearbyMediaPlace,mergeMediaLinks,type UploadDetails} from "../../lib/modules/media/organization";
import {createNativeObjectRef} from "../../lib/native-objects/routes";
import type {PlanningSnapshot} from "../../lib/modules/planning/repository";
export type MediaUploadEntry={id:string;file:File;details:UploadDetails};
import styles from "./MediaUploadSheet.module.css";
const MAX_FILE=268435456;
export function FilePreview({file}:{file:File}){
 const [url,setUrl]=useState(""),[failed,setFailed]=useState(false);
 useEffect(()=>{if(!file.type.startsWith("image/"))return;const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
 return url&&!failed?<img src={url} alt="" onError={()=>setFailed(true)}/>:<UnigentamosIcon role={file.type.startsWith("video/")?"module-media":"module-notes"} size={22}/>;
}
export default function MediaUploadSheet({open,onClose,onUpload,readLocation,onReadLocation,context}:{open:boolean;onClose:()=>void;onUpload:(entries:MediaUploadEntry[])=>Promise<{savedIds:string[];error?:string}>;readLocation:boolean;onReadLocation:(value:boolean)=>void;context?:PlanningSnapshot}){
 const [files,setFiles]=useState<MediaUploadEntry[]>([]),[error,setError]=useState(""),[dragging,setDragging]=useState(false),[reading,setReading]=useState(false);
 const [selectedId,setSelectedId]=useState(""),[uploading,setUploading]=useState(false);
 const session=useRef(0),preparing=useRef(false);
 const input=useRef<HTMLInputElement>(null),photos=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null),active=useRef(open);active.current=open;
 useEffect(()=>{if(!open){session.current++;request.current?.abort();setFiles([]);setSelectedId("");setError("");setDragging(false);setReading(false);}},[open]);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function add(next:File[]){
  if(!active.current||uploading||preparing.current)return;preparing.current=true;const generation=session.current;const valid=next.filter(file=>file.size>0&&file.size<=MAX_FILE);setError(valid.length!==next.length?"Choose nonempty files up to 256 MB each.":next.length?"":"Copy an image first, then paste it here.");setReading(true);
  try{for(const file of valid){const extracted=await readPhotoDetails(file,readLocation);if(!active.current||generation!==session.current)return;const place=nearbyMediaPlace(extracted.location,context?.state.places||[]);const details:UploadDetails={title:file.name,description:"",linkedRefs:[],...extracted,...(place?{linkedRefs:[createNativeObjectRef({module:"map",objectType:"place",objectId:place.id,label:place.name})]}:{})};const entry={id:crypto.randomUUID(),file,details};setFiles(prior=>prior.some(existing=>existing.file.name===file.name&&existing.file.size===file.size&&existing.file.lastModified===file.lastModified)?prior:[...prior,entry]);}}
  finally{preparing.current=false;if(generation===session.current)setReading(false);}
 }
 const selected=files.find(entry=>entry.id===selectedId)||files[0];
 function update(patch:Partial<UploadDetails>){if(selected)setFiles(prior=>prior.map(entry=>entry.id===selected.id?{...entry,details:{...entry.details,...patch}}:entry));}
 async function upload(){if(uploading||reading)return;setUploading(true);setError("");try{const result=await onUpload(files);setFiles(prior=>prior.filter(entry=>!result.savedIds.includes(entry.id)));if(result.error)setError(result.error);else onClose();}catch(e){setError((e as Error).message);}finally{setUploading(false);}}
 useEffect(()=>{if(!open)return;const pasted=(event:ClipboardEvent)=>{if(event.clipboardData?.files.length){event.preventDefault();void add(Array.from(event.clipboardData.files));}};document.addEventListener("paste",pasted);return()=>document.removeEventListener("paste",pasted);},[open,uploading,readLocation,context]);
 async function paste(){setReading(true);setError("");try{const items=await navigator.clipboard.read();const next:File[]=[];for(const item of items){const type=item.types.find(type=>type.startsWith("image/"));if(type){const blob=await item.getType(type);next.push(new File([blob],`Pasted image ${Date.now()}-${next.length}.${type.split("/")[1]}`,{type}));}}await add(next);}catch{setError("Use Ctrl+V (or Command+V) here to paste an image, or choose a file.");}finally{setReading(false);}}
 async function dropImage(transfer:DataTransfer){
  if(transfer.files.length){await add(Array.from(transfer.files));return;}
  const html=transfer.getData("text/html"),source=new DOMParser().parseFromString(html,"text/html").querySelector("img")?.getAttribute("src")||transfer.getData("text/uri-list").split("\n").find(line=>line&&!line.startsWith("#"))||"";
  if(!/^https:\/\//i.test(source)&&!/^data:image\//i.test(source)){setError("Drop a file or image here, or use Choose files.");return;}
  setReading(true);setError("");request.current?.abort();const controller=new AbortController();request.current=controller;
  try{const response=await fetch(source,{credentials:"omit",referrerPolicy:"no-referrer",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error();const type=response.headers.get("content-type")||"";if(!type.startsWith("image/")||Number(response.headers.get("content-length"))>20*1024*1024)throw Error();const reader=response.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array<ArrayBuffer>[]=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>20*1024*1024){await reader.cancel();throw Error();}chunks.push(value as Uint8Array<ArrayBuffer>);}await add([new File(chunks,`Dropped image.${type.split("/")[1].split(";")[0]}`,{type})]);}
  catch{if(active.current)setError("This image couldn't be imported. Save it to your device, then choose the file.");}finally{setReading(false);}
 }
 return <WorkspaceSheet open={open} onClose={()=>{if(!uploading&&!reading)onClose();}} title="Add files & media" titleIcon="photo-upload" presentation="center" className={styles.sheet} focusInput={false}>
 <div className={styles.content} aria-busy={uploading}>
 <fieldset disabled={uploading||reading} className={styles.uploadFields}>
 <div className={styles.dropZone} data-dragging={dragging||undefined} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);void dropImage(event.dataTransfer);}} tabIndex={0} aria-label="Drop files or paste an image">
 <UnigentamosIcon role="photo-upload" size={32}/><strong>Drop files or paste an image</strong><span>Images, video, audio, and documents · up to 256 MB per file</span>
 <div className={styles.sources}><Button icon="module-notes" onClick={()=>input.current?.click()}>Choose files</Button><Button icon="module-media" onClick={()=>photos.current?.click()}>Photo library</Button><Button icon="copy" disabled={reading} onClick={()=>void paste()}>{reading?"Reading…":"Paste"}</Button></div>
 </div>
 <input ref={input} aria-label="Choose upload files" type="file" multiple hidden onChange={event=>{void add(Array.from(event.target.files||[]));event.target.value="";}}/>
 <input ref={photos} aria-label="Choose photos and videos" type="file" multiple accept="image/*,video/*" hidden onChange={event=>{void add(Array.from(event.target.files||[]));event.target.value="";}}/>
 {error&&<p className={styles.error} role="alert">{error}</p>}
 {!!files.length&&<div className={styles.prepare}><ul className={styles.files}>{files.map(entry=><li key={entry.id} data-selected={selected?.id===entry.id}><button type="button" className={styles.fileChoice} aria-pressed={selected?.id===entry.id} onClick={()=>setSelectedId(entry.id)}><span className={styles.preview}><FilePreview file={entry.file}/></span><span className={styles.fileName}><strong>{entry.details.title||entry.file.name}</strong><small>{entry.file.name} · {Math.ceil(entry.file.size/1024)} KB</small></span></button><Button icon="close" data-icon-button="standard" aria-label={"Remove "+entry.file.name} onClick={()=>setFiles(prior=>prior.filter(item=>item.id!==entry.id))}/></li>)}</ul>{selected&&<div className={styles.prepareDetails}><MediaDetailsFields key={selected.id} value={selected.details} context={context} onChange={update}/>{files.length>1&&<Button icon="copy" onClick={()=>setFiles(prior=>prior.map(entry=>({...entry,details:{...entry.details,linkedRefs:mergeMediaLinks([...entry.details.linkedRefs,...selected.details.linkedRefs]),tags:[...new Set([...(entry.details.tags||[]),...(selected.details.tags||[])])].slice(0,30),purposes:[...new Set([...(entry.details.purposes||[]),...(selected.details.purposes||[])])]}})))}>Apply links, tags & purposes to all</Button>}</div>}</div>}
 </fieldset>
 <footer className={styles.footer}><Button className={styles.location} icon="location" disabled={uploading||reading||!!files.length} aria-pressed={readLocation} onClick={()=>onReadLocation(!readLocation)} title={files.length?"Remove files to change automatic location reading. Individual locations can be removed below.":"Read embedded photo GPS and match saved places"}>Include photo locations</Button><Button intent="primary" icon="photo-upload" disabled={!files.length||reading||uploading||files.some(entry=>!entry.details.title.trim())} onClick={()=>void upload()}>{uploading?"Uploading…":reading?"Reading photo details…":`Upload${files.length?` ${files.length} ${files.length===1?"file":"files"}`:""}`}</Button></footer>
 </div></WorkspaceSheet>;
}
