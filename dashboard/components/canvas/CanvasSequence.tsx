"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { getBezierPath, Position } from "@xyflow/react";
import { IconArrowLeft, IconArrowRight, IconFileExport, IconMapPin, IconX } from "@tabler/icons-react";
import { defaultCanvasAppearance, sequenceViews, type Board, type CanvasNode, type CanvasView } from "../../lib/modules/canvas/model";
import { bounds, colors } from "./board-layout";
import { defaultOrganizerOptions, organizerRows, type OrganizerRow } from "./organizer-rows";

type Size = NonNullable<CanvasView["frameSize"]>;
type SlideProps = {board: Board; nodes: CanvasNode[]; view: CanvasView; fallbackSize: Size};
const sheetPath="/canvas-sequence.css";

function slideContent({board,nodes,view,fallbackSize}:SlideProps) {
  const options=view.organizer??defaultOrganizerOptions;
  const size=view.frameSize??fallbackSize;
  const organized=organizerRows(nodes,board.categories??[],options.filters,options.groupBy,options.sortBy,options.search);
  const visibleIds=new Set(organized.orderedIds);
  const included=nodes.filter(node=>visibleIds.has(node.id));
  const framed=included.filter(node=>{
    const x=node.x*view.zoom+view.x, y=node.y*view.zoom+view.y;
    return x < size.width && y < size.height && x+node.width*view.zoom>0 && y+node.height*view.zoom>0;
  });
  return {size,organized,included,framed};
}
type Content=ReturnType<typeof slideContent>;

