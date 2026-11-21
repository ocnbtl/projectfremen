"use client";
import { createContext, memo, useContext, useState } from "react";
import { Handle, NodeResizer, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { IconCheck, IconLock } from "@tabler/icons-react";
import type { CanvasNode } from "../../lib/modules/canvas/model";
import Icon from "../icons/UnigentamosIcon";
import { canvasModuleIcons } from "./CanvasIntake";
import { PinImage, PinMarkers } from "./ImagePins";
import { CanvasItemMenu } from "./CanvasItemMenu";
import { colors } from "./board-layout";
import { maxCardSize, minCardSize } from "./alignment";
import css from "./CanvasEditor.module.css";
import styles from "./CanvasItem.module.css";

export type FlowCard = Node<{item:CanvasNode;focus:boolean;inspectOriginal:boolean},"card">;
type Layout=Pick<CanvasNode,"x"|"y"|"width"|"height">;
export const BoardActions=createContext({
  startResize:(_id:string,_rect:Layout)=>{},
  resize:(_id:string,_rect:Layout,_finished:boolean)=>{},
  appearance:(_id:string,_value:NonNullable<CanvasNode["appearance"]>)=>{},
  style:(_id:string)=>{},
  pins:(_id:string,_pinId?:string)=>{},
  edit:(_id:string)=>{},open:(_id:string)=>{},originalLoaded:(_id:string,_width:number,_height:number)=>{}
});

export const CanvasCard=memo(function CanvasCard({data,selected,id}:NodeProps<FlowCard>) {
  const {item,focus,inspectOriginal}=data, actions=useContext(BoardActions);
  const [imageAvailable,setImageAvailable]=useState(false);
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
    <NodeResizer isVisible={selected && !focus && !item.locked} keepAspectRatio={media} minWidth={media?1:minCardSize.width} minHeight={media?1:minCardSize.height} maxWidth={maxCardSize} maxHeight={maxCardSize}
      onResizeStart={(_,rect)=>actions.startResize(id,rect)} onResize={(_,rect)=>actions.resize(id,rect,false)}
      onResizeEnd={(_,rect)=>actions.resize(id,rect,true)}/>
    <Handle type="target" position={Position.Left} aria-label="Incoming connection"/>
    <Handle type="source" position={Position.Right} aria-label="Outgoing connection"/>
    {media ? <PinImage target={target} full={detailed || (inspectOriginal && !item.imageSize)} onAvailability={setImageAvailable} onOriginal={(w,h)=>actions.originalLoaded(id,w,h)}>
      {!focus && Boolean(item.imagePins?.length) && <PinMarkers pins={item.imagePins!} open={pinId=>actions.pins(id,pinId)}/>}
    </PinImage> : <div className={css.copy}>
      {target && <Icon role={canvasModuleIcons[target.module]} size={20}/>}
      {body && <span>{body}</span>}
    </div>}
    {!focus && <div className={styles.footer}>
      <div className={styles.metadata}>
        {title && (media || title!==body) && <strong title={title}>{title}</strong>}
        {item.used && <IconCheck size={14} className={styles.used} aria-label="Used"/>}
        {item.locked && <IconLock size={14} aria-label="Position locked"/>}
      </div>
      <CanvasItemMenu item={item} label={label} edit={()=>actions.edit(id)} open={()=>actions.open(id)} style={()=>actions.style(id)} setAppearance={value=>actions.appearance(id,value)}
        pins={imageAvailable || item.imagePins?.length?()=>actions.pins(id):undefined}/>
      {media && item.body && <span className={styles.caption} title={item.body}>{item.body}</span>}
    </div>}
  </div>;
});
