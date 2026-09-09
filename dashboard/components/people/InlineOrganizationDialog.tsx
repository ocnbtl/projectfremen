"use client";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { PersonalRecord } from "../../lib/personal-records-store";
import { peopleCreateInputToLegacy } from "../../lib/modules/people/legacy-adapter";
import { ORGANIZATION_TYPES, ORGANIZATION_AUTOFILL_LABELS, ORGANIZATION_LINK_FIELDS, emptyOrganizationSuggestions, type OrganizationAutofillValues } from "../../lib/modules/people/organization-autofill";
import { normalizeOrganizationIndustry, organizationIndustryOptions } from "../../lib/modules/people/organization-industries";
import OrganizationAutofill from "./OrganizationAutofill";
import TeamSizeInput from "./TeamSizeInput";
import PeopleProfilePhotoDialog, { PeopleProfileAvatar } from "./PeopleProfilePhoto";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";

/** An independent draft layered over the person editor; parent state never unmounts. */
export default function InlineOrganizationDialog({existingIds,onSaved,onClose}:{existingIds:string[];onSaved:(record:PersonalRecord,records:PersonalRecord[])=>void;onClose:()=>void}) {
  const [values,setValues]=useState<OrganizationAutofillValues>({});
  const [photo,setPhoto]=useState(""),[photoOpen,setPhotoOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[discard,setDiscard]=useState(false);
  const locked=useRef(false);
  const change=(field:keyof OrganizationAutofillValues,value:string)=>setValues(current=>({...current,[field]:value}));
  const close=()=>{if(locked.current)return; if(Object.values(values).some(Boolean)||photo)setDiscard(true);else onClose();};
  async function save(event:React.FormEvent) {
    event.preventDefault(); if(locked.current || !values.name?.trim())return; locked.current=true;setBusy(true);setError("");
    try {
      const {name,headquarters,streetAddress,...fields}=values;
      const profile={...fields,fullName:name!.trim(),industry:normalizeOrganizationIndustry(values.organizationType || "",values.industry || ""),headquarters:headquarters || "",address:streetAddress || "",notes:"",locations:headquarters || streetAddress?[{id:crypto.randomUUID(),label:"Headquarters",location:headquarters || "",address:streetAddress || ""}]:[]};
      const input=peopleCreateInputToLegacy({fullName:name!.trim(),type:"organization",status:"active",context:values.context,profile,areas:["Relationships"],subjects:[],projects:[],externalSources:ORGANIZATION_LINK_FIELDS.map(key=>values[key] || "").filter(Boolean),sourceUrl:values.website});
      const response=await fetch("/api/personal/records",{method:"POST",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({...input,initialPhoto:photo || undefined})});
      const payload=await response.json();if(!response.ok || !payload.ok || !Array.isArray(payload.items))throw new Error(payload.error || "Organization could not be saved.");
      const records=payload.items as PersonalRecord[];
      const created=records.find(record=>record.className === "org" && !existingIds.includes(record.id) && record.title === name!.trim());
      if(!created)throw new Error("The organization was saved. Close this panel and refresh the organization list before trying again.");
      onSaved(created,records);
    } catch(reason){setError(reason instanceof Error?reason.message:"Could not save. Your draft is still here.");} finally{locked.current=false;setBusy(false);}
  }
  return <Dialog.Root open onOpenChange={open=>{if(!open)close();}}><Dialog.Portal><Dialog.Overlay className="people-inline-org-overlay"/><Dialog.Content className="people-inline-org-dialog" onEscapeKeyDown={event=>{event.preventDefault();event.stopImmediatePropagation();if(photoOpen){setPhotoOpen(false);return;}close();}} onInteractOutside={event=>event.preventDefault()}>
    <form onSubmit={save}><header><div><Dialog.Title>New organization</Dialog.Title><Dialog.Description>Save this organization to return to your person draft.</Dialog.Description></div><button type="button" aria-label="Close new organization" onClick={close} disabled={busy}><UnigentamosIcon role="close" size={18}/></button></header>
      <fieldset disabled={busy} className="people-inline-org-fields">
        <button type="button" className="people-inline-org-photo" aria-label="Add organization picture" onClick={()=>setPhotoOpen(true)}><PeopleProfileAvatar label={values.name || "Organization"} initials={(values.name || "O").slice(0,1)} photoUrl={photo} compact/><span>{photo?"Edit picture":"Add picture"}</span></button>
        <label className="is-wide">Organization name<input required value={values.name || ""} onChange={event=>change("name",event.target.value)}/></label>
        <label>Organization type<SelectField value={values.organizationType || ""} onChange={event=>setValues(current=>({...current,organizationType:event.target.value,industry:normalizeOrganizationIndustry(event.target.value,current.industry || "")}))}><option value="">Select type</option>{ORGANIZATION_TYPES.map(type=><option key={type} value={type}>{type}</option>)}</SelectField></label>
        <label>Industry or field<SelectField searchable value={values.industry || ""} onChange={event=>change("industry",event.target.value)}><option value="">Select industry</option>{organizationIndustryOptions(values.organizationType || "").map(industry=><option key={industry} value={industry}>{industry}</option>)}</SelectField></label>
        <label>Founded year<input inputMode="numeric" pattern="\d{4}" value={values.foundedYear || ""} onChange={event=>change("foundedYear",event.target.value)}/></label>
        <label>Team size<TeamSizeInput value={values.teamSize || ""} onChange={value=>change("teamSize",value)}/></label>
        <label className="is-wide">Description<textarea rows={2} value={values.context || ""} onChange={event=>change("context",event.target.value)}/></label>
        <div className="people-inline-org-links-heading is-wide"><h4>Links</h4><OrganizationAutofill name={values.name || ""} values={values} disabled={busy} hasPhoto={!!photo} onPhoto={setPhoto} onApply={suggestions=>setValues(current=>{const next={...current};emptyOrganizationSuggestions(suggestions,current).forEach(item=>{next[item.field]=item.value;});next.industry=normalizeOrganizationIndustry(next.organizationType || "",next.industry || "");return next;})}/></div>
        {ORGANIZATION_LINK_FIELDS.map(field=><label key={field}>{ORGANIZATION_AUTOFILL_LABELS[field]}<input value={values[field] || ""} onChange={event=>change(field,event.target.value)} placeholder="https://…"/></label>)}
        <label className="is-wide">Headquarters<input value={values.headquarters || ""} onChange={event=>change("headquarters",event.target.value)}/></label>
        <label className="is-wide">Street address<input value={values.streetAddress || ""} onChange={event=>change("streetAddress",event.target.value)}/></label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {discard && <div className="people-inline-discard" role="alert"><span>Discard this organization draft?</span><button type="button" onClick={()=>setDiscard(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard organization</button></div>}
      <footer><button type="button" onClick={close} disabled={busy}>Cancel</button><button type="submit" disabled={busy || !values.name?.trim()}>{busy?"Saving…":"Save organization"}</button></footer>
    </form>
    <PeopleProfilePhotoDialog open={photoOpen} personId="" personName={values.name || "Organization"} hasPhoto={!!photo} onClose={()=>setPhotoOpen(false)} onSaved={async()=>true} onRemoved={async()=>{setPhoto("");return true;}} onPrepared={data=>{setPhoto(data);setPhotoOpen(false);}}/>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
