"use client";
import { useEffect, useRef, useState } from "react";
import { IconAdjustments, IconArrowLeft, IconFocus2, IconSquare, IconSquareCheck, IconTags } from "@tabler/icons-react";
import { OrganizerPreview } from "./OrganizerPreview";
import type { organizerRows } from "./organizer-rows";
import css from "./OrganizedGallery.module.css";

type Props={
  results:ReturnType<typeof organizerRows>;
  boardTitle:string;
  onBoard:()=>void;
  onOrganize:()=>void;
  onLocate:(id:string)=>void;
  onTag:(ids:string[])=>void;
};

export function OrganizedGallery({results,boardTitle,onBoard,onOrganize,onLocate,onTag}:Props){
  const heading=useRef<HTMLHeadingElement>(null);
  const [selecting,setSelecting]=useState(false);
  const [picked,setPicked]=useState<Set<string>>(()=>new Set());
  const selected=results.orderedIds.filter(id=>picked.has(id));
  function exitSelection(){setSelecting(false);setPicked(new Set());}
  function activate(id:string){
    if(!selecting){onLocate(id);return;}
    setPicked(previous=>{
      const next=new Set(previous);
      if(next.has(id))next.delete(id);else next.add(id);
      return next;
    });
  }
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  return <section className={css.gallery} aria-label={"Organized gallery for "+boardTitle}
    onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();if(selecting)exitSelection();else onBoard();}}}>
    <header className={css.header}>
      <div><h3 ref={heading} tabIndex={-1}>Organized view</h3><span aria-live="polite">{selecting?`${selected.length} selected`:`${results.count} ${results.count===1?"item":"items"}`}</span></div>
      <nav aria-label="Gallery controls">
        {selecting?<>
          <button type="button" onClick={()=>setPicked(selected.length===results.count?new Set():new Set(results.orderedIds))}>
            {selected.length===results.count?"Deselect all":"Select all"}
          </button>
          <button type="button" className={css.tagAction} disabled={!selected.length} onClick={()=>onTag(selected)}><IconTags size={17}/>Tag selection</button>
          <button type="button" onClick={exitSelection}>Finish selecting</button>
        </>:<>
          <button type="button" disabled={!results.count} onClick={()=>setSelecting(true)}><IconSquareCheck size={17}/>Select</button>
          <button type="button" onClick={onOrganize}><IconAdjustments size={17}/>Adjust</button>
          <button type="button" onClick={onBoard}><IconArrowLeft size={17}/>Back to board</button>
        </>}
      </nav>
    </header>
    <div className={css.content}>
      {results.groups.map(group=><section key={group.id} className={css.group}>
        {group.name && <h4><i aria-hidden="true" data-tone={group.tone}/>{group.name}<span>{group.rows.length}</span></h4>}
        <ul>{group.rows.map(row=><li key={row.id}>
          <button type="button" className={css.card} onClick={()=>activate(row.id)} aria-pressed={selecting?picked.has(row.id):undefined}
            aria-label={selecting?"Select "+row.title:"Locate "+row.title+" on canvas"} title={selecting?row.title:"Locate "+row.title+" on canvas"}>
            <span className={css.art}><OrganizerPreview row={row}/></span>
            <span className={css.caption}><small>{row.kindLabel}</small><strong>{row.title}</strong></span>
            {selecting?(picked.has(row.id)?<IconSquareCheck aria-hidden className={css.locate} size={18}/>:<IconSquare aria-hidden className={css.locate} size={18}/>)
              :<IconFocus2 aria-hidden className={css.locate} size={17}/>}
          </button>
        </li>)}</ul>
      </section>)}
      {!results.count && <div className={css.empty}><IconFocus2 size={26}/><h4>No matching items</h4><button type="button" onClick={onOrganize}>Adjust filters</button></div>}
    </div>
  </section>;
}
