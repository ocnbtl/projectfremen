"use client";
import { createContext, memo, useContext } from "react";
import { Handle, NodeResizer, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { IconCheck, IconLock } from "@tabler/icons-react";
import type { CanvasNode } from "../../lib/modules/canvas/model";
import Icon from "../icons/UnigentamosIcon";
import { CanvasMediaThumbnail,canvasModuleIcons } from "./CanvasIntake";
import { CanvasItemMenu } from "./CanvasItemMenu";
import { colors } from "./board-layout";
import css from "./CanvasEditor.module.css";
import styles from "./CanvasItem.module.css";

export type FlowCard = Node<{item:CanvasNode;focus:boolean;inspectOriginal:boolean},"card">;
export const BoardActions=createContext({
  resize:(_id:string,_rect:{x:number;y:number;width:number;height:number})=>{},
  appearance:(_id:string,_value:NonNullable<CanvasNode["appearance"]>)=>{},
  style:(_id:string)=>{},
  edit:(_id:string)=>{},open:(_id:string)=>{},originalLoaded:(_id:string,_width:number,_height:number)=>{}
});

export const CanvasCard=memo(function CanvasCard({data,selected,id}:NodeProps<FlowCard>) {
  const {item,focus,inspectOriginal}=data, actions=useContext(BoardActions);
  const tint=item.fillColor || colors[item.color as keyof typeof colors] || colors.paper;
  const target=item.ref,media=target?.module==="media";
  const detailed=useStore(state=>{
    const pixels=Math.max(item.width,item.height)*state.transform[2]*(window.devicePixelRatio || 1);
    return pixels>400 || Boolean(item.imageSize && pixels>=Math.max(item.imageSize.width,item.imageSize.height));
  });
  const title=item.title || target?.label || "";
  const placeholder=item.kind==="sticky"?"Sticky note":item.kind==="highlight"?"Highlight":"";
  const body=item.body || (target && !focus ? target.objectType.replaceAll("_"," ") : title || placeholder);
  const label=title || item.body.trim().split(/\r?\n/,1)[0].slice(0,80);
  const compact=useStore(state=>item.width*state.transform[2]<100);
  return <div className={`${css.card} ${styles.item}`} data-kind={item.kind} data-media={media||undefined} data-focus={focus||undefined} data-appearance={item.appearance} data-compact={compact||undefined} style={{"--tint":tint,"--frame-stroke":item.strokeColor,"--frame-width":item.strokeWidth===undefined?undefined:item.strokeWidth+"px"} as React.CSSProperties}
    onDoubleClick={event=>{if(!focus && !(event.target as Element).closest("a,button"))actions.edit(id);}}>
    <NodeResizer isVisible={selected && !focus && !item.locked} keepAspectRatio={media} minWidth={media?1:138} minHeight={media?1:76} maxWidth={100000} maxHeight={100000}
      onResizeEnd={(_,rect)=>actions.resize(id,rect)}/>
    <Handle type="target" position={Position.Left} aria-label="Incoming connection"/>
    <Handle type="source" position={Position.Right} aria-label="Outgoing connection"/>
    {media ? <div className={css.art} role="img" aria-label={target.label}>
      <CanvasMediaThumbnail target={target} full={detailed || (inspectOriginal && !item.imageSize)} onOriginal={(w,h)=>actions.originalLoaded(id,w,h)}/>
    </div> : <div className={css.copy}>
      {target && <Icon role={canvasModuleIcons[target.module]} size={20}/>}
      {body && <span>{body}</span>}
    </div>}
    {!focus && <div className={styles.footer}>
      <div className={styles.metadata}>
        {title && (media || title!==body) && <strong title={title}>{title}</strong>}
        {item.used && <IconCheck size={14} className={styles.used} aria-label="Used"/>}
        {item.locked && <IconLock size={14} aria-label="Position locked"/>}
      </div>
      <CanvasItemMenu item={item} label={label} edit={()=>actions.edit(id)} open={()=>actions.open(id)} style={()=>actions.style(id)} setAppearance={value=>actions.appearance(id,value)}/>
      {media && item.body && <span className={styles.caption} title={item.body}>{item.body}</span>}
    </div>}
  </div>;
});
