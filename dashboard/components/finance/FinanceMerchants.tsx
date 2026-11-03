"use client";
import {createContext,useContext,useState,type ReactNode} from "react";
import Link from "next/link";
import {buildJsonHeadersWithCsrf} from "../../lib/client-csrf";
import {financeOrganization,type FinanceMerchantsData} from "../../lib/modules/finance/merchants";
import type {ObjectLink} from "../../lib/native-objects/links";
import {PeopleProfileAvatar} from "../people/PeopleProfilePhoto";
import InlineOrganizationDialog from "../people/InlineOrganizationDialog";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./FinanceDetails.module.css";
type Kind="transaction"|"bill";
const Context=createContext({organizations:[] as FinanceMerchantsData["organizations"],links:[] as ObjectLink[],setOrganizations:(_items:FinanceMerchantsData["organizations"])=>{},link:async(_kind:Kind,_id:string,_label:string,_organization:string)=>{},unlink:async(_id:string)=>{}});
export const useFinanceMerchants=()=>useContext(Context);
export function FinanceMerchantsProvider({initial,children}:{initial:FinanceMerchantsData;children:ReactNode}){
 const [organizations,setOrganizations]=useState(initial.organizations),[links,setLinks]=useState(initial.links);
 async function unlink(id:string){const response=await fetch('/api/native-links',{method:'DELETE',headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({id,reason:'Changed merchant organization in Finance'})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Could not unlink organization');setLinks(current=>current.filter(item=>item.id!==id));}
 async function link(kind:Kind,id:string,label:string,organizationId:string){const org=organizations.find(item=>item.id===organizationId);if(!org)throw new Error('Choose an available organization');const existing=links.filter(item=>item.source.objectType===kind&&item.source.objectId===id);if(existing.length===1&&existing[0].target.objectId===org.id)return;
 const response=await fetch('/api/native-links',{method:'POST',headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({source:{module:'finance',objectType:kind,objectId:id,label,route:`/admin/finance/${kind==='bill'?'bills':'transactions'}?selected=${encodeURIComponent(id)}`},target:{module:'people',objectType:'organization',objectId:org.id,label:org.title,route:'/admin/people/'+encodeURIComponent(org.id)},relationship:'merchant'})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Could not link organization');setLinks(current=>[...current.filter(item=>item.id!==data.item.id),data.item]);for(const old of existing.filter(item=>item.target.objectId!==org.id))await unlink(old.id);
 }
 return <Context.Provider value={{organizations,links,setOrganizations,link,unlink}}>{children}</Context.Provider>;
}
function useMerchant(kind:Kind,id?:string){const context=useFinanceMerchants();const link=context.links.filter(item=>item.source.objectType===kind&&item.source.objectId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return {context,link,organization:context.organizations.find(item=>item.id===link?.target.objectId)};}
export default function FinanceMerchantAvatar({kind,id,label}:{kind:Kind;id:string;label:string}){const {organization}=useMerchant(kind,id);return <span className={styles.merchantAvatar}>{organization?<PeopleProfileAvatar organization label={organization.title} initials={organization.title.slice(0,2)} photoUrl={organization.photoUrl} photoUpdatedAt={organization.photoUpdatedAt} compact/>:<UnigentamosIcon role="organization" size={21}/>}</span>;}
export function FinanceOrganizationField({kind,recordId}:{kind:Kind;recordId?:string}){
 const {context,organization}=useMerchant(kind,recordId);const [value,setValue]=useState(organization?.id || ''),[create,setCreate]=useState(false);
 return <div className={styles.organizationField}><span>Organization <small>(optional)</small></span><div><SelectField aria-label="Merchant organization" name="merchantOrganizationId" searchable value={value} onChange={event=>setValue(event.target.value)}><option value="">No organization</option>{context.organizations.map(org=><option key={org.id} value={org.id}>{org.title}</option>)}</SelectField><button type="button" title="Create organization" aria-label="Create organization" onClick={()=>setCreate(true)} data-icon-button="standard"><UnigentamosIcon role="plus" size={18}/></button></div>{create&&<InlineOrganizationDialog existingIds={context.organizations.map(org=>org.id)} existingNames={context.organizations.map(org=>org.title)} returnLabel="Finance draft" onClose={()=>setCreate(false)} onSaved={(record,records)=>{context.setOrganizations(records.filter(item=>item.className==='org'&&!item.archivedAt).map(financeOrganization));setValue(record.id);setCreate(false);}}/>}</div>;
}
export function FinanceMerchantPanel({kind,id,label}:{kind:Kind;id:string;label:string}){
 const {context,organization,link}=useMerchant(kind,id),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');const selected=String(new FormData(event.currentTarget).get('merchantOrganizationId')||'');try{if(selected)await context.link(kind,id,label,selected);else if(link)await context.unlink(link.id);setEditing(false);}catch(e){setError(e instanceof Error?e.message:'Could not save organization');}finally{setBusy(false);}}
 return <section className={styles.merchantPanel}><header><h3><UnigentamosIcon role="organization" size={17}/>Organization</h3><button type="button" onClick={()=>setEditing(!editing)} disabled={busy} className="finance-text-action">{editing?'Cancel':organization?'Change':'Link organization'}</button></header>{organization&&!editing&&<Link prefetch={false} href={'/admin/people/'+organization.id}><FinanceMerchantAvatar kind={kind} id={id} label={label}/><span><strong>{organization.title}</strong>{organization.website&&<small>{organization.website.replace(/^https?:\/\//,'').replace(/\/$/,'')}</small>}</span><UnigentamosIcon role="chevron-right" size={17}/></Link>}{editing&&<form onSubmit={save}><FinanceOrganizationField kind={kind} recordId={id}/><button type="submit" className="finance-action is-primary" disabled={busy}>{busy?'Saving…':'Save link'}</button></form>}{error&&<p role="alert">{error}</p>}</section>;
}
