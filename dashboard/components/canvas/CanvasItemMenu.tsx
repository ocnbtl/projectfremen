"use client";
import * as Popover from "@radix-ui/react-popover";
import { IconAdjustments, IconArrowUpRight, IconCheck, IconDots, IconPencil } from "@tabler/icons-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { canvasAppearances, defaultCanvasAppearance, type CanvasAppearance, type CanvasNode } from "../../lib/modules/canvas/model";
import styles from "./CanvasItem.module.css";

type Props = {
  item:CanvasNode;
  label:string;
  edit:()=>void;
  style:()=>void;
  open:()=>void;
  setAppearance:(value:CanvasAppearance)=>void;
};

export function CanvasItemMenu({item,label,edit,open,style,setAppearance}:Props) {
  const [visible,setVisible]=useState(false);
  const menu=useRef<HTMLDivElement>(null);
  const initialFocus=useRef<"first"|"last">("first");
  const openingPanel=useRef(false);
  const appearance=item.appearance ?? defaultCanvasAppearance(item);
  function rows() {
    return Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') || []);
  }
  function navigate(event:KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    const items=rows(), current=items.indexOf(document.activeElement as HTMLElement);
    let index:number;
    switch (event.key) {
      case "ArrowDown": index=(current+1)%items.length; break;
      case "ArrowUp": index=(current+items.length-1)%items.length; break;
      case "Home": index=0; break;
      case "End": index=items.length-1; break;
      case " ":
        if (event.target instanceof HTMLAnchorElement) {event.preventDefault();event.target.click();}
        return;
      case "Tab": setVisible(false); return;
      default: return;
    }
    event.preventDefault();
    items[index]?.focus({preventScroll:true});
  }
  function showPanel(action:()=>void) {
    openingPanel.current=true;
    setVisible(false);
    action();
  }
  return <Popover.Root open={visible} onOpenChange={setVisible}>
    <Popover.Trigger asChild><button type="button" aria-haspopup="menu" className={`nodrag nopan ${styles.trigger}`}
      aria-label={label ? "Item actions for "+label : "Item actions"} title="Item actions"
      onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
      onKeyDown={e=>{
        e.stopPropagation();
        if (e.key==="ArrowDown" || e.key==="ArrowUp") {
          e.preventDefault();initialFocus.current=e.key==="ArrowUp"?"last":"first";setVisible(true);
        }
      }}><IconDots aria-hidden size={20}/></button></Popover.Trigger>
    <Popover.Portal><Popover.Content ref={menu} role="menu" aria-label="Item actions" side="bottom" align="end" sideOffset={5} collisionPadding={10}
      className={styles.menu} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}
      onOpenAutoFocus={e=>{e.preventDefault();const items=rows();items[initialFocus.current==="last"?items.length-1:0]?.focus({preventScroll:true});initialFocus.current="first";}}
      onCloseAutoFocus={e=>{if(openingPanel.current)e.preventDefault();openingPanel.current=false;}}
      onKeyDown={navigate}>
      <button tabIndex={-1} role="menuitem" type="button" onClick={()=>showPanel(edit)}><IconPencil aria-hidden size={17}/>Edit</button>
      {item.ref ? <a tabIndex={-1} role="menuitem" href={item.ref.route} target="_blank" rel="noopener noreferrer" onClick={()=>setVisible(false)}><IconArrowUpRight aria-hidden size={17}/>Open</a>
        : <button tabIndex={-1} role="menuitem" type="button" onClick={()=>showPanel(open)}><IconArrowUpRight aria-hidden size={17}/>Open</button>}
      <button tabIndex={-1} role="menuitem" type="button" onClick={()=>showPanel(style)}><IconAdjustments aria-hidden size={17}/>Frame settings</button>
      <div role="group" aria-label="Appearance" className={styles.choices}><span aria-hidden>Appearance</span>
        {(Object.keys(canvasAppearances) as CanvasAppearance[]).map(value=><button type="button" role="menuitemradio" tabIndex={-1} key={value}
          aria-checked={appearance===value} onClick={()=>{setAppearance(value);setVisible(false);}}>
          <i aria-hidden data-preview={value}/>{canvasAppearances[value]}{appearance===value && <IconCheck aria-hidden size={15}/>}
        </button>)}
      </div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
