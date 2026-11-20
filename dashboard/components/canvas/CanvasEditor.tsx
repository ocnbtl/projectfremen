"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background, ReactFlow, getViewportForBounds, MarkerType, SelectionMode, ViewportPortal,
  type Edge, type NodeChange, type ReactFlowInstance, type Viewport
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconBookmark, IconCheck,
  IconBoxMultiple, IconAdjustments, IconArrowsMove, IconMagnet, IconFocus2, IconFrame, IconHandStop, IconHighlight, IconLayoutGrid, IconLine, IconMaximize,
  IconMinus, IconNote, IconPlus, IconPointer, IconSelectAll,
  IconTrash, IconTypography, IconUpload, IconX
} from "@tabler/icons-react";
import { defaultCanvasAppearance, canvasAppearances, type Board, type CanvasNode, type CanvasEdge } from "../../lib/modules/canvas/model";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { addObjects, bounds, makeNode, tile, withoutSelection, keyOf } from "./board-layout";
import { snapTranslation,spaceEvenly,type AlignmentGuide } from "./alignment";
import { BoardActions, CanvasCard, type FlowCard } from "./CanvasCard";
import { CanvasObjectPicker, useCanvasMediaImport } from "./CanvasIntake";
import { CardFields, EdgeFields, Panel } from "./CanvasPanels";
import css from "./CanvasEditor.module.css";

