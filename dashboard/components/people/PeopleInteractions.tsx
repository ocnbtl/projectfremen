"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PersonalRecord } from "../../lib/personal-records-store";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export type InteractionEntry = {
  id: string; date?: string; kind: string; title: string; summary?: string;
  participantIds: string[]; startTime?: string; endTime?: string;
  approach?: string; updatesLastContact?: boolean; source: "record" | "profile";
};
const kinds = ["call", "message", "email", "meeting", "catch-up", "note", "memory", "milestone"];
const label = (value: string) => value ? value[0].toUpperCase() + value.slice(1).replace(/-/g, " ") : "Interaction";
const validDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)));
const dateLabel = (value?: string, month = false) => validDate(value)
  ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", ...(month ? {} : { day: "numeric" }) })
  : "Date not recorded";
const timeLabel = (value?: string) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "";
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};

function InteractionDetail({ item, people, onClose, onOpenPerson }: {
  item?: InteractionEntry; people: PersonalRecord[]; onClose: () => void; onOpenPerson: (person: PersonalRecord) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="people-interaction-detail" aria-labelledby="interaction-detail-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="people-interaction-detail-content">
      <header><span>Interaction details</span><button type="button" autoFocus aria-label="Close interaction details" onClick={onClose}><UnigentamosIcon role="close" size={20} /></button></header>
      {item ? <>
        <div className="people-interaction-detail-heading"><span className="people-interaction-type"><UnigentamosIcon role="interaction" size={18} />{label(item.kind)}</span><h2 id="interaction-detail-title">{item.title}</h2>
          <p><time dateTime={validDate(item.date) ? item.date : undefined}>{dateLabel(item.date)}</time>{item.startTime ? ` · ${timeLabel(item.startTime)}${item.endTime ? `–${timeLabel(item.endTime)}` : ""}` : ""}</p>
        </div>
        <section aria-label="Participants"><h3>Participants</h3><div className="people-interaction-detail-participants">{item.participantIds.map(id => {
          const person = people.find(p => p.id === id);
          return person && !person.archivedAt ? <button key={id} onClick={() => onOpenPerson(person)}><UnigentamosIcon role={person.className === "org" ? "organization" : "person"} size={18} /><span>{person.title}</span><UnigentamosIcon role="chevron-right" size={16} /></button>
            : <p key={id}>{person ? `${person.title} (archived)` : "Profile unavailable"}</p>;
        })}{!item.participantIds.length && <p>No participants recorded.</p>}</div></section>
        <section className="people-interaction-detail-notes"><h3>Notes</h3><p>{item.summary || "No additional notes recorded."}</p></section>
        <dl className="people-interaction-detail-facts">
          {item.approach && <div><dt>Approach</dt><dd>{label(item.approach)}</dd></div>}
          <div><dt>Source</dt><dd>{item.source === "profile" ? "Profile history" : "Logged interaction"}</dd></div>
          <div><dt>Last contact</dt><dd>{item.updatesLastContact ? "Counts toward last contact" : "Does not update last contact"}</dd></div>
        </dl>
      </> : <div className="notes-empty-state"><h2 id="interaction-detail-title">Interaction unavailable</h2><p>This interaction may have been removed or its profile is unavailable. Close this panel to return to your history.</p></div>}
    </div>
  </dialog>;
}

export default function PeopleInteractions({ items, people, query, onQueryChange, onOpenPerson, error }: {
  items: InteractionEntry[]; people: PersonalRecord[]; query: string; onQueryChange: (value: string) => void;
  onOpenPerson: (person: PersonalRecord) => void; error?: string;
}) {
  const params = useSearchParams(), pathname = usePathname();
  const selectedId = params.get("interaction") || "";
  const kind = kinds.includes(params.get("kind") || "") ? params.get("kind")! : "";
  const order = params.get("order") === "oldest" ? "oldest" : "newest";
  const [limit, setLimit] = useState(50);
  useEffect(() => { setLimit(50); }, [query, kind, order]);
  function navigate(values: Record<string, string>, push = false) {
    const next = new URLSearchParams(params.toString());
    next.set("sidebar", "interactions");
    for (const [key, value] of Object.entries(values)) value ? next.set(key, value) : next.delete(key);
    window.history[push ? "pushState" : "replaceState"](null, "", `${pathname}?${next}`);
  }
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return items.filter(item => (!kind || item.kind.toLowerCase().replace(" ", "-") === kind) && (!search || [item.title, item.summary, item.date, item.kind,
      ...item.participantIds.map(id => people.find(p => p.id === id)?.title)].filter(Boolean).join(" ").toLocaleLowerCase().includes(search)))
      .sort((a, b) => {
        const ad = validDate(a.date), bd = validDate(b.date);
        if (ad !== bd) return ad ? -1 : 1;
        const comparison = ad ? a.date!.localeCompare(b.date!) : 0;
        return (order === "oldest" ? comparison : -comparison) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
      });
  }, [items, people, query, kind, order]);
  const groups = new Map<string, InteractionEntry[]>();
  for (const item of filtered.slice(0, limit)) {
    const key = validDate(item.date) ? item.date!.slice(0, 7) : "unknown";
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return <section className="people-interactions-workspace" aria-label="Interaction history">
    <div className="people-interactions-tools">
      <div className="people-primary-search"><UnigentamosIcon role="search" size={18} /><input aria-label="Search interactions" placeholder="Search interactions, notes or participants…" value={query} onChange={event => onQueryChange(event.target.value)} />{query && <button type="button" className="people-search-clear" aria-label="Clear interaction search" onClick={() => onQueryChange("")}><UnigentamosIcon role="close" size={16} /></button>}</div>
      <label><span>Type</span><select aria-label="Interaction type" value={kind} onChange={event => navigate({ kind: event.target.value })}><option value="">All types</option>{kinds.map(k => <option key={k} value={k}>{label(k)}</option>)}</select></label>
      <label><span>Sort</span><select aria-label="Sort interactions" value={order} onChange={event => navigate({ order: event.target.value === "newest" ? "" : "oldest" })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
    {error ? <div role="alert" className="notes-empty-state"><h2>Interactions could not be loaded</h2><p>{error}</p><button onClick={() => window.location.reload()}>Reload</button></div> : <>
      <p className="people-interactions-count" role="status">{filtered.length} {filtered.length === 1 ? "interaction" : "interactions"}{query || kind ? ` · ${items.length} recorded` : " · Across People and Organizations"}</p>
      {filtered.length ? <div className="people-interaction-groups">{[...groups].map(([month, entries]) => <section key={month} aria-label={month === "unknown" ? "Date not recorded" : dateLabel(`${month}-01`, true)}>
        <h2>{month === "unknown" ? "Date not recorded" : dateLabel(`${month}-01`, true)}</h2><ul>{entries.map(item => <li key={item.id}><button className="people-interaction-row" aria-haspopup="dialog" aria-label={`View interaction: ${item.title}`} onClick={() => navigate({ interaction: item.id }, true)}>
          <span className="people-interaction-row-date"><time dateTime={validDate(item.date) ? item.date : undefined}>{validDate(item.date) ? new Date(`${item.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "Undated"}</time><small>{timeLabel(item.startTime)}</small></span>
          <span className="people-interaction-row-main"><strong>{item.title}</strong><span>{item.participantIds.map(id => people.find(p => p.id === id)?.title || "Profile unavailable").join(" · ") || "No participants recorded"}</span>{item.summary && <p>{item.summary}</p>}</span>
          <span className="people-interaction-type">{label(item.kind)}</span><UnigentamosIcon role="chevron-right" size={18} />
        </button></li>)}</ul>
      </section>)}</div> : <div className="notes-empty-state"><UnigentamosIcon role="interaction" size={26} /><h2>{items.length ? "No matching interactions" : "Your history starts here"}</h2><p>{items.length ? "Try another name, phrase or interaction type." : "Log an interaction above to keep conversations, meetings and memories together."}</p>{(query || kind) && <button onClick={() => { onQueryChange(""); navigate({ kind: "", query: "" }); }}>Clear filters</button>}</div>}
      {filtered.length > limit && <button className="people-interactions-more" onClick={() => setLimit(current => current + 50)}>Show more · {filtered.length - limit} remaining</button>}
      {selectedId && <InteractionDetail key={selectedId} item={items.find(item => item.id === selectedId)} people={people} onClose={() => navigate({ interaction: "" }, true)} onOpenPerson={onOpenPerson} />}
    </>}
  </section>;
}
