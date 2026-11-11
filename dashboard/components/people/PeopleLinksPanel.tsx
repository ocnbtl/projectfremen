"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { PersonalRecord } from "../../lib/personal-records-store";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import type { ObjectLink } from "../../lib/native-objects/links";
import { buildProfileRecordEdges, collectProfileConnections, profileConnectionKey, profileRecordReferences, resolveProfileTarget, type ProfileRecordEdge } from "../../lib/modules/people/profile-connections";
import { useRelatedRecords } from "../planning/RelatedRecords";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import PeopleProfilePreview from "./PeopleProfilePreview";
import { PeopleProfileAvatar } from "./PeopleProfilePhoto";
import { objectTargetIcon } from "./PeopleObjectPicker";
import SearchField from "../ui/SearchField";
import styles from "./PeopleLinksPanel.module.css";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import type { Project } from "../../lib/modules/projects/types";
import { projectLinkPreview } from "../../lib/modules/projects/link-preview";
import { EventObjectIdentity } from "../planning/EventObjects";

const groups = [ ["people","People","person"], ["organizations","Organizations","organization"], ["projects","Projects","module-projects"], ["resources","Resources","resource"], ["notes","Notes","module-notes"], ["other","Other linked work","object"] ] as const;
export default function PeopleLinksPanel({person,people,targets,links,edges,projects,projectRecords,error,onOpenPerson,onRemove,busy,onAdd}: {
  person: PersonalRecord; people: PersonalRecord[]; targets: NativeObjectRef[]; links: ObjectLink[]; edges: ProfileRecordEdge[];
  projects: {projectRef: NativeObjectRef; roles: string[]}[]; projectRecords: Project[]; error?: string; onOpenPerson:(record:PersonalRecord)=>void; onRemove:(link:ObjectLink)=>void; busy:boolean; onAdd:()=>void;
}) {
  const [query,setQuery] = useState("");
  const related = useRelatedRecords("people",person.className === "org" ? "organization" : "person",person.id);
  const currentTargets = useMemo(()=>[...targets.filter(target=>target.module !== "people"),...people.filter(record=>!record.archivedAt).map(record=>createNativeObjectRef({module:"people",objectType:record.className === "org" ? "organization" : "person",objectId:record.id,label:record.title}))],[targets,people]);
  const source = currentTargets.find(target=>target.module === "people" && target.objectId === person.id)!;
  const connections = useMemo(()=>source ? collectProfileConnections(source,currentTargets,links,[...edges,...buildProfileRecordEdges(people,currentTargets)], [...projects.map(item=>({ref:item.projectRef,detail:item.roles.join(" · ") || "Project connection"})),...related.items]) : [],[source,currentTargets,links,edges,people,projects,related.items]);
  const visible=connections.filter(item=>`${item.ref.label} ${item.details.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const savedReferences=[...new Set(profileRecordReferences(person).filter(item=>!resolveProfileTarget(item.value,currentTargets,item.module)).map(item=>item.value))];
  const category=(ref:NativeObjectRef)=>ref.module === "people" ? ref.objectType === "organization" || ref.objectType === "org" ? "organizations" : "people" : ["projects","resources","notes"].includes(ref.module) ? ref.module : "other";
  return <section className={styles.panel} aria-label={`${person.title} links`}>
    <header><h3><UnigentamosIcon role="link" size={18}/>Links <span>{connections.length}</span></h3><button type="button" onClick={onAdd}><UnigentamosIcon role="object-add" size={18}/>Add object</button></header>
    <SearchField aria-label="Search linked objects" placeholder="Search links" value={query} onChange={event=>setQuery(event.target.value)}/>
    {error && <p role="alert">{error}</p>}{related.error && <p role="alert">Calendar and place links could not load. Your saved links are preserved.</p>}
    {!related.loaded && !related.error && <p role="status">Loading connected schedules and places…</p>}
    <div className={styles.groups}>{groups.map(([id,label,icon])=>{const items=visible.filter(item=>category(item.ref)===id);if(!items.length)return null;return <section key={id} aria-label={`Linked ${label.toLowerCase()}`}><h4><UnigentamosIcon role={icon} size={18}/>{label}<span>{items.length}</span></h4><div className={styles.cards}>{items.map(item=>{
      const record=item.ref.module === "people" ? people.find(record=>record.id===item.ref.objectId) : undefined;
      const project = item.ref.module === "projects" ? projectRecords.find(project => project.id === item.ref.objectId) : undefined;
      const content=<>{record ? <PeopleProfileAvatar organization={record.className==="org"} label={record.title} initials={record.title.split(/\s+/).map(s=>s[0]).slice(0,2).join("")} photoUrl={record.profile?.photoUrl} photoUpdatedAt={record.profile?.photoUpdatedAt} compact/> : project?.photoUpdatedAt ? <EventObjectIdentity record={{...item.ref, preview: projectLinkPreview(project)}}/> : <UnigentamosIcon role={objectTargetIcon(item.ref)} size={22}/>}<span><strong>{item.ref.label}</strong><small>{item.details.join(" · ")}</small></span></>;
      return <article key={profileConnectionKey(item.ref)}>{record ? <PeopleProfilePreview person={record} onOpen={onOpenPerson}>{content}</PeopleProfilePreview> : <Link prefetch={false} href={item.ref.route}>{content}</Link>}{item.linkIds.length===1 && <button type="button" className={styles.unlink} disabled={busy} aria-label={`Remove direct link to ${item.ref.label}`} title="Remove direct link; profile and other connections are kept" onClick={()=>{const link=links.find(link=>link.id===item.linkIds[0]);if(link)onRemove(link);}}><UnigentamosIcon role="close" size={16}/></button>}</article>;
    })}</div></section>;})}</div>
    {!visible.length && <p>{query ? "No links match your search." : "No linked objects yet."}</p>}
    {savedReferences.length>0 && <details><summary>Saved references · {savedReferences.length}</summary><p>These names or IDs have no unique active match. They are preserved for review.</p>{savedReferences.map(value=><div key={value}>{value}</div>)}</details>}
    {person.externalSources.length>0 && <section><h4><UnigentamosIcon role="link" size={18}/>External sources</h4><div className={styles.sources}>{person.externalSources.map((value,index)=>/^https?:\/\//i.test(value) ? <a key={index} href={value} target="_blank" rel="noreferrer">{value}</a> : <span key={index}>{value}</span>)}</div></section>}
  </section>;
}
