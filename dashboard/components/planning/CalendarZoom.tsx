"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./CalendarZoom.module.css";

/** Reflow only the calendar. Two fingers zoom; one finger pans the enlarged surface. */
export default function CalendarZoom({children,enabled=true,resetKey}:{children:ReactNode;enabled?:boolean;resetKey:string}) {
  const viewport=useRef<HTMLDivElement>(null), scaleRef=useRef(1), suppressClick=useRef(0);
  const [scale,setScale]=useState(1),[size,setSize]=useState({width:0,height:0});
  const pending=useRef<{x:number;y:number}|undefined>(undefined);
  useLayoutEffect(()=>{scaleRef.current=1;pending.current={x:0,y:0};setScale(1);if(viewport.current){viewport.current.scrollLeft=0;viewport.current.scrollTop=0;}},[resetKey]);
  useLayoutEffect(()=>{
    const node=viewport.current;if(!node)return;
    const measure=()=>setSize({width:node.clientWidth,height:node.clientHeight});
    const observer=new ResizeObserver(measure);observer.observe(node);measure();return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{if(pending.current&&viewport.current){viewport.current.scrollLeft=pending.current.x;viewport.current.scrollTop=pending.current.y;pending.current=undefined;}},[scale]);
  useEffect(()=>{
    const node=viewport.current;if(!node||!enabled)return;
    let pinch:{distance:number;scale:number;x:number;y:number}|undefined,frame=0;
    const geometry=(event:TouchEvent)=>{const a=event.touches[0],b=event.touches[1],box=node.getBoundingClientRect();return {distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),x:(a.clientX+b.clientX)/2-box.left,y:(a.clientY+b.clientY)/2-box.top};};
    const start=(event:TouchEvent)=>{
      if(event.touches.length===2){event.preventDefault();event.stopPropagation();const g=geometry(event);pinch={distance:g.distance,scale:scaleRef.current,x:(node.scrollLeft+g.x)/scaleRef.current,y:(node.scrollTop+g.y)/scaleRef.current};suppressClick.current=Date.now()+800;}
      else if(scaleRef.current>1.01)event.stopPropagation();
    };
    const move=(event:TouchEvent)=>{
      if(!pinch||event.touches.length!==2)return;
      event.preventDefault();event.stopPropagation();const g=geometry(event),next=Math.max(1,Math.min(3,pinch.scale*g.distance/Math.max(1,pinch.distance)));
      pending.current={x:pinch.x*next-g.x,y:pinch.y*next-g.y};
      if(next===scaleRef.current){node.scrollLeft=pending.current.x;node.scrollTop=pending.current.y;pending.current=undefined;}
      scaleRef.current=next;
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setScale(next));
    };
    const end=(event:TouchEvent)=>{if(pinch)suppressClick.current=Date.now()+500;if(pinch||scaleRef.current>1.01)event.stopPropagation();if(event.touches.length<2)pinch=undefined;};
    node.addEventListener("touchstart",start,{passive:false});node.addEventListener("touchmove",move,{passive:false});node.addEventListener("touchend",end);node.addEventListener("touchcancel",end);
    return()=>{cancelAnimationFrame(frame);node.removeEventListener("touchstart",start);node.removeEventListener("touchmove",move);node.removeEventListener("touchend",end);node.removeEventListener("touchcancel",end);};
  },[enabled]);
  return <div className={styles.shell}>
    <div ref={viewport} className={styles.viewport} data-calendar-zoom={scale.toFixed(2)} style={{touchAction:enabled?"pan-x pan-y":"auto"}} onClickCapture={event=>{if(Date.now()<suppressClick.current){event.preventDefault();event.stopPropagation();}}}>
      <div className={styles.surface} style={{width:size.width?size.width*scale:"100%",height:size.height?size.height*scale:"100%","--calendar-zoom":scale} as CSSProperties}>{children}</div>
    </div>
    {scale>1.01&&<button type="button" className={styles.reset} aria-label="Reset calendar zoom" onClick={()=>{scaleRef.current=1;pending.current={x:0,y:0};setScale(1);}}>Reset zoom · {Math.round(scale*100)}%</button>}
  </div>;
}
