"use client";
import SearchField from "../ui/SearchField";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import PlaceTagLabel from "./PlaceTagLabel";
import SelectField from "../ui/SelectField";
import { PLACE_TAGS, primaryPlaceTag, placeTagIconRole } from "../../lib/modules/planning/place-tags";
import styles from "./MapWorkspace.module.css";
export default function PlaceTags({value,available,onChange,primaryTag,onPrimaryChange}:{value:string[];available:string[];onChange:(tags:string[])=>void;primaryTag?:string;onPrimaryChange?:(tag:string)=>void}){
  const trigger=useRef<HTMLButtonElement>(null);
  const [query,setQuery]=useState(""),[open,setOpen]=useState(false);
  const all=[...new Map([...PLACE_TAGS,...available,...value].filter(Boolean).map(t=>[t.toLowerCase(),t])).values()].sort((a,b)=>a.localeCompare(b));
  const toggle=(tag:string)=>onChange(value.includes(tag)?value.filter(v=>v!==tag):[...value,tag]);
  return <div className={styles.tagsField}><span>Tags</span><Popover.Root open={open} onOpenChange={next=>{setOpen(next);setQuery("")}}><Popover.Trigger asChild><button type="button" ref={trigger} className={styles.tagsTrigger} aria-label="Choose place tags"><span>{value.length?value.map(t=><PlaceTagLabel key={t} tag={t} className={styles.tagChip}/>):<span className={styles.tagPlaceholder}>Choose or create tags</span>}</span><UnigentamosIcon role="chevron-down" size={16}/></button></Popover.Trigger><Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}><Popover.Content onEscapeKeyDown={e=>e.stopImmediatePropagation()} className={styles.tagMenu} sideOffset={6} collisionBoundary={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined} collisionPadding={12} aria-label="Place tags"><SearchField aria-label="Find or create tag" value={query} maxLength={60} onChange={e=>setQuery(e.target.value)} /><div>{all.filter(t=>t.toLowerCase().includes(query.toLowerCase())).map(t=><button type="button" key={t} aria-pressed={value.includes(t)} onClick={()=>toggle(t)}><PlaceTagLabel tag={t}/>{value.includes(t)&&<UnigentamosIcon role="check" size={16}/>}</button>)}</div>{query.trim()&&!all.some(t=>t.toLowerCase()===query.trim().toLowerCase())&&<button type="button" onClick={()=>{toggle(query.trim());setQuery("")}}><UnigentamosIcon role="plus" size={16}/>Create “{query.trim()}”</button>}{!all.length&&!query&&<small>Type a name to create your first tag.</small>}</Popover.Content></Popover.Portal></Popover.Root>{value.length>1&&onPrimaryChange&&<label className={styles.primaryTagControl}><span>Map icon</span><SelectField contained aria-label="Primary place tag" value={primaryPlaceTag(value,primaryTag)} optionIcons={Object.fromEntries(value.map(tag=>[tag,placeTagIconRole(tag)]))} onChange={e=>onPrimaryChange(e.target.value)}>{value.map(tag=><option key={tag} value={tag}>{tag}</option>)}</SelectField></label>}</div>;
}
