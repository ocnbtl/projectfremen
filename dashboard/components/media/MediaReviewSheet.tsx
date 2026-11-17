"use client";
import {useState} from "react";
import {WorkspaceSheet,WorkspaceButton as Button} from "../admin-shell/WorkspaceKit";
import {FilePreview} from "./MediaUploadSheet";
import MediaDetailsFields from "./MediaDetailsFields";
import type {UploadDetails} from "../../lib/modules/media/organization";
import type {VaultObjectSnapshot} from "../../lib/local-first/types";
import type {MediaProfile} from "../../lib/modules/media/profile";
import type {PlanningSnapshot} from "../../lib/modules/planning/repository";
import {saveMediaDetails} from "../../lib/modules/media/account-client";
import styles from "./MediaUploadSheet.module.css";
export default function MediaReviewSheet({items,onClose,onSaved,context,onOpen,files}:{files:Map<string,File>;items:VaultObjectSnapshot[];onClose:()=>void;onSaved:()=>Promise<void>;context?:PlanningSnapshot;onOpen:(item:VaultObjectSnapshot)=>void}){
 const [records,setRecords]=useState(items),[index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 const object=records[index],profile=object.fields.mediaProfile as unknown as MediaProfile;
 const details=(record:VaultObjectSnapshot):UploadDetails=>({...record.fields.mediaProfile as unknown as MediaProfile,title:String(record.fields.title||""),description:String(record.fields.body||"")});
 const [draft,setDraft]=useState(()=>details(object));
 const dirty=JSON.stringify(draft)!==JSON.stringify(details(object));
 async function save(){if(!dirty)return object;setBusy(true);setError("");try{const next=await saveMediaDetails(object,{title:draft.title,body:draft.description,mediaProfile:{...profile,...draft}});setRecords(prior=>prior.map((r,i)=>i===index?next:r));setDraft(details(next));setSaved(true);await onSaved();return next;}catch(e){setError((e as Error).message);return undefined;}finally{setBusy(false);}}
 async function move(next:number){if(busy)return;if(!await save())return;setIndex(next);setDraft(details(records[next]));setSaved(false);}
 return <WorkspaceSheet open onClose={()=>{if(!busy&&!dirty)onClose();else if(dirty)setError("Save your changes or choose Discard changes before closing.");}} title={records.length===1?"Media uploaded":`${records.length} files uploaded`} titleIcon="module-media" presentation="center" className={styles.sheet} focusInput={false}>
 <div className={styles.reviewHeader}><span>{index+1} of {records.length} · {profile.manifest.fileName}</span><div><Button icon="back" data-icon-button="standard" aria-label="Previous uploaded file" disabled={busy||index===0} onClick={()=>void move(index-1)}/><Button icon="chevron-right" data-icon-button="standard" aria-label="Next uploaded file" disabled={busy||index===records.length-1} onClick={()=>void move(index+1)}/></div></div>
 {files.get(object.objectId)&&<div className={styles.reviewPreview}><FilePreview file={files.get(object.objectId)!}/></div>}
 <fieldset disabled={busy} className={styles.reviewFields}><MediaDetailsFields key={object.objectId} value={draft} onChange={patch=>{setDraft(prior=>({...prior,...patch}));setSaved(false);}} context={context?{...context,refs:context.refs.filter(ref=>ref.objectId!==object.fields.id&&ref.objectId!==object.objectId)}:undefined}/></fieldset>
 {error&&<p role="alert" className={styles.error}>{error}</p>}{saved&&<p role="status">Changes saved.</p>}
 <footer className={styles.footer}>{dirty?<Button onClick={()=>{setDraft(details(object));setError("");}} disabled={busy}>Discard changes</Button>:<Button icon="module-media" disabled={busy} onClick={()=>{onClose();onOpen(object);}}>Open media</Button>}<Button intent="primary" icon={dirty?"edit":"check"} disabled={busy||!draft.title.trim()} onClick={()=>void(async()=>{if(await save())onClose();})()}>{busy?"Saving…":dirty?"Save changes":"Done"}</Button></footer>
 </WorkspaceSheet>;
}
