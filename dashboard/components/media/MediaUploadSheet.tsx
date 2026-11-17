"use client";
import {useEffect,useRef,useState} from "react";
import {WorkspaceSheet,WorkspaceButton as Button} from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./MediaUploadSheet.module.css";
const MAX_FILE=268435456;
function FilePreview({file}:{file:File}){
 const [url,setUrl]=useState("");
 useEffect(()=>{if(!file.type.startsWith("image/"))return;const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
 return url?<img src={url} alt=""/>:<UnigentamosIcon role={file.type.startsWith("video/")?"module-media":"module-notes"} size={22}/>;
}
export default function MediaUploadSheet({open,onClose,onUpload,readLocation,onReadLocation}:{open:boolean;onClose:()=>void;onUpload:(files:File[])=>void;readLocation:boolean;onReadLocation:(value:boolean)=>void}){
 const [files,setFiles]=useState<File[]>([]),[error,setError]=useState(""),[dragging,setDragging]=useState(false),[reading,setReading]=useState(false);
 const input=useRef<HTMLInputElement>(null),photos=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null),active=useRef(open);active.current=open;
 useEffect(()=>{if(!open){request.current?.abort();setFiles([]);setError("");setDragging(false);setReading(false);}},[open]);
 useEffect(()=>()=>request.current?.abort(),[]);
 function add(next:File[]){if(!active.current)return;const valid=next.filter(file=>file.size>0&&file.size<=MAX_FILE);setError(valid.length!==next.length?"Choose nonempty files up to 256 MB each.":next.length?"":"Copy an image first, then paste it here.");setFiles(prior=>{const result=[...prior];for(const file of valid)if(!result.some(existing=>existing.name===file.name&&existing.size===file.size&&existing.lastModified===file.lastModified))result.push(file);return result;});}
 useEffect(()=>{if(!open)return;const pasted=(event:ClipboardEvent)=>{if(event.clipboardData?.files.length){event.preventDefault();add(Array.from(event.clipboardData.files));}};document.addEventListener("paste",pasted);return()=>document.removeEventListener("paste",pasted);},[open]);
 async function paste(){setReading(true);setError("");try{const items=await navigator.clipboard.read();const next:File[]=[];for(const item of items){const type=item.types.find(type=>type.startsWith("image/"));if(type){const blob=await item.getType(type);next.push(new File([blob],`Pasted image ${Date.now()}-${next.length}.${type.split("/")[1]}`,{type}));}}add(next);}catch{setError("Use Ctrl+V (or Command+V) here to paste an image, or choose a file.");}finally{setReading(false);}}
 async function dropImage(transfer:DataTransfer){
  if(transfer.files.length){add(Array.from(transfer.files));return;}
  const html=transfer.getData("text/html"),source=new DOMParser().parseFromString(html,"text/html").querySelector("img")?.getAttribute("src")||transfer.getData("text/uri-list").split("\n").find(line=>line&&!line.startsWith("#"))||"";
  if(!/^https:\/\//i.test(source)&&!/^data:image\//i.test(source)){setError("Drop a file or image here, or use Choose files.");return;}
  setReading(true);setError("");request.current?.abort();const controller=new AbortController();request.current=controller;
  try{const response=await fetch(source,{credentials:"omit",referrerPolicy:"no-referrer",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error();const type=response.headers.get("content-type")||"";if(!type.startsWith("image/")||Number(response.headers.get("content-length"))>20*1024*1024)throw Error();const reader=response.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array<ArrayBuffer>[]=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>20*1024*1024){await reader.cancel();throw Error();}chunks.push(value as Uint8Array<ArrayBuffer>);}add([new File(chunks,`Dropped image.${type.split("/")[1].split(";")[0]}`,{type})]);}
  catch{if(active.current)setError("This image couldn't be imported. Save it to your device, then choose the file.");}finally{setReading(false);}
 }
 return <WorkspaceSheet open={open} onClose={onClose} title="Add files & media" titleIcon="photo-upload" presentation="center" className={styles.sheet} focusInput={false}>
 <div className={styles.content}>
 <div className={styles.dropZone} data-dragging={dragging||undefined} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);void dropImage(event.dataTransfer);}} tabIndex={0} aria-label="Drop files or paste an image">
 <UnigentamosIcon role="photo-upload" size={32}/><strong>Drop files or paste an image</strong><span>Images, video, audio, and documents · up to 256 MB per file</span>
 <div className={styles.sources}><Button icon="module-notes" onClick={()=>input.current?.click()}>Choose files</Button><Button icon="module-media" onClick={()=>photos.current?.click()}>Photo library</Button><Button icon="copy" disabled={reading} onClick={()=>void paste()}>{reading?"Reading…":"Paste"}</Button></div>
 </div>
 <input ref={input} aria-label="Choose upload files" type="file" multiple hidden onChange={event=>{add(Array.from(event.target.files||[]));event.target.value="";}}/>
 <input ref={photos} aria-label="Choose photos and videos" type="file" multiple accept="image/*,video/*" hidden onChange={event=>{add(Array.from(event.target.files||[]));event.target.value="";}}/>
 {error&&<p className={styles.error} role="alert">{error}</p>}
 {!!files.length&&<ul className={styles.files}>{files.map((file,index)=><li key={file.name+file.size+file.lastModified}><span className={styles.preview}><FilePreview file={file}/></span><span className={styles.fileName}><strong>{file.name}</strong><small>{file.size>=1048576?(file.size/1048576).toFixed(1)+" MB":Math.ceil(file.size/1024)+" KB"}</small></span><Button icon="close" aria-label={"Remove "+file.name} onClick={()=>setFiles(prior=>prior.filter((_,i)=>i!==index))}/></li>)}</ul>}
 <footer className={styles.footer}><Button className={styles.location} icon="location" aria-pressed={readLocation} onClick={()=>onReadLocation(!readLocation)} title="Use embedded GPS coordinates in new JPEG photos">Include photo locations</Button><Button intent="primary" icon="photo-upload" disabled={!files.length||reading} onClick={()=>{onUpload(files);onClose();}}>Upload{files.length?` ${files.length} ${files.length===1?"file":"files"}`:""}</Button></footer>
 </div></WorkspaceSheet>;
}
