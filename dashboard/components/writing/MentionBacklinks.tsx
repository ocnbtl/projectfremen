"use client";

import { useEffect, useId, useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { watchWritingSources } from "../../lib/writing/source-changes";
import styles from "./MentionBacklinks.module.css";

type Mention = { href: string; title: string; area: string; field: string; context: string };
type Mentions = { items: Mention[]; unavailable: string[] };

function sourceIcon(source: Mention) {
  if (source.href.includes("/canvas?")) return "component";
  if (source.href.includes("?task=")) return "check";
  const module = source.href.split(/[/?]/)[2];
  return ["people","projects","notes","media","resources","reviews","finance","calendar","map"].includes(module) ? "module-" + module : "object";
}

export default function MentionBacklinks({ targetHref, collapsed = false }: { targetHref: string; collapsed?: boolean }) {
  const heading = useId(), body = useId();
  const [expandedTarget, setExpandedTarget] = useState("");
  const open = !collapsed || expandedTarget === targetHref;
  const [response, setResponse] = useState<{ target: string; data?: Mentions; error?: string }>();
  const [version, setVersion] = useState(0);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [targetHref]);
  useEffect(() => {
    if (!open) return;
    let controller: AbortController;
    function load() {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      void fetch("/api/admin/writing-mentions?" + new URLSearchParams({target:targetHref}), { cache:"no-store", signal })
        .then(async res => {
          if (!res.ok) throw new Error(res.status === 401 ? "Sign in to view mentions." : "Couldn’t load mentions.");
          const data: Mentions = await res.json();
          if (!signal.aborted) setResponse({target:targetHref, data});
        }).catch(error => { if (!signal.aborted) setResponse({target:targetHref, error:error.message}); });
    }
    load();
    const stop = watchWritingSources(load);
    return () => { controller.abort(); stop(); };
  }, [open, targetHref, version]);
  const current = response?.target === targetHref ? response : undefined;
  const data = current?.data;
  const title = <><UnigentamosIcon role="link" size={17}/><span>Mentioned in</span>{open && data && <small>{data.items.length}</small>}</>;
  return <section className={styles.panel} aria-labelledby={heading} data-writing-mentions="">
    <div className={styles.bar}><h3 id={heading} className={styles.heading}>{collapsed ?
      <button type="button" aria-expanded={open} aria-controls={body} onClick={() => { setExpandedTarget(open ? "" : targetHref); }}>{title}<span className={styles.arrow}><UnigentamosIcon role={open ? "chevron-up" : "chevron-down"} size={15}/></span></button> : title}</h3>
      {open && <button className={styles.refresh} type="button" title="Refresh mentions" aria-label="Refresh mentions" onClick={() => setVersion(v => v + 1)}><UnigentamosIcon role="refresh" size={15}/></button>}
    </div>
    {open && <div id={body} className={styles.body}>
      {!current && <p role="status">Finding mentions…</p>}
      {current?.error && <p role="status">{current.error} <button type="button" onClick={() => setVersion(v => v + 1)}>Retry</button></p>}
      {data && <>
        {data.unavailable.length > 0 && <p role="status">Couldn’t check {data.unavailable.join(", ")}. <button type="button" onClick={() => setVersion(v => v + 1)}>Retry</button></p>}
        {!data.items.length && <p>{data.unavailable.length ? "No mentions in the available sources." : "No mentions yet."}</p>}
        {data.items.length > 0 && <ul>{(showAll ? data.items : data.items.slice(0,6)).map(row => <li key={row.href}>
          <a href={row.href}>
            <span className={styles.icon} aria-hidden="true"><UnigentamosIcon role={sourceIcon(row)} size={17}/></span>
            <span className={styles.copy}><small>{row.area} · {row.field}</small><strong>{row.title}</strong>{row.context && <span>{row.context}</span>}</span>
            <span className={styles.open} aria-hidden="true"><UnigentamosIcon role="chevron-right" size={15}/></span>
          </a>
        </li>)}</ul>}
        {data.items.length > 6 && <button className={styles.more} type="button" onClick={() => setShowAll(all => !all)}>{showAll ? "Show fewer" : "Show all " + data.items.length + " sources"}</button>}
      </>}
    </div>}
  </section>;
}
