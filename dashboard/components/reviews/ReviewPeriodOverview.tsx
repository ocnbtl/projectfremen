"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import type { ReviewPeriodContext } from "../../lib/modules/reviews/period-context";
import styles from "./ReviewsWorkspace.module.css";
export default function ReviewPeriodOverview({start,end}:{start:string;end:string}) {
  const [data,setData] = useState<ReviewPeriodContext|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(() => {setData(null);setError("");},[start,end]);
  async function load() {
    setBusy(true);setError("");
    try { const response=await fetch(`/api/reviews/period-context?${new URLSearchParams({start,end,zone:Intl.DateTimeFormat().resolvedOptions().timeZone})}`); const result=await response.json(); if(!response.ok)throw new Error(result.error);setData(result); }
    catch(error){setError(error instanceof Error?error.message:"Could not load review context");}
    finally{setBusy(false);}
  }
  const current = data?.start === start && data.end === end ? data : null;
  return <section className={styles.periodOverview} aria-label="Review period overview">
    <header><div><h2>Your period at a glance</h2><p>Review recorded activity, then capture what matters below.</p></div><WorkspaceButton icon="review" busy={busy} onClick={() => void load()}>{current?"Refresh overview":"Load overview"}</WorkspaceButton></header>
    {error && <p role="alert">{error}</p>}
    {current && <><div className={styles.periodGroups}>{current.groups.map(group => <article key={group.id}><header><UnigentamosIcon role={group.icon}/><h3>{group.label}</h3><strong>{group.unavailable?"—":group.count}</strong></header><p>{group.unavailable?"Could not load this source. Retry or open the module.":group.description}</p>{group.items.length>0 && <ul>{group.items.map((item,index)=><li key={index}><span>{item.label}</span><small>{item.detail}</small></li>)}</ul>}<Link prefetch={false} href={group.href}>Open {group.label}<UnigentamosIcon role="chevron-right"/></Link></article>)}</div><small>Loaded {new Date(current.loadedAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}. This overview does not mark checks complete or save evidence.</small></>}
  </section>;
}
