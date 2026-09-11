"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PersonalRecord } from "../../lib/personal-records-store";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import * as Popover from "@radix-ui/react-popover";
import SelectField from "../ui/SelectField";
import { PeopleProfileAvatar } from "./PeopleProfilePhoto";
import InteractionCheckbox from "./InteractionCheckbox";

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
          return person && !person.archivedAt ? <button key={id} onClick={() => onOpenPerson(person)}><PeopleProfileAvatar label={person.title} initials={person.title.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase()} photoUrl={person.profile?.photoUrl} photoUpdatedAt={person.profile?.photoUpdatedAt} compact /><span>{person.title}</span><UnigentamosIcon role="chevron-right" size={16} /></button>
            : <p key={id}>{person ? `${person.title} (archived)` : "Profile unavailable"}</p>;
        })}{!item.participantIds.length && <p>No participants recorded.</p>}</div></section>
        <section className="people-interaction-detail-notes"><h3>Notes</h3><p>{item.summary || "No additional notes recorded."}</p></section>
        <dl className="people-interaction-detail-facts">
          {item.approach && <div><dt>Approach</dt><dd>{label(item.approach)}</dd></div>}
          <div><dt>Source</dt><dd>{item.source === "profile" ? "Profile history" : "Logged interaction"}</dd></div>
        </dl>
        <InteractionCheckbox checked={Boolean(item.updatesLastContact)} />
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
  const approach = ["unspecified", "cold", "warm"].includes(params.get("approach") || "") ? params.get("approach")! : "";
  const contact = ["yes", "no"].includes(params.get("contact") || "") ? params.get("contact")! : "";
  const [filtersOpen, setFiltersOpen] = useState(false), [sortOpen, setSortOpen] = useState(false);
  const filterCount = [kind, approach, contact].filter(Boolean).length;
  const [limit, setLimit] = useState(50);
  useEffect(() => { setLimit(50); }, [query, kind, order, approach, contact]);
  function navigate(values: Record<string, string>, push = false) {
    const next = new URLSearchParams(params.toString());
    next.set("sidebar", "interactions");
    for (const [key, value] of Object.entries(values)) value ? next.set(key, value) : next.delete(key);
    window.history[push ? "pushState" : "replaceState"](null, "", `${pathname}?${next}`);
  }
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return items.filter(item => (!kind || item.kind.toLowerCase().replace(" ", "-") === kind) && (!approach || (item.approach || "unspecified") === approach) && (!contact || Boolean(item.updatesLastContact) === (contact === "yes")) && (!search || [item.title, item.summary, item.date, item.kind,
      ...item.participantIds.map(id => people.find(p => p.id === id)?.title)].filter(Boolean).join(" ").toLocaleLowerCase().includes(search)))
      .sort((a, b) => {
        const ad = validDate(a.date), bd = validDate(b.date);
        if (ad !== bd) return ad ? -1 : 1;
        const comparison = ad ? `${a.date}T${a.startTime || "00:00"}`.localeCompare(`${b.date}T${b.startTime || "00:00"}`) : 0;
        return (order === "oldest" ? comparison : -comparison) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
      });
  }, [items, people, query, kind, order, approach, contact]);
  const groups = new Map<string, InteractionEntry[]>();
  for (const item of filtered.slice(0, limit)) {
    const key = validDate(item.date) ? item.date!.slice(0, 7) : "unknown";
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return <section className="people-interactions-workspace" aria-label="Interaction history">
    <div className="people-interactions-tools">
      <div className="people-primary-search"><UnigentamosIcon role="search" size={18} /><input aria-label="Search interactions" placeholder="Search interactions, notes or participants…" value={query} onChange={event => onQueryChange(event.target.value)} />{query && <button type="button" className="people-search-clear" aria-label="Clear interaction search" onClick={() => onQueryChange("")}><UnigentamosIcon role="close" size={16} /></button>}
        <div className="people-search-controls">
          <Popover.Root open={filtersOpen} onOpenChange={open => { setFiltersOpen(open); if (open) setSortOpen(false); }}><Popover.Trigger asChild><button type="button" className="people-control-trigger" aria-label={filtersOpen ? "Hide filters" : "Show filters"}><UnigentamosIcon role="filter" size={18} /><span>Filter</span>{filterCount > 0 && <strong>{filterCount}</strong>}</button></Popover.Trigger>
            <Popover.Portal><Popover.Content className="app-select-menu people-interactions-menu people-interactions-filters" sideOffset={10} align="end" collisionPadding={12} aria-label="Filter interactions" onEscapeKeyDown={event => event.stopImmediatePropagation()}>
              <header><UnigentamosIcon role="filter" size={18} /><h2>Filters</h2></header>
              <div className="people-interactions-filter-fields">
                <label>Type<SelectField aria-label="Interaction type" value={kind} onChange={event => navigate({ kind: event.target.value })}><option value="">All types</option>{kinds.map(k => <option key={k} value={k}>{label(k)}</option>)}</SelectField></label>
                <label>Approach<SelectField aria-label="Filter approach" value={approach} onChange={event => navigate({ approach: event.target.value })}><option value="">Any approach</option><option value="unspecified">Unspecified</option><option value="cold">Cold</option><option value="warm">Warm</option></SelectField></label>
                <label>Latest contact<SelectField aria-label="Latest contact filter" value={contact} onChange={event => navigate({ contact: event.target.value })}><option value="">All interactions</option><option value="yes">Used for latest contact</option><option value="no">Not used for latest contact</option></SelectField></label>
              </div>
              <footer><button type="button" onClick={() => navigate({ kind: "", approach: "", contact: "" })}>Reset</button><button type="button" onClick={() => setFiltersOpen(false)}>Show results</button></footer>
            </Popover.Content></Popover.Portal>
          </Popover.Root>
          <Popover.Root open={sortOpen} onOpenChange={open => { setSortOpen(open); if (open) setFiltersOpen(false); }}><Popover.Trigger asChild><button type="button" className="people-control-trigger" aria-label={sortOpen ? "Hide sorting" : "Show sorting"}><UnigentamosIcon role="sort" size={18} /><span>Sort</span></button></Popover.Trigger>
            <Popover.Portal><Popover.Content className="app-select-menu people-interactions-menu people-interactions-sort" sideOffset={10} align="end" collisionPadding={12} aria-label="Sort interactions" onEscapeKeyDown={event => event.stopImmediatePropagation()}>
              <header><UnigentamosIcon role="sort" size={18} /><h2>Sort interactions</h2></header>
              <div className="people-sort-options" role="menu" aria-label="Sort interactions" onKeyDown={event => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll('button')), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                buttons[event.key === "Home" ? 0 : event.key === "End" ? 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + 2) % 2]?.focus();
              }}><span className="people-sort-selection" aria-hidden="true" style={{ transform: `translateY(${order === "oldest" ? 42 : 0}px)` }} />{([['newest', 'Newest first'], ['oldest', 'Oldest first']] as const).map(([value, title]) => <button type="button" role="menuitemradio" key={value} aria-checked={order === value} onClick={() => navigate({ order: value === "newest" ? "" : value })}><span>{title}</span><span className={`people-sort-check${order === value ? " is-visible" : ""}`} aria-hidden="true"><UnigentamosIcon role="check" size={16} /></span></button>)}</div>
            </Popover.Content></Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </div>
    {error ? <div role="alert" className="notes-empty-state"><h2>Interactions could not be loaded</h2><p>{error}</p><button onClick={() => window.location.reload()}>Reload</button></div> : <>
      <p className="people-visually-hidden" role="status">{filtered.length} matching interactions</p>
      {filtered.length ? <div className="people-interaction-groups">{[...groups].map(([month, entries]) => <section key={month} aria-label={month === "unknown" ? "Date not recorded" : dateLabel(`${month}-01`, true)}>
        <h2>{month === "unknown" ? "Date not recorded" : dateLabel(`${month}-01`, true)}</h2><ul>{entries.map(item => <li key={item.id}><button className="people-interaction-row" aria-haspopup="dialog" aria-label={`View interaction: ${item.title}`} onClick={() => navigate({ interaction: item.id }, true)}>
          <span className="people-interaction-row-date"><time dateTime={validDate(item.date) ? item.date : undefined}>{validDate(item.date) ? new Date(`${item.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "Undated"}</time><small>{timeLabel(item.startTime)}</small></span>
          <span className="people-interaction-row-main"><strong>{item.title}</strong><span>{item.participantIds.map(id => people.find(p => p.id === id)?.title || "Profile unavailable").join(" · ") || "No participants recorded"}</span>{item.summary && <p>{item.summary}</p>}</span>
          <span className="people-interaction-type">{label(item.kind)}</span><UnigentamosIcon role="chevron-right" size={18} />
        </button></li>)}</ul>
      </section>)}</div> : <div className="notes-empty-state"><UnigentamosIcon role="interaction" size={26} /><h2>{items.length ? "No matching interactions" : "Your history starts here"}</h2><p>{items.length ? "Try another name, phrase or filter." : "Log an interaction above to keep conversations, meetings and memories together."}</p>{(query || filterCount > 0) && <button onClick={() => { onQueryChange(""); navigate({ kind: "", approach: "", contact: "", query: "" }); }}>Clear filters</button>}</div>}
      {filtered.length > limit && <button className="people-interactions-more" onClick={() => setLimit(current => current + 50)}>Show more · {filtered.length - limit} remaining</button>}
      {selectedId && <InteractionDetail key={selectedId} item={items.find(item => item.id === selectedId)} people={people} onClose={() => navigate({ interaction: "" }, true)} onOpenPerson={onOpenPerson} />}
    </>}
  </section>;
}
