"use client";
import MentionBacklinks from "../writing/MentionBacklinks";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background, ReactFlow, getViewportForBounds, MarkerType, Position, SelectionMode, ViewportPortal,
  type Edge, type NodeChange, type ReactFlowInstance, type Viewport
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconBookmark, IconCheck,
  IconBoxMultiple, IconAdjustments, IconArrowsMove, IconMagnet, IconFocus2, IconFrame, IconHandStop, IconHighlight, IconLayoutGrid, IconLine, IconMaximize,
  IconLink, IconMinus, IconNote, IconPlus, IconPointer, IconSelectAll, IconTags,
  IconCopy, IconLock, IconLockOpen, IconTrash, IconTypography, IconUpload, IconX
} from "@tabler/icons-react";
import { defaultCanvasAppearance, canvasAppearances, canvasMaxRequestBytes, type Board, type CanvasNode, type CanvasEdge, type CanvasCategory, type CanvasArrangementOptions, type CanvasView } from "../../lib/modules/canvas/model";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { addObjects, bounds, duplicateItems, makeNode, tile, unusedGroupName, withoutSelection, keyOf } from "./board-layout";
import { snapResize,snapTranslation,spaceEvenly,type AlignmentGuide } from "./alignment";
import { BoardActions, CanvasCard, type FlowCard } from "./CanvasCard";
import { ImagePinsPanel } from "./ImagePins";
import { CanvasObjectPicker, useCanvasMediaImport } from "./CanvasIntake";
import { CardFields, EdgeFields, Panel } from "./CanvasPanels";
import { SavedViews } from "./SavedViews";
import dynamic from "next/dynamic";
import { FrameFields,withFrame,type FrameStyle } from "./FrameFields";
import { CanvasSaveStatus } from "./CanvasSaveStatus";
import { ItemTags, BoardOrganizer } from "./CanvasTaxonomy";
import { defaultOrganizerOptions, organizerRows, type OrganizerOptions } from "./organizer-rows";
import { organizeBoard, resolveCanvasView, snapshotPositions } from "./board-organization";
import { ArrangementDecorations } from "./ArrangementDecorations";
import { arrangementViewport, savedViewport } from "./organization-viewport";
import { BulkTagPanel } from "./BulkTagPanel";
import { applyBoardTags } from "./board-tags";
import { useCanvasMediaDetails, displayMediaDetails, linkedMediaId } from "./useCanvasMediaDetails";
import css from "./CanvasEditor.module.css";

