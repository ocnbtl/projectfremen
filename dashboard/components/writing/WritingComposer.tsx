"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWritingPreferences, type WritingSkill } from "../../lib/writing/preferences";
import { objectToken, parseWriting, skillToken } from "../../lib/writing/tokens";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WritingText } from "./WritingText";
import { caretRect, fieldSelection, fieldValue, findCompletion, replaceCompletion, writingField, type Completion, type WritingField } from "./composer-field";
import { useWritingCatalog } from "./useWritingCatalog";
import styles from "./WritingComposer.module.css";

type Choice = { id: string; label: string; detail: string; group: string; icon: string; insertion: string };
const moduleLabels = { people: "People", projects: "Projects", media: "Media", notes: "Notes", finance: "Finance", map: "Places", calendar: "Calendar", personal_ops: "Personal", reviews: "Reviews", resources: "Resources" };
const moduleIcons = { people: "person", projects: "module-projects", media: "module-media", notes: "module-notes", finance: "module-finance", map: "location", calendar: "calendar", personal_ops: "object", reviews: "module-reviews", resources: "module-resources" };
const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/\p{Mark}/gu, "");

function objectChoice(row: NativeObjectRef): Choice {
  const organization = row.objectType === "organization";
  return {
    id: row.route, label: row.label, group: organization ? "Organizations" : moduleLabels[row.module],
    detail: row.objectType.replaceAll("_", " "), icon: organization ? "organization" : moduleIcons[row.module],
    insertion: objectToken(row),
  };
}
function skillChoice(skill: WritingSkill): Choice {
  return { id: skill.id, label: skill.name, detail: skill.description, group: "Skills", icon: "object",
    insertion: skill.behavior === "snippet" ? skill.snippet : skillToken(skill) };
}

type Session = { field: WritingField; match: Completion | null; text: string };
const sameMatch = (a: Completion | null, b: Completion | null) => a?.kind === b?.kind && a?.start === b?.start && a?.end === b?.end && a?.query === b?.query;

