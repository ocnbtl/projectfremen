"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWritingPreferences, type WritingSkill } from "../../lib/writing/preferences";
import type { WritingUsage } from "../../lib/writing/usage";
import { WritingCopy } from "./WritingText";
import styles from "./WritingSkillUsage.module.css";

type Result = {items: WritingUsage[]; unavailable: string[]};

export default function WritingSkillUsage({skill}: {skill: WritingSkill}) {
  const {skills} = useWritingPreferences();
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{key:string; result?:Result; error?:string}>();
  const params = new URLSearchParams({skill:skill.id});
  for (const item of skills) if (item.behavior === "collection") params.append("collection", item.id);
  const key = params.toString();
  useEffect(() => {
    let current: AbortController | undefined;
    const reload = () => {
      current?.abort();
      current = new AbortController();
      const {signal} = current;
      setResponse(undefined);
      void fetch("/api/admin/writing-usage?" + key, {signal, cache:"no-store"})
        .then(async res => {
          if (!res.ok) throw new Error(res.status === 401 ? "Sign in to see saved uses." : "Saved uses could not be loaded.");
          const result: Result = await res.json();
          if (!signal.aborted) setResponse({key, result});
        }).catch(error => { if (!signal.aborted) setResponse({key, error:error.message}); });
    };
    let queued: ReturnType<typeof setTimeout>;
    const queueReload = () => { clearTimeout(queued); queued = setTimeout(reload, 250); };
    const onRestore = (event: PageTransitionEvent) => { if (event.persisted) reload(); };
    const onStorage = (event: StorageEvent) => { if (event.key === "unigentamos-media-details-changed") queueReload(); };
    reload();
    window.addEventListener("pageshow", onRestore);
    window.addEventListener("storage", onStorage);
    window.addEventListener("unigentamos-media-details-changed", queueReload);
    return () => {
      current?.abort();
      clearTimeout(queued);
      window.removeEventListener("pageshow", onRestore);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("unigentamos-media-details-changed", queueReload);
    };
  }, [key, revision]);
  const matching = response?.key === key ? response : undefined;
  const result = matching?.result;
  const search = query.toLocaleLowerCase().trim();
  const groups = new Map<string, WritingUsage[]>();
  for (const row of result?.items ?? []) {
    if (![row.title, row.area, row.field, row.text].some(text => text.toLocaleLowerCase().includes(search))) continue;
    if (!groups.has(row.area)) groups.set(row.area, []);
    groups.get(row.area)!.push(row);
  }
  return <section className={styles.usage} aria-label={skill.name + " saved uses"}>
    <div className={styles.toolbar}>
      <h3>Saved uses{result ? " (" + result.items.length + ")" : ""}</h3>
      <button type="button" className="work-button" onClick={() => setRevision(n => n + 1)}>Refresh</button>
    </div>
    <input type="search" aria-label="Search saved uses" placeholder="Search text or source" value={query} onChange={e => setQuery(e.target.value)} />
    {!matching && <p role="status">Loading saved uses…</p>}
    {matching?.error && <p role="alert">{matching.error}</p>}
    {Boolean(result?.unavailable.length) && <p role="status">Couldn’t load {result!.unavailable.join(", ")}.</p>}
    {result && !groups.size && <p>{result.items.length ? "No uses match your search." : result.unavailable.length ? "No uses found in the available sources." : "No saved uses yet."}</p>}
    {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([area, rows]) => <section key={area} className={styles.group}>
      <h4>{area} <span>({rows.length})</span></h4>
      <ul>{rows.map(row => <li key={row.key}>
        <div className={styles.source}><Link href={row.href} prefetch={false}>{row.title}</Link><span>{row.field}</span></div>
        {row.text && <>{row.text.length > 160
          ? <details><summary>{row.text.slice(0, 160)}…</summary><p>{row.text}</p></details>
          : <p className={styles.passage}>{row.text}</p>}
          <WritingCopy text={row.text} label={skill.id === "prompt" || skill.id === "copy-prompt" ? "Copy prompt" : "Copy text"} /></>}
      </li>)}</ul>
    </section>)}
  </section>;
}