function Artwork({node,eager=false,full=false,loaded}:{node: Pick<CanvasNode,"ref"|"title">;eager?:boolean;full?:boolean;loaded?:(size:Size)=>void}) {
  const target=node.ref;
  const [attempt,setAttempt]=useState(0);
  if(!target || target.objectType==="workspace_link" || attempt===2)return <span className="cs-image-label">{node.title || target?.label || "Media"}</span>;
  const params=new URLSearchParams({id:target.objectId,v:target.versionId||""});
  const useOriginal=full ? attempt===0 : attempt===1;
  if(useOriginal)params.set("original","1");
  return <img src={"/api/personal/canvas/thumbnail?"+params} alt={node.title || target.label} loading={eager?"eager":"lazy"}
    onLoad={e=>loaded?.({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} onError={()=>setAttempt(i=>Math.min(2,i+1))}/>;
}

function BoardItem({node,zoom}:{node:CanvasNode;zoom:number}) {
  const [actual,setActual]=useState<Size>();
  const media=node.ref?.module==="media";
  const label=node.title || node.ref?.label;
  const imageSize=node.imageSize??actual;
  const scale=imageSize?Math.min(node.width/imageSize.width,node.height/imageSize.height):1;
  const width=imageSize?imageSize.width*scale:node.width, height=imageSize?imageSize.height*scale:node.height;
  const tint=node.fillColor??colors[node.color as keyof typeof colors]??colors.paper;
  const appearance=node.appearance??defaultCanvasAppearance(node);
  const radius=Math.min(node.width*.13,node.height*.13,10/zoom);
  return <g transform={`translate(${node.x} ${node.y})`} data-slide-node={node.id}>
    {appearance!=="plain" && <rect width={node.width} height={node.height} rx={media?0:8}
      fill={appearance==="card"?tint:"none"} stroke={node.strokeColor??"#8796a1"} strokeWidth={node.strokeWidth??1}/>}
    <foreignObject width={node.width} height={node.height}>
      {media?<div className="cs-art"><Artwork node={node} eager full={Math.max(node.width,node.height)*zoom>400}
        loaded={node.imagePins?.length && !node.imageSize?setActual:undefined}/></div>:
        <div className="cs-note">{label && <strong>{label}</strong>}{node.body && node.body!==label && <span>{node.body}</span>}{!label && !node.body && node.kind==="sticky" && "Sticky note"}</div>}
    </foreignObject>
    {media && node.imagePins?.map((pin,index)=><g key={pin.id} transform={`translate(${(node.width-width)/2+pin.x*width} ${(node.height-height)/2+pin.y*height})`}>
      <title>{(index+1)+". "+pin.text}</title><circle r={radius} fill="#18426b" stroke="white" strokeWidth={radius*.16}/>
      <text textAnchor="middle" dy=".34em" fontSize={radius*1.12} fontWeight="700" fill="white">{index+1}</text>
    </g>)}
    {media && (label||node.body) && <foreignObject y={node.height+3/zoom} width={node.width} height={35/zoom}>
      <div className="cs-caption" style={{fontSize:Math.min(13/zoom,node.width/8)}}>{label && <strong>{label}</strong>}{node.body && <span>{node.body}</span>}</div>
    </foreignObject>}
  </g>;
}

function BoardSlide({board,view,content}:{board:Board;view:CanvasView;content:Content}) {
  const marker=useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const {size,framed,included}=content;
  const lookup=new Map(included.map(n=>[n.id,n]));
  const groups=new Map<string,CanvasNode[]>();
  for(const n of included)if(n.group){
    const members=groups.get(n.group)??[];
    members.push(n);groups.set(n.group,members);
  }
  return <svg className="cs-board" aria-label={view.name+" board view"} viewBox={`0 0 ${size.width} ${size.height}`}>
    <svg width={size.width} height={size.height} overflow="hidden">
      <defs>
        <marker id={marker+"arrow"} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="#536981"/></marker>
        <marker id={marker+"circle"} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="3.5" fill="#536981"/></marker>
      </defs>
      <rect width="100%" height="100%" fill="#f5f7f9"/>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {Array.from(groups,([label,items])=>{
          const box=bounds(items);
          return <g key={label}><rect x={box.x-14} y={box.y-34} width={box.width+28} height={box.height+48} rx="13" fill="none" stroke="#8799a9" strokeDasharray="5 4"/>
            <text x={box.x} y={box.y-15} fill="#435b70" fontSize="12">{label}</text></g>;
        })}
        {board.edges.map(edge=>{
          const source=lookup.get(edge.source),target=lookup.get(edge.target);
          if(!source||!target)return null;
          const [path,x,y]=getBezierPath({sourceX:source.x+source.width,sourceY:source.y+source.height/2,sourcePosition:Position.Right,
            targetX:target.x,targetY:target.y+target.height/2,targetPosition:Position.Left});
          return <g key={edge.id}><path d={path} fill="none" stroke="#536981" strokeWidth="2.4" strokeDasharray={edge.style==="dashed"?"7 5":edge.style==="dotted"?"2 5":undefined}
            markerEnd={edge.symbol==="none"?undefined:"url(#"+marker+edge.symbol+")"}/>
            {edge.label && <text x={x} y={y} textAnchor="middle" paintOrder="stroke" stroke="#f5f7f9" strokeWidth="6" fill="#35465a" fontSize="13">{edge.label}</text>}</g>;
        })}
        {framed.map(node=><BoardItem key={node.id} node={node} zoom={view.zoom}/>)}
      </g>
    </svg>
  </svg>;
}

function GalleryCard({row,group,eager}:{row:OrganizerRow;group?:string;eager:boolean}) {
  return <div className="cs-gallery-card">
    <div className="cs-tile" data-kind={row.kind}>{row.ref?.module==="media"?<Artwork node={row} eager={eager}/>:<span>{row.kindLabel}</span>}</div>
    <div className="cs-gallery-caption">{group && <small>{group}</small>}<strong>{row.title}</strong></div>
  </div>;
}

function PinNotes({nodes}:{nodes:CanvasNode[]}) {
  return <div className="cs-pin-notes">{nodes.filter(n=>n.imagePins?.length).map(node=><section key={node.id}>
    <h3>{node.title || node.ref?.label || "Image"}</h3><ol>{node.imagePins!.map(pin=><li key={pin.id}>{pin.text}</li>)}</ol>
  </section>)}</div>;
}

export function CanvasPresentation({board,nodes,fallbackSize,close,exportPdf}:Omit<SlideProps,"view">&{close:()=>void;exportPdf:()=>void}) {
  const [index,setIndex]=useState(0),[pins,setPins]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const views=sequenceViews(board.views);
  const active=Math.min(index,views.length-1),view=views[active];
  const content=useMemo(()=>view && slideContent({board,nodes,fallbackSize,view}),[board,nodes,fallbackSize,view]);
  useEffect(()=>{
    const element=dialog.current,trigger=document.activeElement;
    element?.showModal();
    return ()=>{element?.close();if(trigger instanceof HTMLElement && trigger.isConnected)trigger.focus({preventScroll:true});};
  },[]);
  function go(n:number){
    heading.current?.focus({preventScroll:true});
    setPins(false);setIndex(Math.min(views.length-1,Math.max(0,n)));
  }
  if(!view||!content)return null;
  const hasPins=view.mode!=="gallery" && content.framed.some(n=>n.imagePins?.length);
  return createPortal(<dialog ref={dialog} className="cs-present" role="dialog" aria-label={"Presenting "+board.title}
    onCancel={e=>{e.preventDefault();close();}} onKeyDown={e=>{
      e.stopPropagation();
      if(e.altKey||e.metaKey||e.ctrlKey)return;
      if(e.key==="ArrowRight" || e.key==="PageDown"){e.preventDefault();go(active+1);}
      if(e.key==="ArrowLeft" || e.key==="PageUp"){e.preventDefault();go(active-1);}
      if(e.key==="Home"){e.preventDefault();go(0);}
      if(e.key==="End"){e.preventDefault();go(views.length-1);}
    }}>
    <link rel="stylesheet" href={sheetPath}/>
    <header className="cs-head"><div aria-live="polite"><small>{board.title} · {active+1} / {views.length}</small><h2 ref={heading} tabIndex={-1}>{view.name}</h2></div>
      <button onClick={close} aria-label="Exit presentation" autoFocus><IconX size={20}/></button></header>
    <div className="cs-stage" key={view.id}>
      {view.mode==="gallery"?<div className="cs-gallery">{content.organized.groups.map(group=><section key={group.id}>
        {group.name && <h3>{group.name}</h3>}<div className="cs-grid">{group.rows.map(row=><GalleryCard key={row.id} row={row} eager={false}/>)}</div>
      </section>)}{!content.organized.count && <p>No matching items</p>}</div>:<BoardSlide view={view} board={board} content={content}/>}
      {hasPins && pins && <aside className="cs-notes-panel" aria-label="Image annotations"><h2>Image annotations</h2><PinNotes nodes={content.framed}/></aside>}
    </div>
    <footer className="cs-controls"><button onClick={()=>go(active-1)} disabled={!active} aria-label="Previous view"><IconArrowLeft size={20}/></button>
      <button onClick={()=>go(active+1)} disabled={active===views.length-1} aria-label="Next view"><IconArrowRight size={20}/></button>
      {hasPins && <button onClick={()=>setPins(!pins)} aria-pressed={pins}><IconMapPin size={17}/>Annotations</button>}
      <button onClick={exportPdf}><IconFileExport size={17}/>Export PDF</button></footer>
  </dialog>,document.body);
}

function PrintedView(props:SlideProps & {index:number}) {
  const {board,view,index}=props;
  const content=slideContent(props);
  const header=<header className="cs-print-head"><small>{board.title} · {index+1} / {board.views.length}</small><h2>{view.name}</h2></header>;
  if(view.mode==="gallery"){
    const cards=content.organized.groups.flatMap(group=>group.rows.map(row=>({row,group})));
    // Give every card an actual slot on paper, including overflow from long or multi-tag galleries.
    const pages=Math.max(1,Math.ceil(cards.length/12));
    return Array.from({length:pages},(_,i)=><article className="cs-sheet" key={i}>
      {header}<div className="cs-print-grid">{cards.slice(i*12,(i+1)*12).map(({row,group})=><GalleryCard key={group.id+"."+row.id} row={row} group={group.name} eager/>)}</div>
      {!cards.length && <p>No matching items</p>}{pages>1 && <small className="cs-folio">Gallery page {i+1} of {pages}</small>}
    </article>);
  }
  return <><article className="cs-sheet">{header}<BoardSlide board={board} view={view} content={content}/></article>
    {content.framed.some(n=>n.imagePins?.length) && <article className="cs-notes-sheet">{header}<h2>Image annotations</h2><PinNotes nodes={content.framed}/></article>}</>;
}

function PrintPreview({target,board,nodes,fallbackSize,stylesReady}:{target:Window;stylesReady:Promise<void>}&Omit<SlideProps,"view">) {
  const [status,setStatus]=useState("Preparing images…"),[ready,setReady]=useState(false);
  const pages=useMemo(()=>board.views.map((view,index)=><PrintedView key={view.id} {...{board,nodes,fallbackSize,view,index}}/>),[board,nodes,fallbackSize]);
  useEffect(()=>{
    let cancelled=false;
    async function prepare(){
      await stylesReady;
      // Image errors can replace a source with an original or a text fallback.
      // Check the committed DOM again after the browser has handled those events.
      for(let pass=0;pass<3;pass++){
        if(cancelled || target.closed)return;
        const images=Array.from(target.document.images);
        await Promise.all(images.map(img=>img.decode().catch(()=>{})));
        await new Promise(resolve=>target.setTimeout(resolve,32));
        if(Array.from(target.document.images).every(img=>img.complete && img.naturalWidth))break;
      }
      if(cancelled||target.closed)return;
      await target.document.fonts.ready;
      if(cancelled||target.closed)return;
      setReady(true);setStatus("Choose Save as PDF in the print dialog.");
      target.focus();target.print();
    }
    void prepare().catch(()=>{if(!cancelled)setStatus("Couldn’t prepare the PDF. Return to the board and try again.");});
    return ()=>{cancelled=true;};
  },[target,stylesReady]);
  return <><nav className="cs-print-tools"><p role="status">{status}</p><button disabled={!ready} onClick={()=>target.print()}>Print / Save as PDF</button></nav>{pages}</>;
}

export function openSequencePrint(target:Window,board:Board,nodes:CanvasNode[],fallbackSize:Size) {
  const doc=target.document;
  doc.documentElement.lang=document.documentElement.lang || "en";
  const css=doc.createElement("link");
  css.rel="stylesheet";css.href=new URL(sheetPath,window.location.origin).href;
  const stylesReady=new Promise<void>((resolve,reject)=>{css.onload=()=>resolve();css.onerror=reject;});
  doc.head.append(css);
  const container=doc.createElement("main");
  doc.body.className="cs-print-body";
  doc.body.replaceChildren(container);
  const root=createRoot(container);
  root.render(<PrintPreview {...{target,nodes,fallbackSize,stylesReady}} board={{...board,views:sequenceViews(board.views)}}/>);
  target.addEventListener("pagehide",()=>root.unmount(),{once:true});
}