type Props={board:Board;entryView?:string;entryCard?:string;onChange:(board:Board)=>void;onBack:()=>void;saveStatus:string};
type Layout=Pick<CanvasNode,"x"|"y"|"width"|"height">;
type HistoryEntry={board:Board;viewId?:string;revealAll:boolean};
const nodeTypes={card:CanvasCard};
const CanvasPresentation=dynamic(()=>import("./CanvasSequence").then(module=>module.CanvasPresentation),{ssr:false});
const emptySelection:string[]=[];
// Supply the artwork bounds and its two 10-unit connectors even when the card is offscreen.
// React Flow otherwise includes unmeasured cards in every drag selection.
function cardGeometry(width:number,height:number):Pick<FlowCard,"width"|"height"|"measured"|"handles">{
  const handle={width:10,height:10,y:height/2-5};
  return {width,height,measured:{width,height},handles:[
    {...handle,type:"target",position:Position.Left,x:-5},
    {...handle,type:"source",position:Position.Right,x:width-5}
  ]};
}
function Action({name,icon,run,active,disabled,label,hint}:{name:string;icon:ReactNode;run:()=>void;active?:boolean;disabled?:boolean;label?:string;hint?:string}){
  return <button type="button" title={hint||name} aria-label={name} aria-description={hint} aria-pressed={active} disabled={disabled} onClick={run}>{icon}{label && <span>{label}</span>}</button>;
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
function bookmarkUrl(id?:string){
  const url=new URL(window.location.href);
  if(id){url.searchParams.set("view",id);url.searchParams.delete("card");}
  else url.searchParams.delete("view");
  if(url.href!==window.location.href)window.history.replaceState(window.history.state,"",url);
}
function fitsBoard(board:Board){
  return new Blob([JSON.stringify({board,expectedRevision:board.revision})]).size<=canvasMaxRequestBytes;
}
function physicalNodes(nodes:CanvasNode[],layout:CanvasNode[]){
  // The layout engine preserves node order and reads shared Media titles for sorting.
  return nodes.map((node,i)=>node.x===layout[i].x && node.y===layout[i].y?node:{...node,x:layout[i].x,y:layout[i].y});
}
export default function CanvasEditor({board:sourceBoard,entryView,entryCard,onChange,onBack,saveStatus}:Props){
  const [viewId,setViewId]=useState(entryCard?undefined:entryView);
  const viewing=sourceBoard.views.find(v=>v.id===viewId);
  const sharedMedia=useCanvasMediaDetails(sourceBoard.nodes);
  const sourceNodes=useMemo(()=>sourceBoard.nodes.map(n=>{
    const id=linkedMediaId(n);
    return id?displayMediaDetails(n,sharedMedia.get(id)):n;
  }),[sourceBoard.nodes,sharedMedia]);
  // A bookmark is a read-only placement overlay until the user edits the board.
  const board=useMemo(()=>{
    if(!viewing)return sourceBoard;
    if(viewing.mode!=="gallery")return resolveCanvasView(sourceBoard,viewing);
    const resolved=resolveCanvasView({...sourceBoard,nodes:sourceNodes},viewing);
    return {...resolved,nodes:physicalNodes(sourceBoard.nodes,resolved.nodes)};
  },[sourceBoard,viewing,sourceNodes]);
  const latest=useRef(board); latest.current=board;
  const edits=useRef(onChange); edits.current=onChange;
  const previous=useRef<HistoryEntry[]>([]), next=useRef<HistoryEntry[]>([]);
  const frame=useRef<HTMLDivElement>(null), uploadInput=useRef<HTMLInputElement>(null);
  const flow=useRef<ReactFlowInstance<FlowCard,Edge>|null>(null);
  const [flowReady,setFlowReady]=useState(false);
  const [initialView]=useState(()=>viewing || lastViewport(board.id));
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
  const [initialPin,setInitialPin]=useState<string>();
  const [gap,setGap]=useState("");
  const [frameDraft,setFrameDraft]=useState<FrameStyle>({});
  const [hand,setHand]=useState(false),[panel,setPanel]=useState(""),[name,setName]=useState("");
  const [ids,setIds]=useState<string[]>([]),[edgeIds,setEdgeIds]=useState<string[]>([]);
  const [editing,setEditing]=useState(""),[connectFrom,setConnectFrom]=useState("");
  const [tagDraft,setTagDraft]=useState<string[]>();
  const [tagTargets,setTagTargets]=useState<string[]>([]);
  const bulkItems=useMemo(()=>{
    if(panel!=="bulk-tags")return [];
    const targets=new Set(tagTargets);
    return board.nodes.filter(node=>targets.has(node.id));
  },[board.nodes,panel,tagTargets]);
  const [categoryDraft,setCategoryDraft]=useState<CanvasCategory[]>();
  const [fromOrganizer,setFromOrganizer]=useState(false);
  const [revealAll,setRevealAll]=useState(false);
  const editingState=useRef<HistoryEntry>({board:sourceBoard,viewId,revealAll});
  editingState.current={board:sourceBoard,viewId,revealAll};
  const applied=viewing?.organizer??board.arrangement?.organizer??defaultOrganizerOptions;
  const organization=useMemo(()=>revealAll?{...applied,search:"",filters:[]}:applied,[applied,revealAll]);
  const [presenting,setPresenting]=useState(false);
  const frameSize=()=>({width:frame.current?.clientWidth||960,height:frame.current?.clientHeight||600});
  const unfilteredCamera=useRef<Viewport|undefined>(undefined);
  const displayNodes=useMemo(()=>board.nodes===sourceBoard.nodes?sourceNodes:board.nodes.map(n=>{
    const id=linkedMediaId(n);
    return id?displayMediaDetails(n,sharedMedia.get(id)):n;
  }),[board.nodes,sourceBoard.nodes,sourceNodes,sharedMedia]);
  const isFiltered=Boolean(organization.filters.length || organization.search);
  const organized=useMemo(()=>isFiltered
    ? organizerRows(displayNodes,board.categories??[],organization.filters,organization.groupBy,organization.sortBy,organization.search)
    : null,[displayNodes,board.categories,organization,isFiltered]);
  const visibleIds=useMemo(()=>isFiltered && organized ? new Set(organized.orderedIds) : null,[isFiltered,organized]);
  const visibleBoardNodes=useMemo(()=>visibleIds ? board.nodes.filter(n=>visibleIds.has(n.id)) : board.nodes,[board.nodes,visibleIds]);
  const [notice,setNotice]=useState(""),[drop,setDrop]=useState(false);
  async function exportPdf(){
    const preview=window.open("about:blank","_blank");
    if(!preview){setNotice("Allow this site to open a tab for the PDF preview.");return;}
    preview.opener=null;
    preview.document.title=board.title+" — PDF";
    preview.document.body.textContent="Preparing saved views…";
    try{
      const {openSequencePrint}=await import("./CanvasSequence");
      if(!preview.closed)openSequencePrint(preview,sourceBoard,sourceNodes,frameSize());
    }catch{
      if(!preview.closed)preview.document.body.textContent="The PDF preview could not be opened. Return to the board and try again.";
    }
  }
  const [live,setLive]=useState<Record<string,Partial<Layout>>>({});
  const resizing=useRef<{item:CanvasNode;start:Layout}|null>(null);
  const pointerDrag=useRef(false);
  const boxSelecting=useRef(false);
  const groupDrag=useRef<{clientX:number;clientY:number;items:CanvasNode[]}|null>(null);
  const dropPoint=useRef<{x:number;y:number}|null>(null);
  const selected=visibleBoardNodes.filter(n=>ids.includes(n.id)), one=selected.length===1?selected[0]:undefined;
  const movable=selected.filter(n=>!n.locked);
  const lockedIds=useMemo(()=>new Set(board.nodes.filter(n=>n.locked).map(n=>n.id)),[board.nodes]);
  const edited=board.nodes.find(n=>n.id===editing),edge=board.edges.find(e=>e.id===edgeIds[0]);
  const duration=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:220;
  const change=useCallback((fn:(old:Board)=>Board)=>{
    const old=latest.current,newBoard=fn(old);
    if(newBoard===old)return;
    const before=editingState.current;
    previous.current=[...previous.current.slice(-34),before];next.current=[];
    // Tagging, annotating or editing text in a bookmark must not replace the working board's positions.
    if(before.viewId && newBoard.arrangement===old.arrangement && newBoard.nodes.length===old.nodes.length &&
      newBoard.nodes.every((node,i)=>node.id===old.nodes[i].id && node.x===old.nodes[i].x && node.y===old.nodes[i].y)){
      const positions=new Map(before.board.nodes.map(node=>[node.id,node]));
      const saved={...newBoard,arrangement:before.board.arrangement,legacyPositions:before.board.legacyPositions,nodes:newBoard.nodes.map(node=>{
        const p=positions.get(node.id);
        return p && (p.x!==node.x||p.y!==node.y)?{...node,x:p.x,y:p.y}:node;
      })};
      latest.current=newBoard;editingState.current={...before,board:saved};edits.current(saved);return;
    }
    editingState.current={...before,viewId:undefined,board:newBoard};
    latest.current=newBoard;setViewId(undefined);bookmarkUrl();edits.current(newBoard);
  },[]);
  const choose=useCallback((items:string[],lines:string[]=emptySelection)=>{setIds(items);setEdgeIds(lines);},[]);
  function restore(redo=false){
    const from=redo?next:previous,to=redo?previous:next,entry=from.current.pop();
    if(!entry)return;
    const current=editingState.current;to.current.push(current);
    const restored={...entry.board,revision:current.board.revision,updatedAt:current.board.updatedAt};
    editingState.current={...entry,board:restored};latest.current=restored;
    setViewId(entry.viewId);bookmarkUrl(entry.viewId);setRevealAll(entry.revealAll);edits.current(restored);choose([]);setPanel("");setConnectFrom("");
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
  useEffect(()=>{
    if (!flowReady || !entryCard) return;
    if (!latest.current.nodes.some(node=>node.id===entryCard)) {
      setNotice("This card is no longer on the board.");
      return;
    }
    setRevealAll(true);
    setPanel("");
    choose([entryCard]);
    reframe([entryCard]);
  },[choose,entryCard,flowReady,reframe]);
  const insertObjects=useCallback((refs:NativeObjectRef[],sizes?:Map<string,{width:number;height:number}>)=>{
    setRevealAll(true);unfilteredCamera.current=undefined;
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
    setRevealAll(true);unfilteredCamera.current=undefined;
    setCategoryDraft(undefined);setTagDraft(undefined);setFromOrganizer(false);
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
  const snapTargets=useCallback(()=>{
    const view=flow.current?.getViewport(), area=frame.current;
    if(!snap || !view || !area)return {visible:[],zoom:1};
    const left=(-view.x-6)/view.zoom,top=(-view.y-6)/view.zoom;
    const right=(area.clientWidth-view.x+6)/view.zoom,bottom=(area.clientHeight-view.y+6)/view.zoom;
    const visible=visibleBoardNodes.filter(n=>n.x+n.width>=left && n.x<=right && n.y+n.height>=top && n.y<=bottom);
    return {visible,zoom:view.zoom};
  },[snap,visibleBoardNodes]);
  const startResize=useCallback((id:string,start:Layout)=>{
    const item=latest.current.nodes.find(n=>n.id===id);
    if(item && !item.locked)resizing.current={item,start};
  },[]);
  const handleResize=useCallback((id:string,proposed:Layout,finished:boolean)=>{
    const session=resizing.current;
    if(!session || session.item.id!==id)return;
    const {item,start}=session,{visible,zoom}=snapTargets();
    const {rect,guides}=snapResize(item,start,proposed,visible,zoom,item.ref?.module==="media");
    if(!finished){
      setLive({[id]:rect});setGuides(guides);return;
    }
    resizing.current=null;setLive({});setGuides([]);
    change(b=>{
      const current=b.nodes.find(n=>n.id===id);
      if(!current || current.locked || (current.x===rect.x && current.y===rect.y &&
        current.width===rect.width && current.height===rect.height))return b;
      return {...b,nodes:b.nodes.map(n=>n.id===id?{...n,...rect}:n)};
    });
  },[change,snapTargets]);
  const edit=useCallback((id:string)=>{
    setTagDraft(undefined);setCategoryDraft(undefined);setFromOrganizer(false);
    setEditing(id);choose([id]);setPanel("card");
  },[choose]);
  const originalLoaded=useCallback((id:string,width:number,height:number)=>{
    const current=latest.current, item=current.nodes.find(n=>n.id===id);
    if(!item || item.imageSize || !width || !height || Math.max(width,height)>100000)return;
    // Preserve hand-sized images and multi-card layouts on boards made before native sizing.
    const untouched=!item.locked && current.nodes.length===1 && item.width===220 && item.height===200;
    change(b=>({...b,nodes:b.nodes.map(n=>n.id===id?{...n,imageSize:{width,height},...(untouched?{width,height}:{})}:n)}));
    if(untouched)reframe([id]);
  },[change,reframe]);
  const appearance=useCallback((id:string,value:NonNullable<CanvasNode["appearance"]>)=>{
    change(b=>({...b,nodes:b.nodes.map(n=>n.id===id?{...n,appearance:value}:n)}));
  },[change]);
  const openStyle=useCallback((id:string)=>{choose([id]);setFrameDraft({});setPanel("appearance");},[choose]);
  const openPins=useCallback((id:string,pinId?:string)=>{
    choose([id]);setEditing(id);setInitialPin(pinId);setPanel("pins");
  },[choose]);
  const actions=useMemo(()=>({startResize,resize:handleResize,edit,appearance,style:openStyle,pins:openPins,open:(id:string)=>{setReading(id);setPanel("read");},originalLoaded}),[appearance,edit,startResize,handleResize,originalLoaded,openStyle,openPins]);
  const baseNodes=useMemo(()=>displayNodes.filter(n=>!visibleIds||visibleIds.has(n.id)).map((n):FlowCard=>{
    return {id:n.id,type:"card",position:{x:n.x,y:n.y},...cardGeometry(n.width,n.height),
      draggable:!n.locked && !hand && (!multiPick || ids.includes(n.id)),data:{item:n,focus,inspectOriginal:board.nodes.length===1 || (panel==="card" && editing===n.id)},
      selected:ids.includes(n.id),ariaLabel:n.title||n.kind,zIndex:n.kind==="highlight"?0:1};
  }),[displayNodes,visibleIds,board.nodes.length,ids,focus,panel,editing,multiPick,hand]);
  const flowNodes=useMemo(()=>baseNodes.map(n=>{
    const preview=panel==="appearance" && n.selected && Object.keys(frameDraft).length>0;
    const displayed=preview?{...n,data:{...n.data,item:withFrame(n.data.item,frameDraft)}}:n;
    const p=live[n.id];if(!p)return displayed;
    const size=p.width!==undefined || p.height!==undefined ? cardGeometry(p.width??n.data.item.width,p.height??n.data.item.height) : undefined;
    return {...displayed,...size,position:{x:p.x??n.position.x,y:p.y??n.position.y}};
  }),[baseNodes,live,panel,frameDraft]);
  const flowEdges=useMemo(()=>board.edges.filter(e=>!visibleIds||(visibleIds.has(e.source)&&visibleIds.has(e.target))).map((e):Edge=>({
    id:e.id,source:e.source,target:e.target,type:"default",label:e.label,selected:edgeIds.includes(e.id),
    markerEnd:e.symbol==="arrow"?{type:MarkerType.ArrowClosed,color:"#536981"}:e.symbol==="circle"?"canvas-end-circle":undefined,
    style:{stroke:edgeIds.includes(e.id)?"#215da1":"#536981",strokeWidth:2.4,strokeDasharray:e.style==="solid"?undefined:e.style==="dashed"?"7 5":"2 5"},
    labelStyle:{fontSize:13,fill:"#35465a"},labelBgPadding:[7,4],labelBgBorderRadius:5,interactionWidth:24
  })),[board.edges,edgeIds,visibleIds]);
  function snapMovement(items:CanvasNode[],raw:{x:number;y:number}){
    const {visible,zoom}=snapTargets();
    return snapTranslation(items,visible,raw,zoom);
  }
  function onNodesChange(changes:NodeChange<FlowCard>[]){
    const selection=changes.filter(c=>c.type==="select");
    // In Select mode a single tap toggles membership. The marquee supplies its own selection.
    if(selection.length && (!multiPick || boxSelecting.current))setIds(old=>{
      const s=new Set(old);for(const c of selection){if(c.selected)s.add(c.id);else s.delete(c.id);}return [...s];
    });
    const temporary:Record<string,Partial<Layout>>={},finished=new Map<string,{x:number;y:number}>();
    for(const c of changes){
      // The resize callback supplies the full snapped rectangle, including dimension-only bottom/right drags.
      if((c.type==="position" || c.type==="dimensions") && (lockedIds.has(c.id) || resizing.current?.item.id===c.id))continue;
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
    if(!movable.length && (selected.length || !edgeIds.length))return;
    const lines=new Set(selected.length?[]:edgeIds);
    change(b=>withoutSelection(b,new Set(movable.map(n=>n.id)),lines));choose(ids.filter(id=>lockedIds.has(id)));setPanel("");setConnectFrom("");
  }
  function duplicate(){
    if(!selected.length)return;
    const current=latest.current,copies=duplicateItems(current,selected,24/(flow.current?.getZoom()||1));
    if(current.nodes.length+copies.nodes.length>1000 || current.edges.length+copies.edges.length>4000){
      setNotice("There isn’t room on this board for the entire selection.");return;
    }
    change(b=>({...b,nodes:[...b.nodes,...copies.nodes],edges:[...b.edges,...copies.edges]}));
    choose(copies.nodes.map(n=>n.id));setPanel("");
  }
  function lockSelection(){
    if(selected.length)patchNodes(ids,{locked:movable.length>0});
  }
  function quickGroup(ungroup:boolean){
    if(ungroup && selected.some(n=>n.group))patchNodes(ids,{group:""});
    else if(!ungroup && selected.length>1)patchNodes(ids,{group:unusedGroupName("Group",new Set(board.nodes.map(n=>n.group)))});
  }
  const groups=useMemo(()=>{
    const map=new Map<string,CanvasNode[]>();for(const n of visibleBoardNodes)if(n.group){const group=map.get(n.group)||[];group.push({...n,...live[n.id]});map.set(n.group,group);}
    return [...map].map(([name,items])=>({name,items,box:bounds(items)}));
  },[visibleBoardNodes,live]);
  function animatePlacement(){
    clearTimeout(arrangeTimer.current);setArranging(true);
    arrangeTimer.current=setTimeout(()=>setArranging(false),210);
  }
  function placeSelection(axis:"x"|"y",placement:"start"|"center"|"end"|"space"){
    const exactGap=gap.trim()===""?undefined:Number(gap);
    if(movable.length<(placement==="space" && exactGap===undefined?3:2))return;
    if(placement==="space" && exactGap!==undefined && (!Number.isFinite(exactGap)||exactGap<0||exactGap>10000))return;
    const size=axis==="x"?"width":"height";
    const box=bounds(movable);
    const moved=placement==="space"?spaceEvenly(movable,axis,exactGap):movable.map(n=>({
      ...n,[axis]:box[axis]+(box[size]-n[size])*(placement==="start"?0:placement==="center"?.5:1)
    }));
    const positions=new Map(moved.map(n=>[n.id,{x:n.x,y:n.y}]));
    if(moved.some(n=>Math.abs(n.x)>1e7||Math.abs(n.y)>1e7)){setNotice("That spacing would extend beyond the board.");return;}
    animatePlacement();
    change(b=>({...b,nodes:b.nodes.map(n=>positions.has(n.id)?{...n,...positions.get(n.id)}:n)}));
  }
  function togglePicked(id:string){
    setIds(old=>old.includes(id)?old.filter(other=>other!==id):[...old,id]);setEdgeIds([]);
  }
  function arrange(){
    const items=(selected.length>1?selected:visibleBoardNodes).filter(n=>!n.locked);if(items.length<2)return;
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
  function openBulkTags(targets:string[],fromBoardOrganizer=false){setTagTargets(targets);setFromOrganizer(fromBoardOrganizer);setPanel("bulk-tags");}
  function fitArrangement(current:Board,items:CanvasNode[],options:OrganizerOptions){
    const matches=options.filters.length||options.search
      ? new Set(organizerRows(items,current.categories??[],options.filters,"","board",options.search).orderedIds) : null;
    const nodes=matches?current.nodes.filter(n=>matches.has(n.id)):current.nodes;
    const viewport=arrangementViewport({nodes,arrangement:current.arrangement},frameSize());
    if(viewport)void flow.current?.setViewport(viewport,{duration:duration()});
  }
  function applyOrganization(options:OrganizerOptions,style:CanvasArrangementOptions,categories?:CanvasCategory[]){
    const current=latest.current;
    try{
      const updated=organizeBoard({...current,categories:categories??current.categories,nodes:displayNodes},options,style);
      // Shared Media supplies searchable titles and notes. Persist only the requested layout changes.
      const arranged={...current,categories:updated.categories,arrangement:updated.arrangement,legacyPositions:updated.legacyPositions,nodes:physicalNodes(current.nodes,updated.nodes)};
      if(!fitsBoard(arranged)){setNotice("This layout exceeds the board’s save limit. Try fewer groups or items.");return;}
      if(!current.arrangement)unfilteredCamera.current=flow.current?.getViewport();
      animatePlacement();change(()=>arranged);setRevealAll(false);choose([]);setPanel("");setConnectFrom("");
      fitArrangement(arranged,displayNodes,options);
    }catch(error){setNotice(error instanceof Error?error.message:"This layout could not fit on the board.");}
  }
  function changeViews(update:(views:CanvasView[])=>CanvasView[]){
    const views=update(sourceBoard.views);
    if(views===sourceBoard.views)return false;
    const updated={...sourceBoard,views};
    if(!fitsBoard(updated)){setNotice("This view exceeds the board’s save limit. Remove an unused view or save a smaller board.");return false;}
    previous.current=[...previous.current.slice(-34),editingState.current];next.current=[];
    if(viewId&&!views.some(v=>v.id===viewId)){setViewId(undefined);bookmarkUrl();}
    edits.current(updated);
    return true;
  }
  function clearOrganization(){
    change(current=>current.arrangement?{...current,arrangement:undefined}:current);
    setViewId(undefined);bookmarkUrl();setRevealAll(false);choose([]);setPanel("");setConnectFrom("");
    if(unfilteredCamera.current)void flow.current?.setViewport(unfilteredCamera.current,{duration:duration()});
    unfilteredCamera.current=undefined;
  }
  function openBookmark(view:CanvasView){
    entryFramed.current=true;
    animatePlacement();setViewId(view.id);bookmarkUrl(view.id);setRevealAll(false);choose([]);setConnectFrom("");setPanel("");
    unfilteredCamera.current=undefined;
    if(view.mode==="gallery"&&!view.positions){
      const arranged=resolveCanvasView({...sourceBoard,nodes:sourceNodes},view);
      fitArrangement(arranged,arranged.nodes,view.organizer??defaultOrganizerOptions);
    }else void flow.current?.setViewport(savedViewport(view,frameSize()),{duration:duration()});
  }
  const entryFramed=useRef(false);
  const legacyFrame=useRef("");
  useEffect(()=>{
    if(!flowReady||entryCard)return;
    if(viewing?.mode==="gallery"&&!viewing.positions){
      // Media titles may arrive after a legacy bookmark opens. Fit once for each distinct result set.
      const key=JSON.stringify([viewing.id,...(visibleIds??[])]);
      if(legacyFrame.current!==key)fitArrangement(board,displayNodes,organization);
      legacyFrame.current=key;entryFramed.current=true;return;
    }
    legacyFrame.current="";
    if(entryFramed.current)return;
    entryFramed.current=true;
    if(viewing)void flow.current?.setViewport(savedViewport(viewing,frameSize()));
    else if(!initialView&&board.arrangement)fitArrangement(board,displayNodes,organization);
  },[flowReady,viewing,entryCard,board,displayNodes,organization,initialView,visibleIds]);
  const paste=useRef((_:ClipboardEvent)=>{});
  paste.current=(e)=>{
    if(e.defaultPrevented||isField(e.target)||panel||media.busy)return;
    const files=Array.from(e.clipboardData?.files||[]);
    if(files.length){e.preventDefault();void media.importFiles(files);return;}
    const value=e.clipboardData?.getData("text/plain").trim();if(value){e.preventDefault();insert("text",place(),value);}
  };
  useEffect(()=>{const listener=(e:ClipboardEvent)=>paste.current(e);document.addEventListener("paste",listener);return()=>document.removeEventListener("paste",listener);},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(""),4500);return()=>clearTimeout(t);},[notice]);
  const shortcut=useRef((_:KeyboardEvent)=>{});
  shortcut.current=e=>{
    if(!(e.metaKey||e.ctrlKey)||e.altKey||e.isComposing||e.defaultPrevented||panel||isField(e.target))return;
    const editor=frame.current?.parentElement;
    if(e.target!==document.body && (!(e.target instanceof Element)||!editor?.contains(e.target)||e.target.closest("[role=menu]")))return;
    const key=e.key.toLowerCase();
    if(key==="d" && !e.shiftKey && selected.length){e.preventDefault();if(!e.repeat)duplicate();}
    else if(key==="g" && selected.length){e.preventDefault();if(!e.repeat)quickGroup(e.shiftKey);}
    else if(key==="l" && e.shiftKey && selected.length){e.preventDefault();if(!e.repeat)lockSelection();}
    else if(key==="a" && !e.shiftKey){e.preventDefault();choose(visibleBoardNodes.map(n=>n.id));}
    else if(key==="z" || (key==="y"&&!e.shiftKey)){e.preventDefault();restore(key==="y"||e.shiftKey);}
  };
  useEffect(()=>{const handle=(e:KeyboardEvent)=>shortcut.current(e);document.addEventListener("keydown",handle,true);return()=>document.removeEventListener("keydown",handle,true);},[]);
  const selectionCount=selected.length+edgeIds.length;
  return <div className={css.editor} style={{"--canvas-inverse-zoom":1/zoom,"--footer-scale":Math.min(3,1/zoom),"--arranged-footer-scale":Math.min(1,1/zoom)} as React.CSSProperties} data-organized={Boolean(board.arrangement)||undefined} data-arranging={arranging||undefined} data-multi={ids.length>1||undefined} aria-label="Canvas editor" onKeyDown={e=>{
    if(e.defaultPrevented || isField(e.target) || (e.target instanceof HTMLElement && e.target.closest("button,a,[role=menu]")))return;
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
      <div className={css.heading}><h2>{board.title}</h2></div>
      <CanvasSaveStatus status={saveStatus} updatedAt={board.updatedAt}/>
      {visibleIds && <Action name="Clear board filter" label="Clear filter" icon={<IconX/>} run={()=>{
        if(board.arrangement)change(b=>({...b,arrangement:{...b.arrangement!,organizer:{...organization,filters:[],search:""}}}));
        setRevealAll(true);
      }}/>}
      <Action name="Organize board" label="Organize" icon={<IconTags/>} active={panel==="organizer"} run={()=>show("organizer")}/>
      <div className={css.history}><Action name="Undo" icon={<IconArrowBackUp/>} disabled={!previous.current.length} run={()=>restore()}/><Action name="Redo" icon={<IconArrowForwardUp/>} disabled={!next.current.length} run={()=>restore(true)}/></div>
      <Action name="Focus mode" label="Focus" icon={<IconFocus2/>} active={focus} run={()=>{setFocus(value=>!value);setMultiPick(false);setPanel("");setConnectFrom("");choose([]);}}/>
      <Action name="Board mentions" icon={<IconLink/>} active={panel==="mentions"} run={()=>show("mentions")}/>
      <Action name="Saved views" icon={<IconBookmark/>} label="Views" active={panel==="views"} run={()=>show("views")}/>
    </header>
    <div ref={frame} className={css.stage} data-box-select={multiPick||undefined} data-drop={drop||undefined}
      onDragOver={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();setDrop(true);}}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrop(false);}}
      onDrop={e=>{e.preventDefault();setDrop(false);if(!media.busy&&e.dataTransfer.files.length){
        dropPoint.current=flow.current?.screenToFlowPosition({x:e.clientX,y:e.clientY})||place();
        void media.importFiles(Array.from(e.dataTransfer.files)).finally(()=>{dropPoint.current=null;});
      }}}>
      <div className={css.boardSurface}>
      <BoardActions.Provider value={actions}><ReactFlow<FlowCard,Edge> nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
        onEdgesChange={changes=>setEdgeIds(old=>{const s=new Set(old);for(const c of changes)if(c.type==="select"){if(c.selected)s.add(c.id);else s.delete(c.id);}return [...s];})}
        onInit={instance=>{flow.current=instance;setFlowReady(true);}}
        onPaneClick={()=>{choose([]);setPanel("");setConnectFrom("");}}
        onNodeClick={(event,n)=>{
          if(connectFrom){connect(connectFrom,n.id);return;}
          if(multiPick)togglePicked(n.id);
          else if(!event.shiftKey && !event.ctrlKey && !event.metaKey)choose([n.id]);
          if(panel!=="card"||editing!==n.id)setPanel("");
        }}
        onNodeDragStart={()=>{pointerDrag.current=true;setArranging(false);setPanel("");}}
        onSelectionStart={()=>{boxSelecting.current=true;choose([]);setPanel("");setConnectFrom("");}}
        onSelectionEnd={()=>{boxSelecting.current=false;}}
        onSelectionDragStart={()=>{pointerDrag.current=true;setArranging(false);setPanel("");}}
        selectNodesOnDrag={!multiPick}
        onEdgeClick={(_,e)=>{choose([],[e.id]);setPanel("edge");}}
        onConnect={c=>connect(c.source,c.target)} isValidConnection={c=>c.source!==c.target}
        nodesDraggable={!hand} nodesConnectable={!hand} panOnDrag={hand?true:multiPick?false:[1,2]} selectionOnDrag={!hand} selectionMode={SelectionMode.Partial} paneClickDistance={4}
        multiSelectionKeyCode={["Shift","Meta","Control"]} deleteKeyCode={null} panOnScroll zoomOnScroll={false} zoomOnPinch
        defaultViewport={initialView} fitView={!initialView&&board.nodes.length>0} fitViewOptions={{padding:.23,maxZoom:1}}
        minZoom={.002} maxZoom={3} onlyRenderVisibleElements={board.nodes.length>65} zoomOnDoubleClick={false}
        onViewportChange={rememberView}>
        <Background gap={24} size={1.3} color="#b9c6d5"/>
        <svg width="0" height="0" aria-hidden="true"><defs><marker id="canvas-end-circle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="3.5" fill="#536981"/></marker></defs></svg>
        <ViewportPortal>{board.arrangement && <svg className={css.arrangement} width="1" height="1" role="img" aria-label="Board arrangement"><ArrangementDecorations arrangement={board.arrangement}/></svg>}
        {guides.length>0 && <svg className={css.guides} width="1" height="1" aria-hidden="true">{guides.map(g=>
          <line key={g.axis} vectorEffect="non-scaling-stroke" x1={g.axis==="x"?g.position:g.start} x2={g.axis==="x"?g.position:g.end} y1={g.axis==="y"?g.position:g.start} y2={g.axis==="y"?g.position:g.end}/>
        )}</svg>}{groups.map(({name:label,items,box})=><div key={label} className={css.group} style={{left:box.x-14,top:box.y-34,width:box.width+28,height:box.height+48}}>
          <button type="button" className="nodrag nopan" aria-label={"Select group "+label} onPointerDown={e=>{
            if(e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
            const movableItems=items.filter(n=>!n.locked);
            groupDrag.current=movableItems.length?{clientX:e.clientX,clientY:e.clientY,items:movableItems}:null;choose(items.map(i=>i.id));setPanel("");
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
        <Action name="Select multiple" label="Select" hint="Drag from empty space to select a group, or tap individual items." icon={<IconBoxMultiple/>} active={multiPick} run={()=>{setMultiPick(v=>!v);setHand(false);setPanel("");setConnectFrom("");}}/>
        <Action name="Pan board" icon={<IconHandStop/>} active={hand} run={()=>{setHand(true);setMultiPick(false);}}/>
        <i/>
        <Action name="Add sticky note" icon={<IconNote/>} run={()=>insert("sticky")}/>
        <Action name="Add text" icon={<IconTypography/>} run={()=>insert("text")}/>
        <Action name="Add highlight" icon={<IconHighlight/>} run={()=>insert("highlight")}/>
        <CanvasObjectPicker onAdd={insertObjects}/>
        <Action name="Upload media" icon={<IconUpload/>} disabled={media.busy} run={()=>uploadInput.current?.click()}/>
        <input ref={uploadInput} type="file" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void media.importFiles(files);}}/>
      </div>
      </div>
      {panel==="card"&&edited && <CardFields key={edited.id} node={edited} close={()=>setPanel(fromOrganizer?"organizer":"")} restoreSize={edited.imageSize&&!edited.locked?()=>{patchNodes([edited.id],{...edited.imageSize});reframe([edited.id]);}:undefined} save={patch=>{
        change(b=>({...b,...(categoryDraft?{categories:categoryDraft}:{}),nodes:b.nodes.map(n=>n.id===edited.id?{...n,...patch,...(tagDraft?{tagIds:tagDraft}:{})}:n)}));
        if(organization.filters.some(id=>!(tagDraft??edited.tagIds)?.includes(id)))choose([]);
      }}>
        <ItemTags categories={categoryDraft??board.categories??[]} tagIds={tagDraft??edited.tagIds??[]} onChange={setTagDraft} onCategoriesChange={setCategoryDraft}/>
      </CardFields>}
      {(panel==="organizer" || ((panel==="card" || panel==="bulk-tags") && fromOrganizer)) && <BoardOrganizer hidden={panel!=="organizer"} board={board} categories={board.categories??[]} nodes={displayNodes}
        close={()=>setPanel("")} onEdit={id=>{edit(id);setFromOrganizer(true);}}
        applied={organization} onApply={applyOrganization} onClear={clearOrganization} onTagMatches={items=>openBulkTags(items,true)}/>}
      {panel==="bulk-tags" && <BulkTagPanel key={JSON.stringify(tagTargets)} categories={board.categories??[]}
        items={bulkItems} close={()=>setPanel(fromOrganizer?"organizer":"")}
        apply={(op,tags,additions)=>{change(b=>applyBoardTags(b,tagTargets,op,tags,additions));setPanel(fromOrganizer?"organizer":"");}}/>}
      {panel==="pins" && edited?.ref && <ImagePinsPanel key={edited.id+":"+(initialPin??"")} node={edited} initialPinId={initialPin}
        save={imagePins=>patchNodes([edited.id],{imagePins})} close={()=>setPanel("")}/>}
      {panel==="mentions" && <Panel title="Board mentions" close={()=>setPanel("")}><MentionBacklinks targetHref={"/admin/personal/canvas?board=" + encodeURIComponent(board.id)} /></Panel>}
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
        <label>Gap (px)<input type="number" min="0" max="10000" step="any" placeholder="Auto" value={gap} onChange={e=>setGap(e.target.value)}/></label>
        <div className={css.spacing}>{(["x","y"] as const).map(axis=><button type="button" key={axis}
          disabled={gap===""?movable.length<3:Number(gap)<0||Number(gap)>10000}
          onClick={()=>placeSelection(axis,"space")}>{axis==="x"?"Space horizontally":"Space vertically"}</button>)}</div>
      </Panel>}
      {panel==="appearance" && selected.length>0 && <Panel title="Selection appearance" close={()=>setPanel("")}>
        <div className={css.spacing}>{(["plain","outline","card"] as const).map(value=><button type="button" key={value}
          aria-pressed={selected.every(n=>(n.appearance ?? defaultCanvasAppearance(n))===value)}
          onClick={()=>{patchNodes(ids,{appearance:value});setFrameDraft({});}}>{canvasAppearances[value]}</button>)}</div>
        <FrameFields nodes={selected} draft={frameDraft} onChange={setFrameDraft}/>
        {Object.keys(frameDraft).length>0 && <button type="button" className={css.primary} onClick={()=>{
          const targets=new Set(ids);
          change(b=>({...b,nodes:b.nodes.map(n=>targets.has(n.id)?withFrame(n,frameDraft):n)}));setFrameDraft({});
        }}>Apply frame</button>}
      </Panel>}
      {panel==="group" && <Panel title="Group cards" close={()=>setPanel("")}><form onSubmit={e=>{e.preventDefault();if(name.trim()){patchNodes(ids,{group:name.trim()});setPanel("");}}}>
        <label>Group name<input autoFocus required maxLength={160} list="canvas-group-names" value={name} onChange={e=>setName(e.target.value)}/></label>
        <datalist id="canvas-group-names">{groups.map(g=><option key={g.name}>{g.name}</option>)}</datalist>
        <button className={css.primary}>Group cards</button>
        {selected.some(n=>n.group)&&<button type="button" onClick={()=>{patchNodes(ids,{group:""});setPanel("");}}>Ungroup selection</button>}
      </form></Panel>}
      {panel==="views" && <SavedViews views={board.views} organizer={organization} getLayout={()=>({
        positions:snapshotPositions(board.nodes),arrangement:board.arrangement?{...board.arrangement,organizer:organization}:undefined
      })} close={()=>setPanel("")}
        frameSize={frameSize} present={()=>setPresenting(true)} exportPdf={exportPdf}
        currentViewport={()=>flow.current?.getViewport()}
        changeViews={changeViews}
        open={openBookmark}/>}
      {!focus && selectionCount>0 && !panel && !connectFrom && <div className={css.selection} role="toolbar" aria-label="Selection actions">
        {selected.length>1 && <><span className={css.pickCount} aria-live="polite">{selected.length} selected</span>
          <Action name="Arrange selection" label="Arrange" icon={<IconArrowsMove/>} disabled={movable.length<2} run={()=>show("arrange")}/></>}
        {one && <Action name="Connect to another card" icon={<IconLine/>} run={()=>{setConnectFrom(one.id);setMultiPick(false);setHand(false);}}/>}
        {selected.length>0&&<><Action name="Tag selected items" label="Tags" icon={<IconTags/>} run={()=>openBulkTags(selected.map(n=>n.id))}/>
        <Action name="Selection appearance" label="Style" icon={<IconAdjustments/>} run={()=>{setFrameDraft({});show("appearance");}}/>
        <Action name="Duplicate selection" hint="Duplicate selection (Ctrl/⌘ D)" icon={<IconCopy/>} run={duplicate}/>
        <Action name={movable.length?"Lock position":"Unlock position"} hint="Toggle position lock (Ctrl/⌘ Shift L)" icon={movable.length?<IconLock/>:<IconLockOpen/>} active={!movable.length} run={lockSelection}/>
        <Action name="Group cards" hint="Group selection (Ctrl/⌘ G) · Ungroup (Ctrl/⌘ Shift G)" icon={<IconFrame/>} run={()=>{show("group");setName(one?.group||"");}}/>
        <Action name={selected.every(n=>n.used)?"Mark unused":"Mark used"} icon={<IconCheck/>} active={selected.every(n=>n.used)} run={()=>patchNodes(ids,{used:!selected.every(n=>n.used)})}/></>}
        <Action name="Remove selection from board" disabled={selected.length>0&&!movable.length} icon={<IconTrash/>} run={removeSelected}/>
      </div>}
      <div className={css.navigation} role="toolbar" aria-label="Board navigation">
        <Action name="Snap to align" icon={<IconMagnet/>} active={snap} run={()=>{setSnap(v=>!v);setGuides([]);}}/>
        <Action name="Select all cards" icon={<IconSelectAll/>} disabled={!visibleBoardNodes.length} run={()=>{choose(visibleBoardNodes.map(n=>n.id));setPanel("");}}/>
        <Action name="Arrange cards in a grid" icon={<IconLayoutGrid/>} disabled={board.nodes.length<2} run={arrange}/>
        <i/><Action name="Zoom out" icon={<IconMinus/>} run={()=>void flow.current?.zoomOut({duration:duration()})}/>
        <button type="button" title="Reset zoom" onClick={()=>void flow.current?.zoomTo(1,{duration:duration()})}>{Math.round(zoom*100)}%</button>
        <Action name="Zoom in" icon={<IconPlus/>} run={()=>void flow.current?.zoomIn({duration:duration()})}/>
        <Action name="Fit board" icon={<IconMaximize/>} run={()=>board.arrangement?fitArrangement(board,displayNodes,organization):void flow.current?.fitView({padding:.2,maxZoom:1.3,duration:duration()})}/>
      </div>
      {panel==="" && board.nodes.length>0 && visibleIds?.size===0 && <div className={css.empty}><IconTags size={28}/><h3>No matching items</h3></div>}
      {(connectFrom||media.message||notice||drop) && <div className={css.message} role="status">{drop?"Drop to add to Media and this board":connectFrom?"Choose the card to connect to":notice||media.message}{connectFrom&&<Action name="Cancel connection" run={()=>setConnectFrom("")} icon={<IconX/>}/>}</div>}
    </div>
    {presenting && <CanvasPresentation board={sourceBoard} nodes={sourceNodes} fallbackSize={frameSize()} close={()=>setPresenting(false)} exportPdf={exportPdf}/>}
  </div>;
}
