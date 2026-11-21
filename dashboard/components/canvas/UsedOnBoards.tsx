"use client";
import { useEffect, useState } from "react";
import type { BoardPlacement, BoardSourceModule, PlacementPage } from "../../lib/modules/canvas/source-reference";
import Icon from "../icons/UnigentamosIcon";
import css from "./UsedOnBoards.module.css";

function BoardLinks({query}:{query:string}) {
  const [placements,setPlacements] = useState<BoardPlacement[]>([]);
  const [after,setAfter] = useState("");
  const [next,setNext] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    if (after) params.set("after",after);
    async function load() {
      try {
        const response = await fetch("/api/personal/canvas/placements?"+params,{cache:"no-store",signal:controller.signal});
        if (!response.ok) throw new Error("Board links could not be loaded.");
        const page:PlacementPage = await response.json();
        if (controller.signal.aborted) return;
        setPlacements(previous=>[...previous,...page.placements]);
        setNext(page.next);
      } catch {
        if (!controller.signal.aborted) setError("Board links could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return ()=>controller.abort();
  },[query,after,attempt]);
  return <div className={css.results}>
    {placements.length>0 && <ul>{placements.map(row=><li key={row.boardId+"/"+row.cardId}>
      <a href={"/admin/personal/canvas?"+new URLSearchParams({board:row.boardId,card:row.cardId})}>
        <strong>{row.boardTitle}</strong><span>Card {row.cardNumber}</span><Icon role="chevron-right" size={15}/>
      </a>
    </li>)}</ul>}
    {loading ? <p role="status">Checking boards…</p> : error ?
      <p role="alert">{error} <button type="button" onClick={()=>{setLoading(true);setError("");setAttempt(n=>n+1);}}>Retry</button></p> :
      next ? <button type="button" onClick={()=>{setLoading(true);setAfter(next);}}>Check more boards</button> :
      !placements.length && <p>No boards use this item.</p>}
  </div>;
}

export default function UsedOnBoards({module,ids}:{module:BoardSourceModule;ids:(string | undefined)[]}) {
  const [open,setOpen] = useState(false);
  const params = new URLSearchParams({module});
  for (const id of new Set(ids)) if (id) params.append("id",id);
  const query = params.toString();
  return <details className={css.section} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><Icon role="component" size={18}/><span>Used on these boards</span><Icon role="chevron-down" size={16}/></summary>
    {open && <BoardLinks key={query} query={query}/>}
  </details>;
}
