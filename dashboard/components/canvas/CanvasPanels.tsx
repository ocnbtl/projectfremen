"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { canvasAppearances, defaultCanvasAppearance, type CanvasAppearance, type CanvasEdge, type CanvasNode } from "../../lib/modules/canvas/model";
import SelectField from "../ui/SelectField";
import CopyAdPrompt from "../media/CopyAdPrompt";
import { colors } from "./board-layout";
import { FrameFields,type FrameStyle } from "./FrameFields";
import {displayMediaDetails,linkedMediaId,readCardMedia,writeCardMedia} from "./useCanvasMediaDetails";
import type {MediaText,SharedMediaDetails} from "../../lib/modules/media/shared-details";
import css from "./CanvasEditor.module.css";

export function Panel({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    if (panel.current && !panel.current.contains(document.activeElement)) {
      panel.current.focus({preventScroll:true});
    }
  },[]);
  return <section ref={panel} role="dialog" tabIndex={-1} aria-label={title} className={css.panel} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();close();}}}>
    <header><h3>{title}</h3><button type="button" onClick={close} aria-label="Close panel"><IconX size={17}/></button></header>{children}
  </section>;
}
export function CardFields({node,save,close,restoreSize,children}:{node:CanvasNode;restoreSize?:()=>void;save:(patch:Partial<CanvasNode>)=>void;close:()=>void;children?:ReactNode}){
  const id=linkedMediaId(node);
  const [title,setTitle]=useState(node.title),[body,setBody]=useState(node.body),[notes,setNotes]=useState(node.notes||""),[color,setColor]=useState(node.color);
  const [base,setBase]=useState<SharedMediaDetails>(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0),[publishCaption,setPublishCaption]=useState(false);
  const [publishTitle,setPublishTitle]=useState(false);
  const initial=useRef(node),live=useRef(true);
  const [appearance,setAppearance]=useState(node.appearance);
  const [frame,setFrame]=useState<FrameStyle>({});
  useEffect(()=>{live.current=true;return ()=>{live.current=false;};},[]);
  useEffect(()=>{
    if(!id)return;
    let active=true;
    void readCardMedia(id).then(details=>{
      if(!active)return;
      const display=displayMediaDetails(initial.current,details);
      setTitle(display.title);setBody(display.body);setNotes(details.notes);setBase(details);setError("");setPublishCaption(false);setPublishTitle(false);
    }).catch(e=>{if(active)setError(e.message || "Could not read Media details.");});
    return ()=>{active=false;};
  },[id,retry]);
  const loaded=!id || Boolean(base), canClose=()=>{if(!busy)close();};
  async function apply() {
    if((!loaded && !error) || busy)return;
    const layout={color,...frame,...(appearance || Object.keys(frame).length ? {appearance:appearance??defaultCanvasAppearance(node)} : {})};
    const text={title:title.trim() || node.ref?.label || "",body:body.trim(),notes:notes.trim()};
    setBusy(true);setError("");
    try {
      if(base){
        const display=displayMediaDetails(initial.current,base);
        const patch:Partial<MediaText>={};
        if(text.title!==display.title || publishTitle)patch.title=text.title;
        if(text.body!==display.body || publishCaption)patch.body=text.body;
        if(text.notes!==base.notes)patch.notes=text.notes;
        const updated=Object.keys(patch).length ? await writeCardMedia(base,patch) : base;
        if(!live.current)return;
        save({...layout,...(patch.title!==undefined?{title:updated.title}:{}),...(patch.body!==undefined?{body:updated.body}:{}),...(patch.notes!==undefined?{notes:updated.notes}:{})});
      } else save(id?layout:{...layout,...text});
      close();
    } catch(e) {if(live.current)setError(e instanceof Error?e.message:"Media details could not be saved.");}
    finally {if(live.current)setBusy(false);}
  }
  return <Panel title={node.kind==="object"?"Edit card":"Edit "+node.kind} close={canClose}>
    <form onSubmit={e=>{e.preventDefault();void apply();}}>
      {id && !loaded && !error && <p role="status">Loading Media details…</p>}
      {error && <div role="alert">{error} <button type="button" onClick={()=>{setBase(undefined);setError("");setRetry(n=>n+1);}}>{base?"Discard draft and reload details":"Retry"}</button></div>}
      <label>Title<input autoFocus disabled={!loaded||busy} required={Boolean(id)} value={title} maxLength={240} onChange={e=>setTitle(e.target.value)}/></label>
      {base && title===initial.current.title && displayMediaDetails(initial.current,base).title!==base.title && <label><input type="checkbox" checked={publishTitle} onChange={e=>setPublishTitle(e.target.checked)}/>Save this existing board title to Media</label>}
      <label>{node.kind==="object"?"Caption":"Text"}<textarea disabled={!loaded||busy} rows={3} value={body} maxLength={id?20000:32000} onChange={e=>setBody(e.target.value)}/></label>
      {base && !base.body && !base.captionEdited && initial.current.body && body===initial.current.body && <label><input type="checkbox" checked={publishCaption} onChange={e=>setPublishCaption(e.target.checked)}/>Save this existing board caption to Media</label>}
      <label>Notes<textarea disabled={!loaded||busy} rows={3} maxLength={20000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      {id && loaded && <CopyAdPrompt notes={notes} />}
      {id && <small>Title, caption and notes are shared with Media.</small>}
      {children}
      <label>Appearance<SelectField portalToBody value={appearance ?? defaultCanvasAppearance(node)} onChange={e=>setAppearance(e.target.value as CanvasAppearance)}>
        {Object.entries(canvasAppearances).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </SelectField></label>
      <FrameFields nodes={[{...node,appearance,color}]} draft={frame} onChange={setFrame}/>
      {restoreSize && node.imageSize && <button type="button" onClick={()=>{restoreSize();close();}}>Original size · {node.imageSize.width} × {node.imageSize.height}</button>}
      {node.ref?.module!=="media" && <div className={css.swatches} role="group" aria-label="Card color">{Object.entries(colors).map(([name,hex])=><button type="button" key={name} title={name} aria-label={name} aria-pressed={color===name} style={{background:hex}} onClick={()=>setColor(name)}/>)}</div>}
      <button className={css.primary} type="submit" disabled={(!loaded&&!error)||busy}>{busy?"Saving…":!loaded?"Apply board changes":"Apply"}</button>
    </form></Panel>;
}
export function EdgeFields({edge,save,close}:{edge:CanvasEdge;save:(patch:Partial<CanvasEdge>)=>void;close:()=>void}){
  const [label,setLabel]=useState(edge.label),[style,setStyle]=useState(edge.style),[symbol,setSymbol]=useState(edge.symbol);
  return <Panel title="Edit connection" close={close}><form onSubmit={e=>{e.preventDefault();save({label:label.trim(),style,symbol});close();}}>
    <label>Label<input autoFocus maxLength={120} value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Inspired by"/></label>
    <div className={css.two}><label>Line<SelectField portalToBody value={style} onChange={e=>setStyle(e.target.value as CanvasEdge["style"])}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></SelectField></label>
    <label>Endpoint<SelectField portalToBody value={symbol} onChange={e=>setSymbol(e.target.value as CanvasEdge["symbol"])}><option value="arrow">Arrow</option><option value="circle">Circle</option><option value="none">None</option></SelectField></label></div>
    <button className={css.primary} type="submit">Apply</button></form></Panel>;
}
