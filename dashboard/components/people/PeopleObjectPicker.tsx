"use client";

import { useId, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";

const kinds = [
  { id: "all", label: "All", icon: "object" },
  { id: "person", label: "People", icon: "person" },
  { id: "organization", label: "Organizations", icon: "organization" },
  { id: "project", label: "Projects", icon: "module-projects" },
  { id: "resource", label: "Resources", icon: "module-resources" },
  { id: "note", label: "Notes", icon: "module-notes" },
  { id: "other", label: "Other", icon: "object" }
] as const;
type Kind = typeof kinds[number]["id"];
export const objectTargetKey = (target: NativeObjectRef) => `${target.module}:${target.objectType}:${target.objectId}`;
const kindOf = (target: NativeObjectRef): Kind => {
  if (target.module === "people") return target.objectType === "organization" ? "organization" : "person";
  if (target.module === "projects") return "project";
  if (target.module === "resources") return "resource";
  if (target.module === "notes") return "note";
  return "other";
};
const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
const typeLabel = (target: NativeObjectRef) => kindOf(target) === "other"
  ? target.objectType.replace(/_/g, " ").replace(/^./, letter => letter.toUpperCase())
  : ({ person: "Person", organization: "Organization", project: "Project", resource: "Resource", note: "Note" } as Record<string, string>)[kindOf(target)];

/** One search surface for draft links and existing profiles; selection never writes a record. */
export default function PeopleObjectPicker({ targets, value, onChange, disabled = false }: {
  targets: NativeObjectRef[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(60);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = targets.find(target => objectTargetKey(target) === value);
  const filtered = useMemo(() => {
    const words = searchable(query).trim().split(/\s+/).filter(Boolean);
    return targets.filter(target => (kind === "all" || kindOf(target) === kind)
      && words.every(word => searchable(`${target.label} ${typeLabel(target)}`).includes(word)));
  }, [targets, kind, query]);
  const currentKind = kinds.find(item => item.id === kind)!;
  const shown = filtered.slice(0, limit);
  const tabTarget = shown.some(target => objectTargetKey(target) === value) ? value : shown[0] ? objectTargetKey(shown[0]) : "";
  const select = (target: NativeObjectRef) => { onChange(objectTargetKey(target)); setOpen(false); };

  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) { setQuery(""); setKind("all"); setLimit(60); } }}>
    <Popover.Trigger asChild>
      <button type="button" className="people-object-picker-trigger" aria-label="Object to link" aria-description={selected ? `${selected.label} · ${typeLabel(selected)}` : undefined} aria-haspopup="dialog" disabled={disabled} data-value={value}>
        <UnigentamosIcon role={kinds.find(item => item.id === (selected ? kindOf(selected) : "all"))!.icon} size={20} />
        <span><strong>{selected?.label || "Link an Object"}</strong>{selected && <small>{typeLabel(selected)}</small>}</span>
        <UnigentamosIcon role="chevron-down" size={16} />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="people-object-picker-menu" sideOffset={8} collisionPadding={12} aria-label="Link an object"
        onEscapeKeyDown={event => event.stopImmediatePropagation()}
        onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus(); }}>
        <header><strong>Link an Object</strong><Popover.Close aria-label="Close object search"><UnigentamosIcon role="close" size={18} /></Popover.Close></header>
        <div className="people-object-picker-types" role="group" aria-label="Object types">
          {kinds.map(item => <button type="button" key={item.id} aria-label={item.label} title={item.label} aria-pressed={kind === item.id} onClick={() => { setKind(item.id); setLimit(60); }}>
            <UnigentamosIcon role={item.icon} size={20} /><span>{item.label}</span>
          </button>)}
        </div>
        <div className="people-object-picker-search">
          <UnigentamosIcon role="search" size={18} />
          <input ref={search} type="search" aria-label="Search objects" placeholder={kind === "all" ? "Search all objects…" : `Search ${currentKind.label.toLowerCase()}…`} value={query}
            onChange={event => { setQuery(event.target.value); setLimit(60); }}
            onKeyDown={event => {
              if (event.key === "ArrowDown") { event.preventDefault(); results.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); }
              if (event.key === "Enter") { event.preventDefault(); if (filtered.length === 1) select(filtered[0]); else results.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); }
            }} />
          {query && <button type="button" aria-label="Clear object search" onClick={() => { setQuery(""); setLimit(60); search.current?.focus(); }}><UnigentamosIcon role="close" size={16} /></button>}
        </div>
        <p className="people-object-picker-count" role="status">{filtered.length} {filtered.length === 1 ? "object" : "objects"}{kind !== "all" ? ` · ${currentKind.label}` : ""}</p>
        <div className="people-object-picker-scroll">
          <div ref={results} id={id} role="listbox" aria-label="Matching objects" className="people-object-picker-results"
            onKeyDown={event => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const options = Array.from(results.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
              const index = options.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1);
              options[Math.max(0, Math.min(options.length - 1, next))]?.focus();
            }}>
            {shown.map(target => <button type="button" role="option" tabIndex={objectTargetKey(target) === tabTarget ? 0 : -1} aria-selected={objectTargetKey(target) === value} data-select-value={objectTargetKey(target)} key={objectTargetKey(target)} onClick={() => select(target)}>
              <span className="people-object-picker-result-icon"><UnigentamosIcon role={kinds.find(item => item.id === kindOf(target))!.icon} size={20} /></span>
              <span><strong>{target.label}</strong><small>{typeLabel(target)}</small></span>
              <UnigentamosIcon role={objectTargetKey(target) === value ? "check" : "plus"} size={16} />
            </button>)}
          </div>
          {!filtered.length && <div className="people-object-picker-empty"><UnigentamosIcon role="search" size={24} /><strong>{query ? "No matching objects" : `No ${currentKind.label.toLowerCase()} available`}</strong><span>{query ? "Try another name or a different object type." : "Linked objects are already excluded from this picker."}</span>{kind !== "all" && <button type="button" onClick={() => setKind("all")}>Search all types</button>}</div>}
          {filtered.length > limit && <button className="people-object-picker-more" type="button" onClick={() => setLimit(current => current + 60)}>Show more · {filtered.length - limit} remaining</button>}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
