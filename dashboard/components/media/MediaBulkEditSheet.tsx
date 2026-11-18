"use client";
import { useState } from "react";
import { WorkspaceSheet, WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import RecordLinks from "../planning/RecordLinks";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { MEDIA_PURPOSES, mergeMediaLinks } from "../../lib/modules/media/organization";
import { applyMediaBulkEdit, type BulkMode, type MediaBulkEdit } from "../../lib/modules/media/bulk-edit";
import type { MediaProfile } from "../../lib/modules/media/profile";
import type { VaultObjectSnapshot } from "../../lib/local-first/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import fields from "./MediaDetailsFields.module.css";
import styles from "./MediaBulkEditSheet.module.css";

function Mode({value,label,onChange}:{value:BulkMode;label:string;onChange:(mode:BulkMode)=>void}){
  return <div className={styles.modes} role="group" aria-label={`${label} action`}>{(["add","remove"] as const).map(option=><Button key={option} aria-pressed={value===option} onClick={()=>onChange(option)}>{option==="add"?"Add":"Remove"}</Button>)}</div>;
}

export default function MediaBulkEditSheet({items,context,onClose,onApply}:{
  items:VaultObjectSnapshot[]; context?:PlanningSnapshot; onClose:()=>void;
  onApply:(change:MediaBulkEdit)=>Promise<{failures:{title:string;message:string}[]}>;
}) {
  const [tagText,setTagText]=useState("");
  const [change,setChange]=useState<MediaBulkEdit>({tags:{mode:"add",values:[]},purposes:{mode:"add",values:[]},links:{mode:"add",values:[]}});
  const [busy,setBusy]=useState(false),[failures,setFailures]=useState<{title:string;message:string}[]>([]),[error,setError]=useState("");
  const profiles=items.map(item=>item.fields.mediaProfile as unknown as MediaProfile);
  const existingTags=[...new Set(profiles.flatMap(profile=>profile.tags||[]))].sort((a,b)=>a.localeCompare(b));
  const existingLinks=mergeMediaLinks(profiles.flatMap(profile=>profile.linkedRefs));
  const draft={...change,tags:{...change.tags,values:tagText.split(",").map(value=>value.trim()).filter(Boolean)}};
  let affected=0,validation="";
  try { affected=items.filter((item,index)=>applyMediaBulkEdit(profiles[index],draft,[item.objectId,String(item.fields.id)])!==profiles[index]).length; }
  catch(e){validation=(e as Error).message;}
  const hasChanges=Boolean(draft.tags.values.length||draft.purposes.values.length||draft.links.values.length);
  function mode(section:keyof MediaBulkEdit,value:BulkMode){setChange(prior=>({...prior,[section]:{...prior[section],mode:value}}));setError("");}
  async function apply(){if(busy||!affected||validation)return;setBusy(true);setError("");try{const result=await onApply(draft);setFailures(result.failures);if(!result.failures.length)onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <WorkspaceSheet open title="Edit selected media" titleIcon="edit" onClose={()=>{if(!busy)onClose();}} presentation="center" className={styles.sheet} focusInput={false}>
    <p className={styles.intro}>{items.length} {items.length===1?"file":"files"} selected. Add or remove just the details you choose.</p>
    <fieldset disabled={busy} className={`${styles.fieldset} ${fields.fields}`}>
      <section className={styles.section}>
        <div className={styles.heading}><h3><UnigentamosIcon role="place-tag-custom" size={17}/>Tags</h3><Mode value={change.tags.mode} label="Tags" onChange={value=>mode("tags",value)}/></div>
        <label>{change.tags.mode==="add"?"Tags to add":"Tags to remove"}<input aria-label="Bulk media tags" value={tagText} maxLength={1800} placeholder="Separate tags with commas" onChange={e=>setTagText(e.target.value)}/></label>
        {!!existingTags.length&&<div className={fields.purposes} role="group" aria-label="Existing tags">{existingTags.map(tag=><Button key={tag} aria-pressed={draft.tags.values.some(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase())} onClick={()=>setTagText((draft.tags.values.some(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase())?draft.tags.values.filter(value=>value.toLocaleLowerCase()!==tag.toLocaleLowerCase()):[...draft.tags.values,tag]).join(", "))}>{tag}</Button>)}</div>}
      </section>
      <section className={styles.section}>
        <div className={styles.heading}><h3><UnigentamosIcon role="object" size={17}/>Purposes</h3><Mode value={change.purposes.mode} label="Purposes" onChange={value=>mode("purposes",value)}/></div>
        <div className={fields.purposes} role="group" aria-label="Bulk media purposes">{MEDIA_PURPOSES.map(purpose=><Button key={purpose} aria-pressed={change.purposes.values.includes(purpose)} onClick={()=>setChange(prior=>({...prior,purposes:{...prior.purposes,values:prior.purposes.values.includes(purpose)?prior.purposes.values.filter(value=>value!==purpose):[...prior.purposes.values,purpose]}}))}>{purpose}</Button>)}</div>
      </section>
      <section className={styles.section}>
        <div className={styles.heading}><h3><UnigentamosIcon role="object-add" size={17}/>Linked objects</h3><Mode value={change.links.mode} label="Linked objects" onChange={value=>mode("links",value)}/></div>
        <RecordLinks objectPicker pickerLabel={change.links.mode==="add"?"Choose objects to link":"Choose links to remove"} refs={change.links.values} available={change.links.mode==="add"?context?.refs:existingLinks} onChange={values=>setChange(prior=>({...prior,links:{...prior.links,values}}))}/>
        {change.links.mode==="remove"&&!existingLinks.length&&<small>These files have no linked objects.</small>}
      </section>
    </fieldset>
    {(error||validation)&&<p role="alert" className={styles.feedback}>{error||validation}</p>}
    {!!failures.length&&<div role="alert" className={styles.feedback}>We couldn’t confirm these updates. You can retry, or close and reopen to use the latest saved details.<ul>{failures.map((failure,index)=><li key={index}>{failure.title}: {failure.message}</li>)}</ul></div>}
    <footer className={styles.footer}><span className={styles.summary} aria-live="polite">{hasChanges?`${affected} ${affected===1?"file":"files"} will change`:"Choose details to update"}</span><Button icon="edit" intent="primary" busy={busy} disabled={!affected||Boolean(validation)} onClick={()=>void apply()}>{failures.length?"Retry remaining":"Apply changes"}</Button></footer>
  </WorkspaceSheet>;
}
