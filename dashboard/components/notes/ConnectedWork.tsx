"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export type ConnectedWorkItem={id:string;title:string;objectType:"goal"|"decision"|"follow_up";lifecycle:string;updatedAt:string;description:string;status:string;summary:string};
import {personalStatusLabel} from "../../lib/modules/personal-ops/status-display";
import {PersonalOpsStatusChip,personalOpsToneForState} from "../personal-ops/PersonalOpsPrimitives";
import {createNativeObjectRef} from "../../lib/native-objects/routes";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./ConnectedWork.module.css";
export default function ConnectedWork({items,query}:{items:ConnectedWorkItem[];query:string}){
 const [type,setType]=useState("all"),router=useRouter();
 const visible=items.filter(i=>i.lifecycle!=="archived"&&(type==="all"||i.objectType===type)&&`${i.title} ${i.description} ${i.objectType}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 return <section className={styles.section} aria-label="Connected Personal work"><header><h2><UnigentamosIcon role="link" size={17}/>Connected work</h2><div role="group" aria-label="Connected work types">{[['all','All'],['goal','Goals'],['decision','Decisions'],['follow_up','Follow-ups']].map(([value,label])=><button type="button" key={value} aria-pressed={type===value} onClick={()=>setType(value)}>{label}</button>)}</div></header><div className={styles.cards}>{visible.map(item=>{const status=item.status;const ref=createNativeObjectRef({module:"personal_ops",objectType:item.objectType,objectId:item.id,label:item.title});return <button className={styles.card} type="button" key={item.id} onClick={()=>router.push(ref.route)}><span className={styles.title}><UnigentamosIcon role={item.objectType==="follow_up"?"follow-up":item.objectType} size={18}/>{item.title}</span><span className={styles.meta}>{item.objectType==="follow_up"?"Follow-up":item.objectType==="goal"?"Goal":"Decision"}<PersonalOpsStatusChip tone={personalOpsToneForState(status)}>{personalStatusLabel(status)}</PersonalOpsStatusChip></span><span>{item.summary}</span></button>;})}</div>{!visible.length&&<p>No matching connected work.</p>}</section>;
}
