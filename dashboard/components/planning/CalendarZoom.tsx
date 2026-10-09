"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./CalendarZoom.module.css";

/** Pinching scales one stable canvas; it never reflows events or changes their type size. */
export default function CalendarZoom({children,enabled=true,resetKey}:{children:ReactNode;enabled?:boolean;resetKey:string}) {
  const viewport=useRef<HTMLDivElement>(null), canvas=useRef<HTMLDivElement>(null), extent=useRef<HTMLDivElement>(null);
  const zoom=useRef(1), suppressClick=useRef(0), frame=useRef(0);
  const [scale,setScale]=useState(1);
  const paint=(next:number,x?:number,y?:number)=>{
    const node=viewport.current, surface=canvas.current, space=extent.current;
    if(!node||!surface||!space)return;
    zoom.current=next;
    surface.style.width=`${node.clientWidth}px`;surface.style.height=`${node.clientHeight}px`;
    surface.style.transform=`scale(${next})`;
    space.style.width=`${node.clientWidth*next}px`;space.style.height=`${node.clientHeight*next}px`;
    node.dataset.calendarZoom=next.toFixed(2);
    if(x!==undefined)node.scrollLeft=x;if(y!==undefined)node.scrollTop=y;
  };
  useLayoutEffect(()=>{cancelAnimationFrame(frame.current);paint(1,0,0);setScale(1);},[resetKey]);
  useLayoutEffect(()=>{
    const node=viewport.current;if(!node)return;
    const observer=new ResizeObserver(()=>paint(zoom.current));observer.observe(node);paint(zoom.current);
    return()=>{observer.disconnect();cancelAnimationFrame(frame.current);};
  },[]);
  useEffect(()=>{
    const node=viewport.current;if(!node||!enabled)return;
    let pinch:{distance:number;scale:number;x:number;y:number}|undefined;
    let latest:{scale:number;x:number;y:number}|undefined;
    const flush=()=>{frame.current=0;if(latest){paint(latest.scale,latest.x,latest.y);latest=undefined;}};
    const geometry=(event:TouchEvent)=>{const a=event.touches[0],b=event.touches[1],box=node.getBoundingClientRect();return {distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),x:(a.clientX+b.clientX)/2-box.left,y:(a.clientY+b.clientY)/2-box.top};};
    const start=(event:TouchEvent)=>{
      if(event.touches.length===2){event.preventDefault();event.stopPropagation();const g=geometry(event);pinch={distance:g.distance,scale:zoom.current,x:(node.scrollLeft+g.x)/zoom.current,y:(node.scrollTop+g.y)/zoom.current};node.dataset.pinching="true";suppressClick.current=Date.now()+800;}
      else if(zoom.current>1.01)event.stopPropagation();
    };
    const move=(event:TouchEvent)=>{
      if(!pinch||event.touches.length!==2)return;
      event.preventDefault();event.stopPropagation();const g=geometry(event),next=Math.max(1,Math.min(3,pinch.scale*g.distance/Math.max(1,pinch.distance)));
      latest={scale:next,x:pinch.x*next-g.x,y:pinch.y*next-g.y};
      if(!frame.current)frame.current=requestAnimationFrame(flush);
    };
    const end=(event:TouchEvent)=>{
      if(pinch){suppressClick.current=Date.now()+400;event.stopPropagation();cancelAnimationFrame(frame.current);flush();setScale(zoom.current);}
      else if(zoom.current>1.01)event.stopPropagation();
      if(event.touches.length<2){pinch=undefined;delete node.dataset.pinching;}
    };
    node.addEventListener("touchstart",start,{passive:false});node.addEventListener("touchmove",move,{passive:false});node.addEventListener("touchend",end);node.addEventListener("touchcancel",end);
    return()=>{cancelAnimationFrame(frame.current);node.removeEventListener("touchstart",start);node.removeEventListener("touchmove",move);node.removeEventListener("touchend",end);node.removeEventListener("touchcancel",end);};
  },[enabled]);
  return <div className={styles.shell}>
    <div ref={viewport} className={styles.viewport} data-calendar-zoom="1.00" style={{touchAction:enabled?"pan-x pan-y":"auto"}} onClickCapture={event=>{if(Date.now()<suppressClick.current){event.preventDefault();event.stopPropagation();}}}>
      <div ref={extent} className={styles.extent}><div ref={canvas} className={styles.surface}>{children}</div></div>
    </div>
    {scale>1.01&&<button type="button" className={styles.reset} aria-label="Reset calendar zoom" onClick={()=>{paint(1,0,0);setScale(1);}}>Reset zoom · {Math.round(scale*100)}%</button>}
  </div>;
}
