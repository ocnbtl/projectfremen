"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {recordRequest,type RecordGrant,type WorkspaceIndex} from "./workspace-record-client";
import styles from "./WorkspaceRecords.module.css";

export default function SharingSettings(){
  const id=useSearchParams().get("workspace");
  return id?<WorkspaceSharing key={id} id={id}/>:<Link prefetch={false} href="/account">Choose a workspace to manage sharing</Link>;
}
function WorkspaceSharing({id}:{id:string}){
  const [wide,setWide]=useState<{id:string;title:string;type:"media"|"record";canRevoke:boolean}[]>([]);
  const [index,setIndex]=useState<WorkspaceIndex>(),[grants,setGrants]=useState<RecordGrant[]>([]);
  const [version,setVersion]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    Promise.all([recordRequest<WorkspaceIndex>(id,"list"),recordRequest<RecordGrant[]>(id,"inventory"),recordRequest<typeof wide>(id,"workspaceShares")])
      .then(([data,rows,shared])=>{if(active){setIndex(data);setGrants(rows);setWide(shared);}})
      .catch(e=>{if(active){setError(e.message);setIndex(undefined);setGrants([]);setWide([]);}});
    return()=>{active=false;};
  },[id,version]);
  async function update(action:string,fields:Record<string,unknown>){
    if(busy)return; setBusy(true);setNotice("");setError("");
    try {await recordRequest(id,action,fields,true);setVersion(n=>n+1);setNotice("Saved.");}
    catch(e){setError(e instanceof Error?e.message:"Couldn’t save.");}finally{setBusy(false);}
  }
  return <div className={styles.stack}>
    {index?.role==="owner"&&<section className={styles.panel}><h2>Workspace sharing defaults</h2>
      <form key={version} onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void update("policy",{defaultAudience:data.get("audience"),allowSensitive:data.has("sensitive")});}}>
        <label>New records<select name="audience" defaultValue={index.defaultAudience}><option value="private">Private to the author</option><option value="workspace">Everyone in this workspace</option></select></label>
        <label className={styles.check}><input type="checkbox" name="sensitive" defaultChecked={index.allowSensitive}/>Allow named members to receive sensitive records</label>
        <small>Finance, Health, and People records start private. Turning off sensitive sharing revokes their individual grants.</small>
        <div className={styles.actions}><button type="submit" disabled={busy}>Save policy</button></div>
      </form></section>}
    <section className={styles.panel}><h2>Shared with the whole workspace</h2>
      {wide.length?<ul>{wide.map(row=><li key={row.type+row.id}><div><a href={row.type==="media"?"/api/workspaces/"+id+"/media?id="+encodeURIComponent(row.id):"/account/workspaces/"+id+"?item="+encodeURIComponent(row.id)}>{row.title}</a><small>{row.type==="media"?"File":"Record"} · All current members</small></div>
        {row.canRevoke&&index?.role!=="viewer"&&<button disabled={busy} onClick={()=>void update("restrictAudience",{key:row.id,type:row.type})}>End workspace access</button>}</li>)}</ul>:<p>{index?"Nothing shared with all members.":"Loading…"}</p>}</section>
    <section className={styles.panel}><h2>Individual record links</h2>
      {!index&&!error?<p>Loading…</p>:!grants.length?<p>No shared links visible to you.</p>:<ul>{grants.map(g=><li key={g.id}><div>
        {g.title?<Link prefetch={false} href={"/account/workspaces/"+encodeURIComponent(id)+"?item="+encodeURIComponent(g.key)}>{g.title}</Link>:<strong>Restricted record</strong>}
        <small>{g.recipient} · {g.revoked?"Revoked":new Date(g.expires)<=new Date()?"Expired":"Expires "+new Date(g.expires).toLocaleDateString()}</small></div>
        {!g.revoked&&new Date(g.expires)>new Date()&&<button disabled={busy} onClick={()=>void update("revoke",{grant:g.id})}>Revoke access</button>}</li>)}</ul>}
    </section>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </div>;
}
