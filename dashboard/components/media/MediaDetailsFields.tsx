"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import RecordLinks from "../planning/RecordLinks";
import ProfilePlaceField from "../planning/ProfilePlaceField";
import {WorkspaceButton as Button} from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import {MEDIA_PURPOSES,mergeMediaLinks,type UploadDetails} from "../../lib/modules/media/organization";
import {createNativeObjectRef} from "../../lib/native-objects/routes";
import type {PlanningSnapshot} from "../../lib/modules/planning/repository";
import styles from "./MediaDetailsFields.module.css";
export default function MediaDetailsFields({value,onChange,context,showTitle=true}:{value:UploadDetails;onChange:(patch:Partial<UploadDetails>)=>void;context?:PlanningSnapshot;showTitle?:boolean}){
 const [tagText,setTagText]=useState((value.tags||[]).join(", "));
 useEffect(()=>setTagText((value.tags||[]).join(", ")),[value.tags]);
 const [addedPlaces,setAddedPlaces]=useState<PlanningSnapshot["state"]["places"]>([]);
 const places=[...(context?.state.places||[]),...addedPlaces].filter((p,i,all)=>!p.archivedAt&&!p.mergedIntoId&&all.findIndex(other=>other.id===p.id)===i);
 const placeRef=value.linkedRefs.find(ref=>ref.module==="map"&&ref.objectType==="place");
 return <div className={styles.fields}>
 {showTitle&&<label>Title<input aria-label="Media title" maxLength={240} value={value.title} onChange={e=>onChange({title:e.target.value})}/></label>}
 <label>Description<textarea aria-label="Media description" rows={2} maxLength={20000} placeholder="What is this for?" value={value.description} onChange={e=>onChange({description:e.target.value})}/></label>
 <section><h3><UnigentamosIcon role="object" size={17}/>Linked objects</h3><RecordLinks objectPicker pickerLabel="Link people, projects or objects" refs={value.linkedRefs} available={context?.refs} onChange={linkedRefs=>onChange({linkedRefs})}/>{!context&&<small>Linked objects are loading. You can still prepare files.</small>}</section>
 <section><h3><UnigentamosIcon role="place-tag-custom" size={17}/>Organize</h3><label>Tags<input aria-label="Media tags" placeholder="Campaign, receipt, family…" maxLength={1800} value={tagText} onChange={e=>setTagText(e.target.value)} onBlur={()=>{const tags=tagText.split(",").map(v=>v.trim()).filter(Boolean).slice(0,30).map(v=>v.slice(0,60));onChange({tags:[...new Set(tags)]});}}/><small>Separate tags with commas.</small></label><div className={styles.purposes} role="group" aria-label="Media purpose">{MEDIA_PURPOSES.map(purpose=><Button key={purpose} aria-pressed={value.purposes?.includes(purpose)||false} onClick={()=>onChange({purposes:value.purposes?.includes(purpose)?value.purposes.filter(item=>item!==purpose):[...(value.purposes||[]),purpose]})}>{purpose}</Button>)}</div></section>
 <section><h3><UnigentamosIcon role="location" size={17}/>Location</h3><ProfilePlaceField places={places} placeId={placeRef?.objectId} index={0} initialQuery={value.location?`${value.location.latitude}, ${value.location.longitude}`:""} onSelect={place=>{setAddedPlaces(prior=>[...prior.filter(p=>p.id!==place.id),place]);const ref=createNativeObjectRef({module:"map",objectType:"place",objectId:place.id,label:place.name});onChange({linkedRefs:mergeMediaLinks([...value.linkedRefs.filter(r=>r!==placeRef),ref]),...(value.location?{}:Number.isFinite(place.latitude)&&Number.isFinite(place.longitude)?{location:{latitude:place.latitude!,longitude:place.longitude!,source:"manual"}}:{})});}} onEdit={()=>onChange({linkedRefs:value.linkedRefs.filter(ref=>ref!==placeRef)})}/>
 {value.location?<div className={styles.coordinates}><span>{value.location.source==="embedded"?"GPS from photo":"Coordinates"} · <Link prefetch={false} href={`/admin/map?${new URLSearchParams({latitude:String(value.location.latitude),longitude:String(value.location.longitude),name:value.title})}`} target="_blank" rel="noopener noreferrer" title="Open location in Map in a new tab">{value.location.latitude.toFixed(5)}, {value.location.longitude.toFixed(5)}</Link></span><Button icon="close" data-icon-button="standard" aria-label="Remove photo location" onClick={()=>onChange({location:undefined,linkedRefs:value.linkedRefs.filter(ref=>ref!==placeRef)})}/></div>:!placeRef&&<small>No embedded GPS available. Choose a saved place or find one worldwide.</small>}</section>
 {value.metadata&&Object.values(value.metadata).some(Boolean)&&<section><h3><UnigentamosIcon role="information" size={17}/>From the file</h3><dl className={styles.metadata}>{value.metadata.capturedAt&&<><dt>Captured</dt><dd>{value.metadata.capturedAt.replace("T"," · ")} <small>(camera time)</small></dd></>}{value.metadata.camera&&<><dt>Camera</dt><dd>{value.metadata.camera}</dd></>}{value.metadata.width&&value.metadata.height&&<><dt>Size</dt><dd>{value.metadata.width} × {value.metadata.height}</dd></>}{value.metadata.creator&&<><dt>Creator</dt><dd>{value.metadata.creator}</dd></>}{value.metadata.copyright&&<><dt>Rights</dt><dd>{value.metadata.copyright}</dd></>}</dl></section>}
 </div>;
}
