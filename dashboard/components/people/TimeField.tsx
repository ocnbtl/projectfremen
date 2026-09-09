"use client";
import * as Popover from "@radix-ui/react-popover";
import { useRef, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export default function TimeField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  const [open,setOpen]=useState(false);
  const wheel=useRef<HTMLDivElement>(null);
  const [hour,minute]=(value || "12:00").split(":");
  return <div className="people-time-field"><label>{label}<input type="time" value={value} onChange={event=>onChange(event.target.value)} /></label>
    <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" aria-label={`Choose ${label.toLowerCase()} time`}><UnigentamosIcon role="clock" size={18} /></button></Popover.Trigger>
      <Popover.Portal><Popover.Content className="app-select-menu people-time-wheel" sideOffset={6} collisionPadding={12} onEscapeKeyDown={event=>event.stopImmediatePropagation()} onOpenAutoFocus={()=>{wheel.current?.querySelectorAll<HTMLElement>('[aria-pressed="true"]').forEach(el=>el.scrollIntoView({block:"center"}));}}>
        <strong>{label} time</strong><div ref={wheel} className="people-time-wheel-columns">{[{label:"Hour",count:24,current:hour},{label:"Minute",count:60,current:minute}].map(column=><div key={column.label}><span>{column.label}</span><div role="group" aria-label={`${label} ${column.label.toLowerCase()}`} onKeyDown={event=>{if (!["ArrowDown","ArrowUp","Home","End"].includes(event.key)) return;event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll('button'));const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key === "Home"?0:event.key === "End"?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key === "ArrowDown"?1:-1)))]?.focus();}}>{Array.from({length:column.count},(_,i)=>String(i).padStart(2,"0")).map(number=><button key={number} type="button" aria-pressed={number===column.current} onClick={()=>onChange(column.label === "Hour"?`${number}:${minute}`:`${hour}:${number}`)}>{number}</button>)}</div></div>)}</div>
        <footer><button type="button" onClick={()=>{onChange("");setOpen(false);}}>Clear</button><button type="button" onClick={()=>setOpen(false)}>Done</button></footer>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
