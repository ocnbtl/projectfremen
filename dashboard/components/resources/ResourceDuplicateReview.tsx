"use client";
import { useEffect, useState } from "react";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { ResourceMark } from "./ResourceVisual";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import { createResourcesRepository } from "../../lib/modules/resources/repository";
import { duplicateMemberSignature, duplicateReviewMatches, type ResourceDuplicateEvidenceIndex, type ResourceExactUrlCollisionGroup } from "../../lib/modules/resources/duplicate-evidence";
import styles from "./ResourceDuplicateReview.module.css";

export default function ResourceDuplicateReview({resources,evidence,query="",onOpen,onSaved,onDone}: {resources:ResourceRecord[];evidence:ResourceDuplicateEvidenceIndex;query?:string;onOpen:(resource:ResourceRecord)=>void;onSaved:(resource:ResourceRecord)=>void;onDone:()=>void}) {
  const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[archive,setArchive]=useState<ResourceRecord|null>(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  async function review(group:ResourceExactUrlCollisionGroup,undo=false) {
    const owner=undo ? resources.find(resource=>resource.duplicateReviews?.some(item=>duplicateReviewMatches(item,group,resources))) : resources.find(resource=>resource.id===[...group.members.map(member=>member.resourceId)].sort()[0]);
    if(!owner)return;setBusy(true);setError("");
    try {
      const reviews=(owner.duplicateReviews || []).filter(item=>item.matchKey!==group.matchKey);
      if(!undo)reviews.push({matchKey:group.matchKey,members:group.members.map(member=>duplicateMemberSignature(resources.find(item=>item.id===member.resourceId)!)),reviewedAt:new Date().toISOString()});
      const result=await createResourcesRepository().update(owner.id,{duplicateReviews:reviews,expectedUpdatedAt:owner.updatedAt});
      if(!result.ok)throw Error(result.error.message);onSaved(result.data);
    } catch(error){setError(error instanceof Error?error.message:"Could not save this review. Try again.");}finally{setBusy(false);}
  }
  async function archiveResource(){if(!archive)return;setBusy(true);setError("");try{const result=await createResourcesRepository().update(archive.id,{action:"archive",archiveReason:"Reviewed as a duplicate",expectedUpdatedAt:archive.updatedAt});if(!result.ok)throw Error(result.error.message);onSaved(result.data);setArchive(null);}catch(error){setError(error instanceof Error?error.message:"Could not archive this resource.");}finally{setBusy(false);}}
  const groups=(reviewed?evidence.reviewedGroups:evidence.groups).filter(group=>`${group.matchKey} ${group.members.map(member=>member.target.label).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={styles.review} aria-label="Resource duplicate review" data-ready={ready}>
    <header><div className={styles.summary} data-warning={evidence.groups.length>0}><UnigentamosIcon role={evidence.groups.length?"duplicates-warning":"duplicates"} size={24}/><div><h2>{evidence.groups.length?`${evidence.groups.length} possible duplicate ${evidence.groups.length===1?"group":"groups"}`:"No duplicates to review"}</h2><p>A shared URL can mean different icons or resources from the same source.</p></div></div><WorkspaceButton onClick={onDone}>Done</WorkspaceButton></header>
    <div className={styles.tabs} role="group" aria-label="Duplicate review scope"><button type="button" aria-pressed={!reviewed} onClick={()=>setReviewed(false)}>Needs review <span>{evidence.groups.length}</span></button><button type="button" aria-pressed={reviewed} onClick={()=>setReviewed(true)}>Kept separate <span>{evidence.reviewedGroups.length}</span></button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.groups}>{groups.map(group=><article key={group.matchKey}><header><div><strong>{group.displayDomain}</strong><small title={group.matchKey}>{group.matchKey}</small></div><WorkspaceButton icon={reviewed?"undo":"check"} disabled={busy} onClick={()=>void review(group,reviewed)}>{reviewed?"Review again":"Keep separate"}</WorkspaceButton></header><div className={styles.members}>{group.members.map(member=>{const resource=resources.find(item=>item.id===member.resourceId)!;return <div key={member.resourceId}><button type="button" className={styles.identity} onClick={()=>onOpen(resource)}><ResourceMark gradient={resource.gradient} resource={resource} imageUrl={resource.metadata.imageUrl}/><span><strong>{resource.title}</strong><small>{resource.type === "unknown"?"Resource":resource.type.replaceAll("_"," ")}</small></span><UnigentamosIcon role="chevron-right" size={16}/></button><button type="button" className={styles.archive} aria-label={`Archive duplicate ${resource.title}`} title="Archive this duplicate" disabled={busy} onClick={()=>{setError("");setArchive(resource);}}><UnigentamosIcon role="archive" size={17}/></button></div>;})}</div></article>)}</div>
    {!groups.length && <p className={styles.empty}>{query?"No matching groups. Try another search.":reviewed?"Groups you keep separate will appear here. You can review them again at any time.":"No matching URLs need review. New matches will appear here."}</p>}
    <p className={styles.note}>Keep separate preserves every record and link. A changed name or a new matching resource reopens the group for review.</p>
    <WorkspaceSheet open={Boolean(archive)} onClose={()=>{if(!busy)setArchive(null);}} title="Archive duplicate?" titleIcon="archive" presentation="center"><div className={styles.confirm}><p>Archive <strong>{archive?.title}</strong>? Its details and links are kept. You can restore it from Archived resources.</p>{error&&<p role="alert">{error}</p>}<div><WorkspaceButton disabled={busy} onClick={()=>setArchive(null)}>Cancel</WorkspaceButton><WorkspaceButton intent="primary" disabled={busy} onClick={()=>void archiveResource()}>{busy?"Saving…":"Archive resource"}</WorkspaceButton></div></div></WorkspaceSheet>
  </section>;
}
