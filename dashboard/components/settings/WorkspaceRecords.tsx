"use client";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {recordRequest,type WorkspaceIndex,type WorkspaceRecord} from "./workspace-record-client";
import styles from "./WorkspaceRecords.module.css";
import {AccountWritingField,AccountWritingText} from "./AccountWriting";
import {writingDefaults,type WritingPreferences} from "../../lib/writing/model";
import AccountRecordSearch from "./AccountRecordSearch";
import {dailyDefaults,type DailyPreferences} from "../../lib/settings/preferences";
import RecordNotificationForm from "./RecordNotificationForm";
import RecordMediaLinks from "./RecordMediaLinks";

const sensitive = new Set(["person","finance","health"]);
const kinds = {note:"Note",task:"Task",board:"Board brief",project:"Project",person:"Person",finance:"Finance",health:"Health"};
export default function WorkspaceRecords({workspaceId,itemKey,prefs=dailyDefaults,writing=writingDefaults}: {workspaceId:string;itemKey?:string;prefs?:DailyPreferences;writing?:WritingPreferences}) {
  const home="/account/workspaces/"+encodeURIComponent(workspaceId);
  const url=(key:string)=>home+"?item="+encodeURIComponent(key);
  const [index,setIndex]=useState<WorkspaceIndex>(),[item,setItem]=useState<WorkspaceRecord>();
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [version,setVersion]=useState(0),[kind,setKind]=useState("note"),[editing,setEditing]=useState(false);
  const creationKey=useRef("");
  useEffect(()=>{
    let active=true;
    Promise.all([recordRequest<WorkspaceIndex>(workspaceId,"list"),itemKey?recordRequest<WorkspaceRecord>(workspaceId,"get",{key:itemKey}):undefined])
      .then(([next,record])=>{if(active){setIndex(next);setItem(record);}})
      .catch(e=>{if(active){setError(e.message);setIndex(undefined);setItem(undefined);}});
    return ()=>{active=false};
  },[workspaceId,itemKey,version]);
  async function submit(event:FormEvent<HTMLFormElement>,action:string) {
    event.preventDefault(); if(busy)return;
    const form=event.currentTarget, data=new FormData(form), fields:Record<string,unknown>=Object.fromEntries(data);
    if(action==="edit" || action==="create")fields.newLinks=data.getAll("newLinks");
    if(action==="create"){creationKey.current ||= crypto.randomUUID();fields.createKey=creationKey.current;}
    if(action==="share")fields.expires=new Date(Date.now()+Number(fields.days)*86400000).toISOString();
    setBusy(true);setError("");setMessage("");
    try {
      const result=await recordRequest<{key?:string}>(workspaceId,action,{...fields,key:itemKey,revision:item?.revision},true);
      if(action==="create"&&result.key){window.location.assign(url(result.key));return;}
      setEditing(false);setVersion(v=>v+1);setMessage(action==="share"?"Access granted. Send the record link to the recipient.":"Saved.");
      if(action!=="edit")form.reset();
    }catch(e){setError(e instanceof Error?e.message:"Couldn’t save.");}finally{setBusy(false);}
  }
  const write=index?.role==="owner"||index?.role==="editor";
  return <div className={styles.stack}>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {!index&&!error&&<p role="status">Opening workspace…</p>}
    {index&&!itemKey&&<>
      <section className={styles.panel}><h2>Records</h2>
        <AccountRecordSearch records={index.records} home={home} prefs={prefs}/>
      </section>
      {write&&<section className={styles.panel}><h2>New record</h2><form onSubmit={e=>void submit(e,"create")}>
        <label>Type<select name="kind" value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Title<input name="title" required maxLength={250}/></label>
        <AccountWritingField prefs={writing} records={index.records}/>
        <label>Audience<select key={kind} name="audience" defaultValue={sensitive.has(kind)?"private":index.defaultAudience}><option value="private">Private</option>{!sensitive.has(kind)&&<option value="workspace">Workspace members</option>}</select></label>
        <div className={styles.actions}><button type="submit" disabled={busy}>Create record</button></div>
      </form></section>}
    </>}
    {item&&index&&<>
      <section className={styles.panel}>
        <small>{item.kind} · {item.audience==="workspace"?"Workspace members":"Restricted access"}</small>
        <div className={styles.title}><h2>{item.title}</h2>{item.mine&&write&&<button onClick={()=>setEditing(!editing)}>{editing?"Cancel":"Edit"}</button>}</div>
        {editing?<form onSubmit={e=>void submit(e,"edit")}><label>Title<input name="title" defaultValue={item.title} required maxLength={250}/></label><AccountWritingField initial={item.body} prefs={writing} records={index.records} exclude={item.key}/>
          <label>Audience<select name="audience" defaultValue={item.audience}><option value="private">Restricted access</option>{!sensitive.has(item.kind)&&<option value="workspace">Workspace members</option>}</select></label>
          <div className={styles.actions}><button type="submit" disabled={busy}>Save changes</button></div></form>:<div className={styles.body}><AccountWritingText text={item.body} id={workspaceId} prefs={writing}/></div>}
      </section>
      <section className={styles.panel}><h2>Linked records</h2>
        {item.links.length?<ul>{item.links.map(link=><li key={link.key}><Link href={url(link.key)} prefetch={false}>{link.title}</Link>{item.mine&&write&&<form onSubmit={e=>void submit(e,"unlink")}><input type="hidden" name="target" value={link.key}/><button disabled={busy} aria-label={"Unlink "+link.title}>Unlink</button></form>}</li>)}</ul>:<p>No visible links.</p>}
        {item.mine&&write&&index.records.some(r=>r.key!==itemKey&&!item.links.some(l=>l.key===r.key))&&<form onSubmit={e=>void submit(e,"link")}>
          <label>Link an existing record<select name="target" required defaultValue=""><option value="" disabled>Choose a record</option>{index.records.filter(r=>r.key!==itemKey&&!item.links.some(l=>l.key===r.key)).map(r=><option key={r.key} value={r.key}>{r.title}</option>)}</select></label>
          <div className={styles.actions}><button type="submit" disabled={busy}>Link record</button></div></form>}
      </section>
      <RecordMediaLinks key={item.key} workspaceId={workspaceId} record={item} editable={!!(item.mine&&write)} onChange={async(mediaId,attach)=>{
        await recordRequest(workspaceId,attach?"attach":"detach",{key:item.key,mediaId},true);setVersion(v=>v+1);
      }}/>
      {item.mine&&write&&(!sensitive.has(item.kind)||index.allowSensitive)&&<section className={styles.panel}><h2>Share with a member</h2><p>Give this member read access to this record. Linked records keep their own permissions.</p>
        <form onSubmit={e=>void submit(e,"share")}><label>Member email<input type="email" name="email" required/></label>
          <label>Access ends<select name="days" defaultValue="30">{[7,30,90].map(days=><option key={days} value={days}>In {days} days</option>)}</select></label>
          <div className={styles.actions}><button type="submit" disabled={busy}>Grant access</button><a href={url(item.key)}>Record link</a></div>
        </form></section>}
      {item.mine&&write&&<RecordNotificationForm workspaceId={workspaceId} objectKey={item.key}/>}
    </>}
  </div>;
}
