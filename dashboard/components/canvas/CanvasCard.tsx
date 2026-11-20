"use client";
import { createContext, memo, useContext } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { IconArrowUpRight, IconCheck, IconPaperclip } from "@tabler/icons-react";
import type { CanvasNode } from "../../lib/modules/canvas/model";
import { CanvasMediaThumbnail } from "./CanvasIntake";
import { colors } from "./board-layout";
import css from "./CanvasEditor.module.css";

export type FlowCard = Node<{item:CanvasNode},"card">;
export const BoardActions=createContext({
  resize:(_id:string,_rect:{x:number;y:number;width:number;height:number})=>{},
  edit:(_id:string)=>{}
});
export const CanvasCard=memo(function CanvasCard({data,selected,id}:NodeProps<FlowCard>) {
  const {item}=data, actions=useContext(BoardActions);
  const tint=colors[item.color as keyof typeof colors] || colors.paper;
  const target=item.ref;
  return <div className={css.card} data-kind={item.kind} data-used={item.used||undefined} style={{"--tint":tint} as React.CSSProperties}
    onDoubleClick={event=>{if(!(event.target as HTMLElement).closest("a"))actions.edit(id);}}>
    <NodeResizer isVisible={selected} minWidth={138} minHeight={76} maxWidth={1400} maxHeight={1000}
      onResizeEnd={(_,rect)=>actions.resize(id,rect)}/>
    <Handle type="target" position={Position.Left} aria-label="Incoming connection"/>
    <Handle type="source" position={Position.Right} aria-label="Outgoing connection"/>
    {target && <div className={css.objectBar}><span><IconPaperclip size={14}/>{target.objectType.replace(/_/g," ")}</span><a className="nodrag nopan" href={target.route} target="_blank" rel="noopener noreferrer" title={"Open "+target.label} aria-label={"Open "+target.label}><IconArrowUpRight size={17}/></a></div>}
    {target?.module==="media" && <a className={css.thumb+" nodrag nopan"} href={target.route} target="_blank" rel="noopener noreferrer" aria-label={"Open media "+target.label}><CanvasMediaThumbnail target={target}/></a>}
    <div className={css.copy}>
      <strong>{item.title || (item.kind==="sticky"?"Sticky note":item.kind==="highlight"?"Highlight":"Text")}</strong>
      {item.body && <span>{item.body}</span>}
    </div>
    {item.used && <span className={css.used}><IconCheck size={12}/>Used</span>}
  </div>;
});