export default function WritingComposer() {
  const prefs = useWritingPreferences();
  const id = useId();
  const [session, setSession] = useState<Session | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [limit, setLimit] = useState(4);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState("");
  const [previewHost, setPreviewHost] = useState<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const dismissed = useRef<{field: WritingField; match: Completion} | null>(null);
  const field = session?.field;
  const match = session?.match;
  const query = normalize(match?.query.trim() || "");
  const { catalog, vault } = useWritingCatalog(match?.kind === "object", retry);

  const choices = useMemo(() => {
    if (!match) return [];
    if (match.kind === "skill") return prefs.skills.map(skillChoice);
    const rows = new Map<string, NativeObjectRef>();
    for (const row of [...vault, ...(catalog?.rows || [])]) rows.set(row.route, row);
    return Array.from(rows.values(), objectChoice);
  }, [match?.kind, prefs.skills, catalog, vault]); // The catalog stays stable as the query changes.
  const groups = useMemo(() => {
    const words = query.split(/\s+/).filter(Boolean);
    const groups = new Map<string, Choice[]>();
    const ranked = choices.map(choice => {
      const label = normalize(choice.label);
      const haystack = [label, normalize(choice.detail), normalize(choice.group)].join(" ");
      return { choice, match: words.every(word => haystack.includes(word)), rank: label === query ? 0 : label.startsWith(query) ? 1 : 2 };
    }).filter(item => item.match).sort((a, b) => a.rank - b.rank);
    for (const { choice } of ranked) {
      if (!groups.has(choice.group)) groups.set(choice.group, []);
      groups.get(choice.group)!.push(choice);
    }
    return [...groups.entries()];
  }, [choices, query]);
  const shown = useMemo(() => groups.flatMap(([, items]) => items.slice(0, limit)), [groups, limit]);
  const selected = Math.min(highlight, Math.max(0, shown.length - 1));
  const preview = useMemo(() => Boolean(session?.text.includes("](/admin/") && parseWriting(session.text).some(p => p.kind !== "text")), [session?.text]);

  const refresh = useCallback(() => {
    if (composing.current) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("[data-writing-preview],[data-writing-picker]")) return;
    const field = writingField(active);
    if (!field) { setSession(null); return; }
    const selection = fieldSelection(field);
    const candidate = selection && findCompletion(selection.text, selection.caret, prefs);
    const match = dismissed.current?.field === field && sameMatch(candidate, dismissed.current.match) ? null : candidate;
    if (!candidate || !sameMatch(candidate, dismissed.current?.match || null)) dismissed.current = null;
    const text = fieldValue(field);
    setSession(old => old?.field === field && old.text === text && sameMatch(old.match, match) ? old : { field, text, match });
  }, [prefs]);

  useEffect(() => {
    let blurFrame = 0;
    function blur() { cancelAnimationFrame(blurFrame); blurFrame = requestAnimationFrame(refresh); }
    function startComposition() { composing.current = true; setSession(null); }
    function endComposition() { composing.current = false; refresh(); }
    document.addEventListener("input", refresh, true);
    document.addEventListener("selectionchange", refresh);
    document.addEventListener("focusin", refresh);
    document.addEventListener("focusout", blur);
    document.addEventListener("compositionstart", startComposition);
    document.addEventListener("compositionend", endComposition);
    refresh();
    return () => {
      cancelAnimationFrame(blurFrame);
      document.removeEventListener("input", refresh, true);
      document.removeEventListener("selectionchange", refresh);
      document.removeEventListener("focusin", refresh);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("compositionstart", startComposition);
      document.removeEventListener("compositionend", endComposition);
    };
  }, [refresh]);

  useLayoutEffect(() => { setHighlight(0); setLimit(4); setMessage(""); }, [field, match?.start, match?.kind, query]);
  useLayoutEffect(() => {
    if (!field || !preview) { setPreviewHost(null); return; }
    const host = document.createElement("div");
    host.dataset.writingPreview = "";
    host.className = styles.preview;
    const anchor = field.closest("label") || field;
    anchor.insertAdjacentElement("afterend", host);
    setPreviewHost(host);
    return () => { host.remove(); };
  }, [field, preview]);

  useLayoutEffect(() => {
    const menu = panel.current;
    if (!field || !match || !menu) return;
    menu.showPopover?.();
    function position() {
      if (!field?.isConnected || !menu) { setSession(null); return; }
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const rect = caretRect(field);
      const above = rect.top - y, below = y + height - rect.bottom;
      const placeAbove = below < 220 && above > below;
      const room = Math.max(80, (placeAbove ? above : below) - 16);
      menu.style.width = Math.min(340, width - 16) + "px";
      menu.style.maxHeight = Math.min(340, room) + "px";
      menu.style.left = Math.max(x + 8, Math.min(rect.left, x + width - menu.offsetWidth - 8)) + "px";
      menu.style.top = Math.max(y + 4, Math.min(placeAbove ? rect.top - menu.offsetHeight - 5 : rect.bottom + 5, y + height - menu.offsetHeight - 4)) + "px";
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    observer.observe(field);
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.contains(event.target)) position(); };
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [field, match]);

  const commit = useCallback((choice: Choice) => {
    if (!field || !match || !field.isConnected || document.activeElement !== field) return;
    const current = fieldSelection(field);
    const actual = current && findCompletion(current.text, current.caret, prefs);
    if (!sameMatch(actual, match)) { refresh(); return; }
    if (!replaceCompletion(field, match, choice.insertion)) {
      setMessage("This reference is too long for this field.");
      return;
    }
    refresh();
  }, [field, match, prefs, refresh]);

  useEffect(() => {
    if (!field || !match) return;
    const oldControls = field.getAttribute("aria-controls");
    const oldActive = field.getAttribute("aria-activedescendant");
    field.setAttribute("aria-controls", id);
    if (shown.length) field.setAttribute("aria-activedescendant", id + "-" + selected);
    function key(event: KeyboardEvent) {
      if (event.target !== field || event.isComposing || event.keyCode === 229 || composing.current || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "Escape") {
        dismissed.current = { field: field!, match: match! };
        setSession(old => old && { ...old, match: null });
      } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && shown.length) {
        const next = (selected + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
        setHighlight(next);
        document.getElementById(id + "-" + next)?.scrollIntoView({ block: "nearest" });
      } else if ((event.key === "Tab" || event.key === "Enter") && shown[selected]) {
        commit(shown[selected]);
      } else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      for (const [name, previous] of [["aria-controls", oldControls], ["aria-activedescendant", oldActive]] as const) {
        if (previous === null) field.removeAttribute(name); else field.setAttribute(name, previous);
      }
    };
  }, [field, match, shown, selected, commit, id]);

  let index = -1;
  return <>
    {preview && previewHost && session && createPortal(<div aria-label="Writing preview"><WritingText text={session.text}/></div>, previewHost)}
    {field && match && createPortal(<div className={styles.menu} data-writing-picker="" ref={panel} popover="manual"
      onPointerDown={event => event.preventDefault()}
      onMouseDown={event => event.preventDefault()}>
      <div className={styles.heading}>{match.kind === "skill" ? "Insert a skill" : "Link an object"}<kbd>Tab ↹</kbd></div>
      <div className={styles.scroller} id={id} role="listbox" aria-label={match.kind === "skill" ? "Writing skills" : "Workspace objects"}>
        {groups.map(([group, items]) => <div role="group" aria-label={group} key={group}>
          {match.kind === "object" && <div className={styles.group}>{group}</div>}
          {items.slice(0, limit).map(choice => {
            const position = ++index;
            return <button type="button" key={choice.id} id={id + "-" + position} role="option" aria-selected={position === selected}
              tabIndex={-1} onClick={() => commit(choice)}>
              <UnigentamosIcon role={choice.icon} size={17}/><span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
            </button>;
          })}
        </div>)}
      </div>
      {message && <p role="status">{message}</p>}
      {!shown.length && <p role="status">{match.kind === "object" && !catalog ? "Loading objects…" : "No matches."}</p>}
      {groups.some(([, items]) => items.length > limit) && <button type="button" className={styles.more} tabIndex={-1} onClick={() => setLimit(n => n + 12)}>Show more</button>}
      {match.kind === "object" && catalog?.incomplete && <button type="button" className={styles.more} tabIndex={-1} onClick={() => setRetry(n => n + 1)}>Some modules are unavailable. Retry</button>}
    </div>, field.closest<HTMLElement>('[role="dialog"], dialog') || document.body)}
  </>;
}
