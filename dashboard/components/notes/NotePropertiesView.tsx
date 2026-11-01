"use client";
import type { NotePropertyReadiness } from "../../lib/modules/notes/property-readiness";
import type { NoteRecord } from "../../lib/modules/notes/types";
import { formatNoteReviewCadence } from "../../lib/modules/notes/review-schedule";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./NoteDetails.module.css";
type Context={retainedRelationCount:number;sourceCandidateCount:number;resolvedOwnerTargetCount:number;unresolvedReferenceCount:number};
type Props={note:NoteRecord;readiness:NotePropertyReadiness;context:Context;nativeLinkCount:number;onEditProperties:()=>void;onOpenTab?:(tab:"body"|"links"|"review")=>void;onScheduleReview?:()=>void;onOpenProperties?:()=>void};
const label=(s:string)=>s.replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase());
const date=(s?:string)=>s?new Date(s.length===10?s+"T12:00":s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"Not scheduled";
export function NotePropertiesSummary(props:Props){return <NotePropertiesView {...props}/>;}
export default function NotePropertiesView({note,nativeLinkCount,onEditProperties,onScheduleReview,onOpenTab}:Props){
 const facts=[{icon:"module-notes",label:"Type",value:label(note.type)},{icon:"active",label:"Status",value:label(note.lifecycleStatus)},{icon:"lock",label:"Privacy",value:label(note.privacy)},{icon:"calendar",label:"Created",value:date(note.createdAt)},{icon:"edit",label:"Updated",value:date(note.updatedAt)},{icon:"link",label:"Linked objects",value:String(nativeLinkCount)}];
 return <div className={styles.surface}><section className={styles.panel}><header><h2><UnigentamosIcon role="sliders" size={18}/>Properties</h2><button type="button" onClick={onEditProperties}><UnigentamosIcon role="edit" size={15}/>Edit properties</button></header><dl className={styles.facts}>{facts.map(f=><div key={f.label}><dt><UnigentamosIcon role={f.icon} size={15}/>{f.label}</dt><dd>{f.value}</dd></div>)}</dl><div className={styles.tags}>{[...note.areas,...note.subjects].map((tag,i)=><span key={tag+i}>{tag}</span>)}</div></section><section className={styles.panel}><header><h2><UnigentamosIcon role="calendar" size={18}/>Review</h2>{onScheduleReview&&<button type="button" onClick={onScheduleReview}>{note.nextReviewAt?"Edit schedule":"Schedule review"}</button>}</header><dl className={styles.facts}><div><dt>Next review</dt><dd>{date(note.nextReviewAt)}</dd></div><div><dt>Repeat</dt><dd>{formatNoteReviewCadence(note.reviewCadence)}</dd></div><div><dt>Status</dt><dd>{label(note.reviewState)}</dd></div></dl>{onOpenTab&&<button type="button" onClick={()=>onOpenTab("review")}>Open review</button>}</section></div>;
}
