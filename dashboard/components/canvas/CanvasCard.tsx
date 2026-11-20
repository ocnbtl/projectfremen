"use client";
import { createContext, memo, useContext } from "react";
import { Handle, NodeResizer, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { IconArrowUpRight, IconCheck, IconPencil } from "@tabler/icons-react";
import type { CanvasNode } from "../../lib/modules/canvas/model";
import Icon from "../icons/UnigentamosIcon";
import { CanvasMediaThumbnail,canvasModuleIcons } from "./CanvasIntake";
import { colors } from "./board-layout";
import css from "./CanvasEditor.module.css";

export type FlowCard = Node<{item:CanvasNode;focus:boolean;inspectOriginal:boolean},"card">;
export const BoardActions=createContext({
  resize:(_id:string,_rect:{x:number;y:number;width:number;height:number})=>{},
  edit:(_id:string)=>{},open:(_id:string)=>{},originalLoaded:(_id:string,_width:number,_height:number)=>{}
});

export const CanvasCard=memo(function CanvasCard({data,selected,id}:NodeProps<FlowCard>) {
  const {item,focus,inspectOriginal}=data, actions=useContext(BoardActions);
  const tint=colors[item.color as keyof typeof colors] || colors.paper;
  const target=item.ref,media=target?.module==="media";
  const detailed=useStore(state=>{
    const pixels=Math.max(item.width,item.height)*state.transform[2]*(window.devicePixelRatio || 1);
    return pixels>400 || Boolean(item.imageSize && pixels>=Math.max(item.imageSize.width,item.imageSize.height));
  });
  const title=item.title || target?.label || (item.kind==="sticky"?"Sticky note":item.kind==="highlight"?"Highlight":"Text");
  return <div className={css.card} data-kind={item.kind} data-media={media||undefined} data-focus={focus||undefined} style={{"--tint":tint} as React.CSSProperties}
    onDoubleClick={event=>{if(!(event.target as HTMLElement).closest("a,button"))actions.edit(id);}}>
    <NodeResizer isVisible={selected && !focus} keepAspectRatio={media} minWidth={media?1:138} minHeight={media?1:76} maxWidth={100000} maxHeight={100000}
      onResizeEnd={(_,rect)=>actions.resize(id,rect)}/>
    <Handle type="target" position={Position.Left} aria-label="Incoming connection"/>
    <Handle type="source" position={Position.Right} aria-label="Outgoing connection"/>
    {media ? <a className={css.art} href={target.route} target="_blank" rel="noopener noreferrer" draggable={false} aria-label={"Open media "+target.label}>
      <CanvasMediaThumbnail target={target} full={detailed || (inspectOriginal && !item.imageSize)} onOriginal={(w,h)=>actions.originalLoaded(id,w,h)}/>
    </a> : <div className={css.copy}>
      {target && <Icon role={canvasModuleIcons[target.module]} size={20}/>}
      <span>{item.body || (target && !focus ? target.objectType.replaceAll("_"," ") : title)}</span>
    </div>}
    {!focus && <div className={css.itemFooter} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
      <div className={css.itemControls}>
        <strong title={title}>{title}</strong>
        {item.used && <IconCheck className={css.usedMark} aria-label="Used"/>}
        <button type="button" className="nodrag nopan" aria-label={"Edit "+title} title="Edit" onClick={()=>actions.edit(id)}><IconPencil/></button>
        {target ? <a className="nodrag nopan" aria-label={"Open "+title} title="Open" href={target.route} target="_blank" rel="noopener noreferrer"><IconArrowUpRight/></a> :
          <button type="button" className="nodrag nopan" aria-label={"Open "+title} title="Open" onClick={()=>actions.open(id)}><IconArrowUpRight/></button>}
      </div>
      {media && item.body && <span className={css.caption} title={item.body}>{item.body}</span>}
    </div>}
  </div>;
});
