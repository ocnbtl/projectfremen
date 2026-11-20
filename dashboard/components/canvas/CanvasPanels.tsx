"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { canvasAppearances, defaultCanvasAppearance, type CanvasAppearance, type CanvasEdge, type CanvasNode } from "../../lib/modules/canvas/model";
import SelectField from "../ui/SelectField";
import { colors } from "./board-layout";
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
export function CardFields({node,save,close,restoreSize}:{node:CanvasNode;restoreSize?:()=>void;save:(patch:Partial<CanvasNode>)=>void;close:()=>void}){
  const [title,setTitle]=useState(node.title),[body,setBody]=useState(node.body),[color,setColor]=useState(node.color);
  const [appearance,setAppearance]=useState(node.appearance);
  return <Panel title={node.kind==="object"?"Edit card":"Edit "+node.kind} close={close}>
    <form onSubmit={e=>{e.preventDefault();save({title:title.trim()||node.ref?.label||"",body:body.trim(),color,...(appearance ? {appearance} : {})});close();}}>
      <label>Title<input autoFocus value={title} maxLength={240} onChange={e=>setTitle(e.target.value)}/></label>
      <label>{node.kind==="object"?"Caption":"Text"}<textarea rows={3} value={body} maxLength={4000} onChange={e=>setBody(e.target.value)}/></label>
      <label>Appearance<SelectField portalToBody value={appearance ?? defaultCanvasAppearance(node)} onChange={e=>setAppearance(e.target.value as CanvasAppearance)}>
        {Object.entries(canvasAppearances).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </SelectField></label>
      {restoreSize && node.imageSize && <button type="button" onClick={()=>{restoreSize();close();}}>Original size · {node.imageSize.width} × {node.imageSize.height}</button>}
      {node.ref?.module!=="media" && <div className={css.swatches} role="group" aria-label="Card color">{Object.entries(colors).map(([name,hex])=><button type="button" key={name} title={name} aria-label={name} aria-pressed={color===name} style={{background:hex}} onClick={()=>setColor(name)}/>)}</div>}
      <button className={css.primary} type="submit">Apply</button>
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
