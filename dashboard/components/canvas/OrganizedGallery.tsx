"use client";
import { useEffect, useRef } from "react";
import { IconAdjustments, IconArrowLeft, IconFocus2 } from "@tabler/icons-react";
import { OrganizerPreview } from "./OrganizerPreview";
import type { organizerRows } from "./organizer-rows";
import css from "./OrganizedGallery.module.css";

type Props={
  results:ReturnType<typeof organizerRows>;
  boardTitle:string;
  onBoard:()=>void;
  onOrganize:()=>void;
  onLocate:(id:string)=>void;
};

export function OrganizedGallery({results,boardTitle,onBoard,onOrganize,onLocate}:Props){
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  return <section className={css.gallery} aria-label={"Organized gallery for "+boardTitle}
    onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();onBoard();}}}>
    <header className={css.header}>
      <div><h3 ref={heading} tabIndex={-1}>Organized view</h3><span>{results.count} {results.count===1?"item":"items"}</span></div>
      <nav aria-label="Gallery controls">
        <button type="button" onClick={onOrganize}><IconAdjustments size={17}/>Adjust</button>
        <button type="button" onClick={onBoard}><IconArrowLeft size={17}/>Back to board</button>
      </nav>
    </header>
    <div className={css.content}>
      {results.groups.map(group=><section key={group.id} className={css.group}>
        {group.name && <h4><i aria-hidden="true" data-tone={group.tone}/>{group.name}<span>{group.rows.length}</span></h4>}
        <ul>{group.rows.map(row=><li key={row.id}>
          <button type="button" className={css.card} onClick={()=>onLocate(row.id)}
            aria-label={"Locate "+row.title+" on canvas"} title={"Locate "+row.title+" on canvas"}>
            <span className={css.art}><OrganizerPreview row={row}/></span>
            <span className={css.caption}><small>{row.kindLabel}</small><strong>{row.title}</strong></span>
            <IconFocus2 aria-hidden="true" className={css.locate} size={17}/>
          </button>
        </li>)}</ul>
      </section>)}
      {!results.count && <div className={css.empty}><IconFocus2 size={26}/><h4>No matching items</h4><button type="button" onClick={onOrganize}>Adjust filters</button></div>}
    </div>
  </section>;
}
