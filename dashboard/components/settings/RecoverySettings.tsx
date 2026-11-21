"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useEffect,useState} from "react";
import {recordsEndpoint,recordRequest} from "./workspace-record-client";
import styles from "./WorkspaceRecords.module.css";

export default function RecoverySettings(){
  const id=useSearchParams().get("workspace");
  const [kind,setKind]=useState("");
  const [status,setStatus]=useState("");
  useEffect(()=>{
    let current=true;setStatus("");
    if(id)void recordRequest<{lastCheck:null|{verifiedAt:string;originals:number;documents:number}}>(id,"recoveryStatus").then(({lastCheck})=>{
      if(current)setStatus(lastCheck?"Last verified restore · "+new Date(lastCheck.verifiedAt).toLocaleString()+" · "+lastCheck.documents+" documents and "+lastCheck.originals+" originals.":"No verified database and media restore has been recorded for this workspace.");
    }).catch(()=>{});
    return()=>{current=false;};
  },[id]);
  return <div className={styles.stack}>{status&&<section className={styles.panel}><h2>Recovery history</h2><p>{status}</p></section>}<section className={styles.panel}><h2>Export records</h2>
    <p>Download the records you can open in this workspace, including their text and visible record links.</p>
    {id?<><label>Include<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">All visible records</option>
      {Object.entries({note:"Notes",task:"Tasks",board:"Board briefs",project:"Projects",person:"People",finance:"Finance",health:"Health"}).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
      <a href={recordsEndpoint(id)+"?"+new URLSearchParams({action:"export",kind})} download>Download records as JSON</a></>:<Link href="/account" prefetch={false}>Choose a workspace</Link>}
    <small>Media originals and encrypted Vault files have separate recovery procedures.</small>
  </section>{id&&<Restore key={id} id={id}/>}</div>;
}

function Restore({id}:{id:string}){
  const [archive,setArchive]=useState<unknown>(),[preview,setPreview]=useState<{newRecords:number;skipped:number}>(),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function inspect(file?:File){
    setArchive(undefined);setPreview(undefined);setMessage("");
    if(!file)return;
    setBusy(true);
    try {
      if(file.size>8*1024*1024)throw Error("Choose an export under 8 MiB.");
      const data:unknown=JSON.parse(await file.text());
      const result=await recordRequest<{newRecords:number;skipped:number}>(id,"previewRestore",{archive:data},true);
      setPreview(result);setArchive(data);
    }catch(e){setMessage(e instanceof Error?e.message:"Couldn’t read this archive.");}finally{setBusy(false);}
  }
  async function restore(){
    if(!archive||busy)return;setBusy(true);
    try{const result=await recordRequest<{newRecords:number}>(id,"restore",{archive},true);setMessage("Restored "+result.newRecords+" private records.");setArchive(undefined);setPreview(undefined);}
    catch(e){setMessage(e instanceof Error?e.message:"Restore failed.");}finally{setBusy(false);}
  }
  return <section className={styles.panel}><h2>Restore missing records</h2><p>Choose your JSON export from this workspace. Existing records are skipped. Restored records start private.</p>
    <label>Preview an export<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void inspect(e.target.files?.[0])}/></label>
    {preview&&<div className={styles.stack}><p>{preview.newRecords} eligible · {preview.skipped} skipped</p><div><button disabled={busy||!preview.newRecords} onClick={()=>void restore()}>Restore {preview.newRecords} records</button></div></div>}
    {message&&<p role="status">{message}</p>}</section>;
}
