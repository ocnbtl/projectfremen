"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SelectField from "../ui/SelectField";
import { parseRepeatLanguage, repeatPresets, type RepeatRule } from "../../lib/modules/planning/repeat-language";
import { addDays, eventOccurrences, validateEventTime } from "../../lib/modules/planning/calendar-model";
import type { EventFields } from "../../lib/modules/planning/types";
import type { BirthdaySource } from "../../lib/modules/planning/observances";
import styles from "./EventEditorFields.module.css";
import { EventCheckbox } from "./EventEditorFields";

export default function EventRepeatField({fields,update,birthdays}: {fields:EventFields;update:<K extends keyof EventFields>(key:K,value:EventFields[K])=>void;birthdays?:BirthdaySource[]}) {
  const initial=fields.recurrence.replace(/;INTERVAL=1(?=;|$)/,"");
  const [custom,setCustom]=useState(Boolean(fields.recurrenceAnchor) || !!initial && !repeatPresets.some(([value])=>value===initial));
  const [text,setText]=useState(""), input=useRef<HTMLInputElement>(null);
  const parsed=useMemo<{rule?:RepeatRule;error?:string}>(()=>{if(!text.trim())return {};try{return {rule:parseRepeatLanguage(text,birthdays)};}catch(e){return {error:(e as Error).message};}},[text,birthdays]);
  const [applied,setApplied]=useState("");
  const pending=custom && (text.trim() ? text!==applied : !fields.recurrence);
  useEffect(()=>{input.current?.setCustomValidity(pending ? "Apply a valid repeat rule or clear the custom text before saving." : "");},[pending]);
  const preview=useMemo(()=>{
    if(!custom)return [];
    const rule=pending?parsed.rule:fields.recurrence?{recurrence:fields.recurrence,recurrenceAnchor:fields.recurrenceAnchor || null}:undefined;
    if(!rule)return [];
    try { const candidate={...fields,...rule};validateEventTime(candidate);return eventOccurrences([{...candidate,id:"preview",createdAt:"",updatedAt:"",exceptions:{}}],fields.start.slice(0,10),addDays(fields.start,366*5),fields.timeZone,birthdays).slice(0,3).map(e=>new Date(`${e.start.slice(0,10)}T12:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})); }catch{return [];}
  },[fields,birthdays,parsed.rule,pending,custom]);
  function select(value:string) { if(value==="custom"){setCustom(true);return;}setCustom(false);setText("");setApplied("");update("recurrenceAnchor",null);update("recurrence",value); }
  return <div className={styles.repeatArea}>
    <div className={styles.optionRow}><EventCheckbox label="Repeat" checked={custom || !!fields.recurrence} onChange={checked=>select(checked?"FREQ=DAILY":"")} />
      <SelectField aria-label="Repeat schedule" value={custom?"custom":initial} onChange={e=>select(e.target.value)}>{repeatPresets.map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="custom">Custom…</option></SelectField>
    </div>
    {custom && <div className={styles.customRepeat}>
      <div className={styles.repeatInput}><input ref={input} aria-label="Custom repeat rule" maxLength={300} value={text} placeholder="Every 17 days, or 3 days before Jonathan’s birthday" onChange={e=>setText(e.target.value)} /><button type="button" disabled={!parsed.rule || !pending} onClick={()=>{if(parsed.rule){update("recurrenceAnchor",parsed.rule.recurrenceAnchor);update("recurrence",parsed.rule.recurrence);setApplied(text);}}}>Apply</button></div>
      <small role="status">{parsed.error || parsed.rule?.label || (fields.recurrenceAnchor ? `Every year ${fields.recurrenceAnchor.offsetDays ? `${Math.abs(fields.recurrenceAnchor.offsetDays)} days ${fields.recurrenceAnchor.offsetDays<0?"before":"after"}` : "on"} ${fields.recurrenceAnchor.label}` : fields.recurrence ? `Saved rule: ${fields.recurrence}` : "Describe when this event should repeat.")}</small>
      {fields.recurrenceAnchor?.personId && !pending && <small>Follows the birthday saved in People. If it is removed, repeats pause.</small>}
      {!!preview.length && <small>Next: {preview.join(" · ")}</small>}
      {pending && parsed.rule && <small>Apply this rule to use these dates.</small>}
    </div>}
  </div>;
}