type Props={board:Board;entryView?:string;onChange:(board:Board)=>void;onBack:()=>void;saveStatus:string};
type Layout=Pick<CanvasNode,"x"|"y"|"width"|"height">;
const nodeTypes={card:CanvasCard};
const emptySelection:string[]=[];
function Action({name,icon,run,active,disabled,label}:{name:string;icon:ReactNode;run:()=>void;active?:boolean;disabled?:boolean;label?:string}){
  return <button type="button" title={name} aria-label={name} aria-pressed={active} disabled={disabled} onClick={run}>{icon}{label && <span>{label}</span>}</button>;
}
function lastViewport(id:string):Viewport|undefined {
  try {
    const value=JSON.parse(sessionStorage.getItem("personal.canvas.viewport."+id)||"null");
    if(value && [value.x,value.y,value.zoom].every(Number.isFinite) && value.zoom>=.002 && value.zoom<=3)return value;
  } catch {}
}
function isField(el:EventTarget|null){
  return el instanceof HTMLElement && Boolean(el.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=listbox]"));
}
export default function CanvasEditor({board,entryView,onChange,onBack,saveStatus}:Props){
  const latest=useRef(board); latest.current=board;
  const edits=useRef(onChange); edits.current=onChange;
  const previous=useRef<Board[]>([]), next=useRef<Board[]>([]);
  const frame=useRef<HTMLDivElement>(null), uploadInput=useRef<HTMLInputElement>(null);
  const flow=useRef<ReactFlowInstance<FlowCard,Edge>|null>(null);
  const [initialView]=useState(()=>board.views.find(v=>v.id===entryView) || lastViewport(board.id));
  const [zoom,setZoom]=useState(initialView?.zoom||1);
  const viewTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const rememberView=useCallback((view:Viewport)=>{
    clearTimeout(viewTimer.current);
    viewTimer.current=setTimeout(()=>{
      setZoom(view.zoom);
      try{sessionStorage.setItem("personal.canvas.viewport."+board.id,JSON.stringify(view));}catch{}
    },70);
  },[board.id]);
  useEffect(()=>()=>clearTimeout(viewTimer.current),[]);
  const [focus,setFocus]=useState(false);
  const [multiPick,setMultiPick]=useState(false),[snap,setSnap]=useState(true);
  const [guides,setGuides]=useState<AlignmentGuide[]>([]);
  const [arranging,setArranging]=useState(false);
  const arrangeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(arrangeTimer.current),[]);
  const [reading,setReading]=useState("");
  const [hand,setHand]=useState(false),[panel,setPanel]=useState(""),[name,setName]=useState("");
  const [ids,setIds]=useState<string[]>([]),[edgeIds,setEdgeIds]=useState<string[]>([]);
  const [editing,setEditing]=useState(""),[connectFrom,setConnectFrom]=useState("");
  const [notice,setNotice]=useState(""),[drop,setDrop]=useState(false);
  const [live,setLive]=useState<Record<string,Partial<Layout>>>({});
  const pointerDrag=useRef(false);
  const groupDrag=useRef<{clientX:number;clientY:number;items:CanvasNode[]}|null>(null);
  const dropPoint=useRef<{x:number;y:number}|null>(null);
  const selected=board.nodes.filter(n=>ids.includes(n.id)), one=selected.length===1?selected[0]:undefined;
  const edited=board.nodes.find(n=>n.id===editing),edge=board.edges.find(e=>e.id===edgeIds[0]);
  const duration=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:220;
  const change=useCallback((fn:(old:Board)=>Board)=>{
    const old=latest.current,newBoard=fn(old);
    if(newBoard===old)return;
    previous.current=[...previous.current.slice(-34),old];next.current=[];
    latest.current=newBoard;edits.current(newBoard);
  },[]);
  const choose=useCallback((items:string[],lines:string[]=emptySelection)=>{setIds(items);setEdgeIds(lines);},[]);
  function restore(redo=false){
    const from=redo?next:previous,to=redo?previous:next,entry=from.current.pop();
    if(!entry)return;
    const current=latest.current;to.current.push(current);
    const restored={...current,nodes:entry.nodes,edges:entry.edges,views:entry.views};
    latest.current=restored;edits.current(restored);choose([]);setPanel("");setConnectFrom("");
  }
  const place=useCallback(()=>{
    const rect=frame.current?.getBoundingClientRect();
    return rect && flow.current ? flow.current.screenToFlowPosition({x:rect.left+rect.width*.4,y:rect.top+rect.height*.38}):{x:40,y:40};
  },[]);
  const reframe=useCallback((items:string[])=>{
    if(!items.length)return;
    requestAnimationFrame(()=>{
      const area=frame.current, subset=latest.current.nodes.filter(n=>items.includes(n.id));
      if(!area || !subset.length || !flow.current)return;
      const box=bounds(subset);
      const view=getViewportForBounds({...box,height:box.height+48},area.clientWidth,area.clientHeight,.002,1,.2);
      void flow.current.setViewport(view,{duration:duration()});
    });
  },[]);
  const insertObjects=useCallback((refs:NativeObjectRef[],sizes?:Map<string,{width:number;height:number}>)=>{
    const current=latest.current,added=addObjects(current,refs,dropPoint.current||place(),sizes);
    dropPoint.current=null;
    if(!added.length){
      const keys=new Set(refs.map(keyOf)),existing=current.nodes.filter(n=>n.ref&&keys.has(keyOf(n.ref))).map(n=>n.id);
      choose(existing);reframe(existing);setNotice("Already on this board.");return;
    }
    if(current.nodes.length+added.length>1000){setNotice("This board holds up to 1,000 cards. Choose fewer items or start another board.");return;}
    change(b=>({...b,nodes:[...b.nodes,...added]}));choose(added.map(n=>n.id));setPanel("");reframe(added.map(n=>n.id));
  },[change,choose,place,reframe]);
  const media=useCanvasMediaImport(insertObjects);
  function insert(kind:CanvasNode["kind"],point=place(),body=""){
    if(latest.current.nodes.length>=1000){setNotice("This board is full.");return;}
    const node={...makeNode(kind,point),body:body.slice(0,32000)};
    // Keep newly inserted notes reachable when several are added from the toolbar.
    for(let step=0;step<18 && latest.current.nodes.some(n=>Math.abs(node.x-n.x)<30 && Math.abs(node.y-n.y)<30);step++){
      node.x+=34;node.y+=30;
    }
    change(b=>({...b,nodes:[...b.nodes,node]}));choose([node.id]);setEditing(node.id);setPanel(body?"":"card");setHand(false);
  }
  function patchNodes(targets:string[],patch:Partial<CanvasNode>){
    change(b=>({...b,nodes:b.nodes.map(n=>targets.includes(n.id)?{...n,...patch}:n)}));
  }
  const handleResize=useCallback((id:string,rect:Layout)=>{
    const {x,y,width,height}=rect;
    change(b=>({...b,nodes:b.nodes.map(n=>n.id===id?{...n,x,y,width,height}:n)}));
    setLive({});
  },[change]);
  const edit=useCallback((id:string)=>{setEditing(id);choose([id]);setPanel("card");},[choose]);
  const originalLoaded=useCallback((id:string,width:number,height:number)=>{
    const current=latest.current, item=current.nodes.find(n=>n.id===id);
    if(!item || item.imageSize || !width || !height || Math.max(width,height)>100000)return;
    // Preserve hand-sized images and multi-card layouts on boards made before native sizing.
    const untouched=current.nodes.length===1 && item.width===220 && item.height===200;
    change(b=>({...b,nodes:b.nodes.map(n=>n.id===id?{...n,imageSize:{width,height},...(untouched?{width,height}:{})}:n)}));
    if(untouched)reframe([id]);
  },[change,reframe]);
  const appearance=useCallback((id:string,value:NonNullable<CanvasNode["appearance"]>)=>{
    change(b=>({...b,nodes:b.nodes.map(n=>n.id===id?{...n,appearance:value}:n)}));
  },[change]);
  const actions=useMemo(()=>({resize:handleResize,edit,appearance,open:(id:string)=>{setReading(id);setPanel("read");},originalLoaded}),[appearance,edit,handleResize,originalLoaded]);
  const baseNodes=useMemo(()=>board.nodes.map((n):FlowCard=>{
    return {id:n.id,type:"card",position:{x:n.x,y:n.y},width:n.width,height:n.height,
      selectable:!multiPick,draggable:!hand && (!multiPick || ids.includes(n.id)),data:{item:n,focus,inspectOriginal:board.nodes.length===1 || (panel==="card" && editing===n.id)},
      selected:ids.includes(n.id),ariaLabel:n.title||n.kind,zIndex:n.kind==="highlight"?0:1};
  }),[board.nodes,ids,focus,panel,editing,multiPick,hand]);
  const flowNodes=useMemo(()=>baseNodes.map(n=>{
    const p=live[n.id];return p?{...n,position:{x:p.x??n.position.x,y:p.y??n.position.y},width:p.width??n.width,height:p.height??n.height}:n;
  }),[baseNodes,live]);
  const flowEdges=useMemo(()=>board.edges.map((e):Edge=>({
    id:e.id,source:e.source,target:e.target,type:"default",label:e.label,selected:edgeIds.includes(e.id),
    markerEnd:e.symbol==="arrow"?{type:MarkerType.ArrowClosed,color:"#536981"}:e.symbol==="circle"?"canvas-end-circle":undefined,
    style:{stroke:edgeIds.includes(e.id)?"#215da1":"#536981",strokeWidth:2.4,strokeDasharray:e.style==="solid"?undefined:e.style==="dashed"?"7 5":"2 5"},
    labelStyle:{fontSize:13,fill:"#35465a"},labelBgPadding:[7,4],labelBgBorderRadius:5,interactionWidth:24
  })),[board.edges,edgeIds]);
  function snapMovement(items:CanvasNode[],raw:{x:number;y:number}){
    const view=flow.current?.getViewport(), area=frame.current;
    if(!snap || !view || !area)return {delta:raw,guides:[]};
    // Offscreen artwork should never pull a nearby card out of the user's alignment.
    const left=(-view.x-6)/view.zoom,top=(-view.y-6)/view.zoom;
    const right=(area.clientWidth-view.x+6)/view.zoom,bottom=(area.clientHeight-view.y+6)/view.zoom;
    const visible=latest.current.nodes.filter(n=>n.x+n.width>=left && n.x<=right && n.y+n.height>=top && n.y<=bottom);
    return snapTranslation(items,visible,raw,view.zoom);
  }
  function onNodesChange(changes:NodeChange<FlowCard>[]){
    const selection=changes.filter(c=>c.type==="select");
    if(selection.length)setIds(old=>{
      const s=new Set(old);for(const c of selection){if(c.selected)s.add(c.id);else s.delete(c.id);}return [...s];
    });
    const temporary:Record<string,Partial<Layout>>={},finished=new Map<string,{x:number;y:number}>();
    for(const c of changes){
      if(c.type==="position" && c.position){
        temporary[c.id]=c.position;
        if(c.dragging===false)finished.set(c.id,c.position);
      } else if(c.type==="dimensions" && c.resizing && c.dimensions)temporary[c.id]={...temporary[c.id],...c.dimensions};
    }
    const moving=changes.filter(c=>c.type==="position" && c.dragging!==undefined && c.position);
    if(moving.length){
      const positions=new Map(Object.entries(temporary).filter(([,p])=>p.x!==undefined && p.y!==undefined));
      const originals=latest.current.nodes.filter(n=>positions.has(n.id));
      const anchor=originals[0],raw=anchor && positions.get(anchor.id);
      if(anchor && raw && snap && pointerDrag.current){
        const delta={x:raw.x!-anchor.x,y:raw.y!-anchor.y};
        const result=snapMovement(originals,delta);
        setGuides(finished.size?[]:result.guides);
        for(const n of originals){
          const pos={x:n.x+result.delta.x,y:n.y+result.delta.y};
          temporary[n.id]={...temporary[n.id],...pos};
          if(finished.has(n.id))finished.set(n.id,pos);
        }
      }else if(finished.size)setGuides([]);
      if(finished.size)pointerDrag.current=false;
    }
    if(Object.keys(temporary).length)setLive(old=>{
      const result={...old};for(const [id,v] of Object.entries(temporary))result[id]={...result[id],...v};
      for(const id of finished.keys())delete result[id];
      return result;
    });
    if(finished.size)change(b=>{
      if(!b.nodes.some(n=>{const p=finished.get(n.id);return p&&(n.x!==p.x||n.y!==p.y);}))return b;
      return {...b,nodes:b.nodes.map(n=>finished.has(n.id)?{...n,...finished.get(n.id)}:n)};
    });
  }
  function connect(source:string,target:string){
    if(source===target)return;
    const current=latest.current,existing=current.edges.find(e=>e.source===source&&e.target===target);
    const link:CanvasEdge=existing||{id:crypto.randomUUID(),source,target,style:"solid",symbol:"arrow",label:""};
    if(!existing)change(b=>({...b,edges:[...b.edges,link]}));
    choose([],[link.id]);setPanel("edge");setConnectFrom("");
  }
  function removeSelected(){
    if(!ids.length&&!edgeIds.length)return;
    change(b=>withoutSelection(b,new Set(ids),new Set(edgeIds)));choose([]);setPanel("");setConnectFrom("");
  }
  const groups=useMemo(()=>{
    const map=new Map<string,CanvasNode[]>();for(const n of board.nodes)if(n.group){const group=map.get(n.group)||[];group.push({...n,...live[n.id]});map.set(n.group,group);}
    return [...map].map(([name,items])=>({name,items,box:bounds(items)}));
  },[board.nodes,live]);
  function animatePlacement(){
    clearTimeout(arrangeTimer.current);setArranging(true);
    arrangeTimer.current=setTimeout(()=>setArranging(false),210);
  }
  function placeSelection(axis:"x"|"y",placement:"start"|"center"|"end"|"space"){
    if(selected.length<(placement==="space"?3:2))return;
    const size=axis==="x"?"width":"height";
    const box=bounds(selected);
    const moved=placement==="space"?spaceEvenly(selected,axis):selected.map(n=>({
      ...n,[axis]:box[axis]+(box[size]-n[size])*(placement==="start"?0:placement==="center"?.5:1)
    }));
    const positions=new Map(moved.map(n=>[n.id,{x:n.x,y:n.y}]));
    animatePlacement();
    change(b=>({...b,nodes:b.nodes.map(n=>positions.has(n.id)?{...n,...positions.get(n.id)}:n)}));
  }
  function togglePicked(id:string){
    setIds(old=>old.includes(id)?old.filter(other=>other!==id):[...old,id]);setEdgeIds([]);
  }
  function arrange(){
    const items=selected.length>1?selected:board.nodes;if(!items.length)return;
    animatePlacement();
    const arranged=new Map(tile(items,bounds(items)).map(n=>[n.id,n]));
    change(b=>({...b,nodes:b.nodes.map(n=>arranged.get(n.id)||n)}));reframe(items.map(n=>n.id));
  }
  function groupPosition(event:{clientX:number;clientY:number}){
    const start=groupDrag.current;
    if(!start)return new Map<string,{x:number;y:number}>();
    const scale=flow.current?.getZoom()||1;
    const raw={x:(event.clientX-start.clientX)/scale,y:(event.clientY-start.clientY)/scale};
    const result=snapMovement(start.items,raw);
    setGuides(result.guides);
    return new Map(start.items.map(n=>[n.id,{x:n.x+result.delta.x,y:n.y+result.delta.y}]));
  }
  function show(p:string){setPanel(old=>old===p?"":p);setName("");setConnectFrom("");}
  const paste=useRef((_:ClipboardEvent)=>{});
  paste.current=(e)=>{
    if(e.defaultPrevented||isField(e.target)||panel||media.busy)return;
    const files=Array.from(e.clipboardData?.files||[]);
    if(files.length){e.preventDefault();void media.importFiles(files);return;}
    const value=e.clipboardData?.getData("text/plain").trim();if(value){e.preventDefault();insert("text",place(),value);}
  };
  useEffect(()=>{const listener=(e:ClipboardEvent)=>paste.current(e);document.addEventListener("paste",listener);return()=>document.removeEventListener("paste",listener);},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(""),4500);return()=>clearTimeout(t);},[notice]);
  const selectionCount=selected.length+edgeIds.length;
  return <div className={css.editor} style={{"--canvas-inverse-zoom":1/zoom,"--footer-scale":Math.min(3,1/zoom)} as React.CSSProperties} data-arranging={arranging||undefined} data-multi={ids.length>1||undefined} aria-label="Canvas editor" onKeyDown={e=>{
    if(isField(e.target) || (e.target instanceof HTMLElement && e.target.closest("button,a,[role=menu]")))return;
    if(multiPick && (e.key==="Enter" || e.key===" ")){
      const id=(e.target as HTMLElement).closest<HTMLElement>(".react-flow__node")?.dataset.id;
      if(id){e.preventDefault();togglePicked(id);return;}
    }
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();restore(e.shiftKey);}
    else if((e.key==="Delete"||e.key==="Backspace") && selectionCount){e.preventDefault();removeSelected();}
    else if(e.key==="Escape"){setPanel("");setConnectFrom("");choose([]);}
  }}>
    <header className={css.bar}>
      <Action name="Back to boards" icon={<IconArrowLeft/>} run={onBack} disabled={media.busy}/>
      <div className={css.heading}><h2>{board.title}</h2><span role="status">{saveStatus}</span></div>
      <div className={css.history}><Action name="Undo" icon={<IconArrowBackUp/>} disabled={!previous.current.length} run={()=>restore()}/><Action name="Redo" icon={<IconArrowForwardUp/>} disabled={!next.current.length} run={()=>restore(true)}/></div>
      <Action name="Focus mode" label="Focus" icon={<IconFocus2/>} active={focus} run={()=>{setFocus(value=>!value);setMultiPick(false);setPanel("");setConnectFrom("");choose([]);}}/>
      <Action name="Saved views" icon={<IconBookmark/>} label="Views" active={panel==="views"} run={()=>show("views")}/>
    </header>
    <div ref={frame} className={css.stage} data-drop={drop||undefined}
      onDragOver={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();setDrop(true);}}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrop(false);}}
      onDrop={e=>{e.preventDefault();setDrop(false);if(!media.busy&&e.dataTransfer.files.length){
        dropPoint.current=flow.current?.screenToFlowPosition({x:e.clientX,y:e.clientY})||place();
        void media.importFiles(Array.from(e.dataTransfer.files)).finally(()=>{dropPoint.current=null;});
      }}}>
      <BoardActions.Provider value={actions}><ReactFlow<FlowCard,Edge> nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
        onEdgesChange={changes=>setEdgeIds(old=>{const s=new Set(old);for(const c of changes)if(c.type==="select"){if(c.selected)s.add(c.id);else s.delete(c.id);}return [...s];})}
        onInit={instance=>{flow.current=instance;}}
        onPaneClick={()=>{choose([]);setPanel("");setConnectFrom("");}}
        onNodeClick={(event,n)=>{
          if(connectFrom){connect(connectFrom,n.id);return;}
          if(multiPick)togglePicked(n.id);
          else if(!event.shiftKey && !event.ctrlKey && !event.metaKey)choose([n.id]);
          if(panel!=="card"||editing!==n.id)setPanel("");
        }}
        onNodeDragStart={()=>{pointerDrag.current=true;setArranging(false);setPanel("");}}
        onSelectionDragStart={()=>{pointerDrag.current=true;setArranging(false);setPanel("");}}
        selectNodesOnDrag={!multiPick}
        onEdgeClick={(_,e)=>{choose([],[e.id]);setPanel("edge");}}
        onConnect={c=>connect(c.source,c.target)} isValidConnection={c=>c.source!==c.target}
        nodesDraggable={!hand} nodesConnectable={!hand} panOnDrag={hand?true:[1,2]} selectionOnDrag={!hand} selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Shift","Meta","Control"]} deleteKeyCode={null} panOnScroll zoomOnScroll={false} zoomOnPinch
        defaultViewport={initialView} fitView={!initialView&&board.nodes.length>0} fitViewOptions={{padding:.23,maxZoom:1}}
        minZoom={.002} maxZoom={3} onlyRenderVisibleElements={board.nodes.length>65} zoomOnDoubleClick={false}
        onViewportChange={rememberView}>
        <Background gap={24} size={1.3} color="#b9c6d5"/>
        <svg width="0" height="0" aria-hidden="true"><defs><marker id="canvas-end-circle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="3.5" fill="#536981"/></marker></defs></svg>
        <ViewportPortal>{guides.length>0 && <svg className={css.guides} width="1" height="1" aria-hidden="true">{guides.map(g=>
          <line key={g.axis} vectorEffect="non-scaling-stroke" x1={g.axis==="x"?g.position:g.start} x2={g.axis==="x"?g.position:g.end} y1={g.axis==="y"?g.position:g.start} y2={g.axis==="y"?g.position:g.end}/>
        )}</svg>}{groups.map(({name:label,items,box})=><div key={label} className={css.group} style={{left:box.x-14,top:box.y-34,width:box.width+28,height:box.height+48}}>
          <button type="button" className="nodrag nopan" aria-label={"Select group "+label} onPointerDown={e=>{
            if(e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
            groupDrag.current={clientX:e.clientX,clientY:e.clientY,items};choose(items.map(i=>i.id));setPanel("");
          }} onPointerMove={e=>{if(groupDrag.current)setLive(Object.fromEntries(groupPosition(e)));}}
          onPointerUp={e=>{
            const positions=groupPosition(e),start=groupDrag.current;groupDrag.current=null;setLive({});setGuides([]);
            if(start && (Math.abs(start.clientX-e.clientX)>1||Math.abs(start.clientY-e.clientY)>1))
              change(b=>({...b,nodes:b.nodes.map(n=>positions.has(n.id)?{...n,...positions.get(n.id)}:n)}));
          }} onPointerCancel={()=>{groupDrag.current=null;setLive({});setGuides([]);}}
          onClick={()=>{choose(items.map(i=>i.id));setPanel("");}}>{label}</button>
        </div>)}</ViewportPortal>
      </ReactFlow></BoardActions.Provider>
      {!board.nodes.length && !panel && <div className={css.empty}><IconNote size={32}/><h3>Start your board</h3><p>Paste an image, drop files, or add a sticky note.</p></div>}
      <div className={css.tools} role="toolbar" aria-label="Canvas tools">
        <Action name="Select cards" icon={<IconPointer/>} active={!hand && !multiPick} run={()=>{if(multiPick)choose([]);setHand(false);setMultiPick(false);}}/>
        <Action name="Select multiple" label="Select" icon={<IconBoxMultiple/>} active={multiPick} run={()=>{setMultiPick(v=>!v);setHand(false);setPanel("");setConnectFrom("");}}/>
        <Action name="Pan board" icon={<IconHandStop/>} active={hand} run={()=>{setHand(true);setMultiPick(false);}}/>
        <i/>
        <Action name="Add sticky note" icon={<IconNote/>} run={()=>insert("sticky")}/>
        <Action name="Add text" icon={<IconTypography/>} run={()=>insert("text")}/>
        <Action name="Add highlight" icon={<IconHighlight/>} run={()=>insert("highlight")}/>
        <CanvasObjectPicker onAdd={insertObjects}/>
        <Action name="Upload media" icon={<IconUpload/>} disabled={media.busy} run={()=>uploadInput.current?.click()}/>
        <input ref={uploadInput} type="file" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void media.importFiles(files);}}/>
      </div>
      {panel==="card"&&edited && <CardFields key={edited.id} node={edited} close={()=>setPanel("")} restoreSize={edited.imageSize?()=>{patchNodes([edited.id],{...edited.imageSize});reframe([edited.id]);}:undefined} save={patch=>patchNodes([edited.id],patch)}/>}
      {panel==="read" && <Panel title={board.nodes.find(n=>n.id===reading)?.title || "Canvas item"} close={()=>setPanel("")}><p className={css.readBody}>{board.nodes.find(n=>n.id===reading)?.body || "No additional text."}</p></Panel>}
      {panel==="edge"&&edge && <EdgeFields key={edge.id} edge={edge} close={()=>setPanel("")} save={patch=>change(b=>({...b,edges:b.edges.map(e=>e.id===edge.id?{...e,...patch}:e)}))}/>}
      {panel==="arrange" && selected.length>1 && <Panel title="Arrange selection" close={()=>setPanel("")}>
        <div className={css.arrangeButtons}>
          {(["x","y"] as const).map(axis=><div key={axis} role="group" aria-label={axis==="x"?"Horizontal alignment":"Vertical alignment"}>
            {(["start","center","end"] as const).map((position,index)=>{
              const label=(axis==="x"?["Left","Center","Right"]:["Top","Middle","Bottom"])[index];
              return <button key={position} type="button" aria-label={"Align "+label.toLowerCase()} onClick={()=>placeSelection(axis,position)}>{label}</button>;
            })}
          </div>)}
        </div>
        {selected.length>=3 && <div className={css.spacing}><button type="button" onClick={()=>placeSelection("x","space")}>Space horizontally</button>
          <button type="button" onClick={()=>placeSelection("y","space")}>Space vertically</button></div>}
      </Panel>}
      {panel==="appearance" && selected.length>1 && <Panel title="Selection appearance" close={()=>setPanel("")}>
        <div className={css.spacing}>{(["plain","outline","card"] as const).map(value=><button type="button" key={value}
          aria-pressed={selected.every(n=>(n.appearance ?? defaultCanvasAppearance(n))===value)}
          onClick={()=>patchNodes(ids,{appearance:value})}>{canvasAppearances[value]}</button>)}</div>
      </Panel>}
      {panel==="group" && <Panel title="Group cards" close={()=>setPanel("")}><form onSubmit={e=>{e.preventDefault();if(name.trim()){patchNodes(ids,{group:name.trim()});setPanel("");}}}>
        <label>Group name<input autoFocus required maxLength={160} list="canvas-group-names" value={name} onChange={e=>setName(e.target.value)}/></label>
        <datalist id="canvas-group-names">{groups.map(g=><option key={g.name}>{g.name}</option>)}</datalist>
        <button className={css.primary}>Group cards</button>
        {selected.some(n=>n.group)&&<button type="button" onClick={()=>{patchNodes(ids,{group:""});setPanel("");}}>Ungroup selection</button>}
      </form></Panel>}
      {panel==="views" && <Panel title="Saved views" close={()=>setPanel("")}>
        <div className={css.bookmarks}>{board.views.map(v=><div key={v.id}><button type="button" onClick={()=>{void flow.current?.setViewport(v,{duration:duration()});setPanel("");}}><IconBookmark size={16}/>{v.name}</button>
          <Action name={"Remove view "+v.name} icon={<IconX/>} run={()=>change(b=>({...b,views:b.views.filter(i=>i.id!==v.id)}))}/></div>)}</div>
        <form onSubmit={e=>{e.preventDefault();const viewport=flow.current?.getViewport();if(!viewport||!name.trim())return;
          if(board.views.length>=100){setNotice("This board already has 100 saved views.");return;}
          change(b=>({...b,views:[...b.views,{id:crypto.randomUUID(),name:name.trim(),...viewport}]}));setName("");}}>
          <label>View name<input autoFocus maxLength={160} required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Shortlisted ads"/></label>
          <button className={css.primary}>Save current view</button>
        </form></Panel>}
      {!focus && selectionCount>0 && !panel && !connectFrom && <div className={css.selection} role="toolbar" aria-label="Selection actions">
        {selected.length>1 && <><span className={css.pickCount} aria-live="polite">{selected.length} selected</span>
          <Action name="Arrange selection" label="Arrange" icon={<IconArrowsMove/>} run={()=>show("arrange")}/>
          <Action name="Selection appearance" label="Style" icon={<IconAdjustments/>} run={()=>show("appearance")}/></>}
        {one && <Action name="Connect to another card" icon={<IconLine/>} run={()=>{setConnectFrom(one.id);setMultiPick(false);setHand(false);}}/>}
        {selected.length>0&&<><Action name="Group cards" icon={<IconFrame/>} run={()=>{show("group");setName(one?.group||"");}}/>
        <Action name={selected.every(n=>n.used)?"Mark unused":"Mark used"} icon={<IconCheck/>} active={selected.every(n=>n.used)} run={()=>patchNodes(ids,{used:!selected.every(n=>n.used)})}/></>}
        <Action name="Remove selection from board" icon={<IconTrash/>} run={removeSelected}/>
      </div>}
      <div className={css.navigation} role="toolbar" aria-label="Board navigation">
        <Action name="Snap to align" icon={<IconMagnet/>} active={snap} run={()=>{setSnap(v=>!v);setGuides([]);}}/>
        <Action name="Select all cards" icon={<IconSelectAll/>} disabled={!board.nodes.length} run={()=>{choose(board.nodes.map(n=>n.id));setPanel("");}}/>
        <Action name="Arrange cards in a grid" icon={<IconLayoutGrid/>} disabled={board.nodes.length<2} run={arrange}/>
        <i/><Action name="Zoom out" icon={<IconMinus/>} run={()=>void flow.current?.zoomOut({duration:duration()})}/>
        <button type="button" title="Reset zoom" onClick={()=>void flow.current?.zoomTo(1,{duration:duration()})}>{Math.round(zoom*100)}%</button>
        <Action name="Zoom in" icon={<IconPlus/>} run={()=>void flow.current?.zoomIn({duration:duration()})}/>
        <Action name="Fit board" icon={<IconMaximize/>} run={()=>void flow.current?.fitView({padding:.2,maxZoom:1.3,duration:duration()})}/>
      </div>
      {(connectFrom||media.message||notice||drop) && <div className={css.message} role="status">{drop?"Drop to add to Media and this board":connectFrom?"Choose the card to connect to":notice||media.message}{connectFrom&&<Action name="Cancel connection" run={()=>setConnectFrom("")} icon={<IconX/>}/>}</div>}
    </div>
  </div>;
}
