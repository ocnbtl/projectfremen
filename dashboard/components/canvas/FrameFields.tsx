"use client";
import { useId } from "react";
import { defaultCanvasAppearance, type CanvasNode } from "../../lib/modules/canvas/model";
import { colors } from "./board-layout";
import css from "./CanvasEditor.module.css";

export type FrameStyle = Pick<CanvasNode,"strokeColor"|"strokeWidth"|"fillColor">;

export function withFrame(node:CanvasNode,draft:FrameStyle):CanvasNode{
  const appearance=node.appearance??defaultCanvasAppearance(node);
  if(appearance==="plain")return node;
  const {fillColor,...border}=draft;
  return {...node,appearance,...border,...(fillColor && appearance==="card"?{fillColor}:{})};
}

export function FrameFields({nodes,draft,onChange}:{nodes:CanvasNode[];draft:FrameStyle;onChange:(value:FrameStyle)=>void}){
  const id=useId();
  const framed=nodes.filter(n=>(n.appearance??defaultCanvasAppearance(n))!=="plain");
  if(!framed.length)return null;
  const cards=framed.filter(n=>(n.appearance??defaultCanvasAppearance(n))==="card");
  const first=framed[0],card=cards[0];
  const widthFor=(n:CanvasNode)=>n.strokeWidth??(n.appearance==="outline"?(n.ref?.module==="media"?2:1.5):1);
  const width=draft.strokeWidth??widthFor(first);
  const stroke=draft.strokeColor??first.strokeColor??"#607587";
  const fill=draft.fillColor??card?.fillColor??colors[card?.color as keyof typeof colors]??colors.paper;
  return <fieldset className={css.frameFields}><legend>Frame</legend>
    <div className={css.frameSample} aria-hidden="true"><i style={{borderWidth:width,borderColor:stroke,background:card?fill:"transparent"}}/></div>
    <div className={css.pickers}>
      <label>Border color<input type="color" value={stroke} onChange={e=>onChange({...draft,strokeColor:e.target.value})}/></label>
      {card && <label>Card fill<input type="color" value={fill} onChange={e=>onChange({...draft,fillColor:e.target.value})}/></label>}
    </div>
    <label htmlFor={id}>Border thickness <output>{width} px</output></label>
    <input id={id} type="range" min="0" max="32" step=".5" value={width} onChange={e=>onChange({...draft,strokeWidth:e.target.valueAsNumber})}/>
  </fieldset>;
}
