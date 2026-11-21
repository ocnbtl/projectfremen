"use client";
import { useMemo, useState } from "react";
import { IconMinus, IconPlus, IconTags } from "@tabler/icons-react";
import type { CanvasCategory, CanvasNode } from "../../lib/modules/canvas/model";
import { Panel } from "./CanvasPanels";
import { TagPicker } from "./CanvasTagPicker";
import type { TagOperation } from "./board-tags";
import css from "./CanvasTaxonomy.module.css";

type Props={
  items:CanvasNode[];
  categories:CanvasCategory[];
  close:()=>void;
  apply:(op:TagOperation,tagIds:string[],additions:CanvasCategory[])=>void;
};

export function BulkTagPanel({items,categories,apply,close}:Props){
  const [operation,setOperation]=useState<TagOperation>("add");
  const [picked,setPicked]=useState<string[]>([]);
  const [draft,setDraft]=useState(categories);
  const counts=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const item of items)for(const id of item.tagIds??[])counts.set(id,(counts.get(id)??0)+1);
    return counts;
  },[items]);
  const choices=operation==="add"?draft:categories;
  const availability=new Map(choices.flatMap(category=>category.tags.map(tag=>{
    const count=counts.get(tag.id)??0;
    return [tag.id,{count,disabled:operation==="add"?count===items.length:count===0}] as const;
  })));
  const affected=items.filter(item=>picked.some(id=>operation==="remove"?item.tagIds?.includes(id):!item.tagIds?.includes(id))).length;
  function submit(){
    const additions=draft.flatMap(category=>{
      const saved=categories.find(existing=>existing.id===category.id);
      if(!saved)return [category];
      const tags=category.tags.filter(tag=>!saved.tags.some(existing=>existing.id===tag.id));
      return tags.length?[{...category,tags}]:[];
    });
    apply(operation,picked,additions);
  }
  return <Panel title="Tag selected items" close={close}>
    <div className={css.bulkTags}>
      <div className={css.bulkMode} role="group" aria-label="Tag action">
        {(["add","remove"] as const).map(op=><button type="button" key={op} aria-pressed={op===operation}
          onClick={()=>{if(op!==operation){setOperation(op);setPicked([]);}}}>
          {op==="add"?<IconPlus size={16}/>:<IconMinus size={16}/>} {op==="add"?"Add tags":"Remove tags"}
        </button>)}
      </div>
      {choices.length>0 && <p>Each count shows how many selected items already have that tag.</p>}
      {!choices.length && <p>{operation==="add"?"Create the first category and tag for this board.":"This board has no tags to remove."}</p>}
      <TagPicker key={operation} categories={choices} tagIds={picked} onChange={setPicked}
        onCategoriesChange={setDraft} assignNew canCreate={operation==="add"} availability={availability}/>
      <footer>
        <span role="status">{affected>0?`${affected} ${affected===1?"item":"items"} will change`:`${items.length} selected`}</span>
        <button type="button" disabled={affected===0} onClick={submit}><IconTags size={16}/>Apply tags</button>
      </footer>
    </div>
  </Panel>;
}
