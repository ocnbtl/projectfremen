"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
export default function TaskConfetti({burst,onEnd}:{burst:{x:number;y:number;id:number}|null;onEnd:()=>void}){
 const reduced=useReducedMotion();
 useEffect(()=>{if(!burst)return;const timer=setTimeout(onEnd,750);return()=>clearTimeout(timer);},[burst,onEnd]);
 if(!burst||reduced)return null;
 return createPortal(<span aria-hidden="true" data-task-confetti style={{position:"fixed",left:burst.x,top:burst.y,zIndex:1800,pointerEvents:"none"}}>{Array.from({length:12},(_,i)=><motion.i key={burst.id+":"+i} initial={{x:0,y:0,opacity:1,rotate:0}} animate={{x:Math.cos(i*Math.PI/6)*55,y:[0,-35-Math.sin(i*Math.PI/6)*25,25],opacity:[1,1,0],rotate:i*61}} transition={{duration:.65,ease:"easeOut"}} style={{position:"absolute",width:5,height:8,borderRadius:2,background:["#5f77b5","#7fa883","#d9ad5d","#9d80b4"][i%4]}}/>)}</span>,document.body);
}
