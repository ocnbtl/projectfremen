"use client";
import {useState} from "react";
import type {WorkspaceRecord} from "./workspace-record-client";
import styles from "./WorkspaceRecords.module.css";

type Choice={id:string;name:string;state:string};
export default function RecordMediaLinks({workspaceId,record,editable,onChange}:{
  workspaceId:string;record:WorkspaceRecord;editable:boolean;onChange:(id:string,attach:boolean)=>Promise<void>
}){
  const [choices,setChoices]=useState<Choice[]>([]),[offset,setOffset]=useState(0),[more,setMore]=useState(false);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const base="/api/workspaces/"+encodeURIComponent(workspaceId)+"/media";
  async function page(start:number){
    setBusy(true);setError("");
    try{
      const response=await fetch(base+"?offset="+start,{cache:"no-store"});
      if(!response.ok)throw Error("Couldn’t open the media library.");
      const data=await response.json() as {files:Choice[];more:boolean};
      setChoices(previous=>[...(start?previous:[]),...data.files.filter(f=>f.state==="ready")]);
      setOffset(start+50);setMore(data.more);setOpen(true);
    }catch(e){setError(e instanceof Error?e.message:"Library unavailable.");}finally{setBusy(false);}
  }
  async function change(id:string,attach:boolean){
    setBusy(true);setError("");
    try{await onChange(id,attach);if(attach)setOpen(false);}
    catch(e){setError(e instanceof Error?e.message:"Couldn’t save the link.");}finally{setBusy(false);}
  }
  return <section className={styles.panel}><h2>Linked media</h2>
    {!!record.files.length&&<ul>{record.files.map(file=><li key={file.id}><a href={base+"?id="+encodeURIComponent(file.id)} download>{file.name}</a>
      {editable&&<button disabled={busy} onClick={()=>void change(file.id,false)} aria-label={"Unlink "+file.name}>Unlink</button>}</li>)}</ul>}
    {editable&&<div><button disabled={busy} onClick={()=>open?setOpen(false):void page(0)}>{open?"Close media picker":"Link media"}</button></div>}
    {open&&<><ul>{choices.filter(f=>!record.files.some(link=>link.id===f.id)).map(f=><li key={f.id}>{f.name}<button disabled={busy} onClick={()=>void change(f.id,true)}>Link</button></li>)}</ul>
      {choices.every(f=>record.files.some(link=>link.id===f.id))&&<small>No additional files on this page.</small>}{more&&<button disabled={busy} onClick={()=>void page(offset)}>Load more files</button>}</>}
    {!open&&!record.files.length&&<small>No visible media links.</small>}
    {error&&<p role="alert">{error}</p>}</section>;
}
