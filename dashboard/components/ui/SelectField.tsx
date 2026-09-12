"use client";
import { Children, isValidElement, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };
type Props = SelectHTMLAttributes<HTMLSelectElement> & { searchable?: boolean; columns?: number; triggerContent?: ReactNode; menuClassName?: string; onCreate?: () => void; createLabel?: string };
/** Nonmodal choice menus keep nested dismissals local to their owning control. */
export default function SelectField({ value, defaultValue, onChange, children, className, disabled, required, name, id, searchable = false, columns = 1, triggerContent, menuClassName = "", onCreate, createLabel = "Create organization", ...attributes }: Props) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [internal, setInternal] = useState(String(defaultValue ?? "")), [fieldLabel, setFieldLabel] = useState<string>();
  const chosen = String(value ?? internal);
  useLayoutEffect(() => { const label = trigger.current?.closest("label")?.cloneNode(true) as HTMLElement | undefined; label?.querySelectorAll("button, select, input, textarea").forEach(node => node.remove()); setFieldLabel(label?.getAttribute("aria-label") || label?.textContent?.trim() || undefined); }, []);
  const options: {value:string; label:ReactNode; text:string; disabled?:boolean}[] = [];
  const plain = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<OptionProps>(child) ? plain(child.props.children) : String(child)).join("");
  const collect = (nodes: ReactNode) => Children.forEach(nodes, node => { if (!isValidElement<OptionProps>(node)) return; if (node.type !== "option") { collect(node.props.children); return; } options.push({value:String(node.props.value ?? plain(node.props.children)),label:node.props.children,text:plain(node.props.children),disabled:node.props.disabled}); });
  collect(children);
  const filtered = options.filter(option => !query || `${option.text} ${option.value}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const label = attributes["aria-label"] || fieldLabel || "Select an option";
  const select = (next:string) => {setInternal(next); onChange?.({target:{value:next},currentTarget:{value:next}} as ChangeEvent<HTMLSelectElement>); setOpen(false); setQuery("");};
  return <Popover.Root open={open} onOpenChange={next => {setOpen(next); if (!next) setQuery("");}}>
    {name && <input type="hidden" name={name} value={chosen} disabled={disabled} />}
    <Popover.Trigger asChild><button type="button" {...Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith("data-") || key.startsWith("aria-")))} ref={trigger} id={id} role="combobox" aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-expanded={open} aria-label={label} aria-required={required || undefined} disabled={disabled} data-value={chosen} className={`app-select-trigger ${className || ""}`} title={attributes.title}
      onKeyDown={event => {if (["ArrowDown","ArrowUp"].includes(event.key)) {event.preventDefault(); setOpen(true);}}}>
      <span>{triggerContent ?? options.find(option => option.value === chosen)?.label ?? options.find(option => !option.value)?.label ?? "Select…"}</span>{!triggerContent && <UnigentamosIcon role="chevron-down" size={16} />}
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content ref={menu} className={`app-select-menu app-choice-menu${columns > 1 ? " is-grid" : ""} ${menuClassName}`} sideOffset={6} collisionPadding={12}
      onEscapeKeyDown={event => event.stopImmediatePropagation()}
      onOpenAutoFocus={event => {event.preventDefault(); if (searchable) search.current?.focus(); else (menu.current?.querySelector<HTMLElement>('[aria-selected="true"]:not([disabled])') || menu.current?.querySelector<HTMLElement>('[role="option"]:not([disabled])'))?.focus();}}
      onKeyDown={event => {
        const inSearch = event.target === search.current;
        if (inSearch && !["ArrowDown", "ArrowUp"].includes(event.key)) return;
        const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="option"]:not([disabled])') || []), index = items.indexOf(document.activeElement as HTMLElement);
        const delta = ({ArrowDown:columns,ArrowUp:-columns,ArrowRight:1,ArrowLeft:-1} as Record<string,number>)[event.key];
        if (delta || event.key === "Home" || event.key === "End") {event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length-1 : index < 0 ? 0 : Math.max(0,Math.min(items.length-1,index+delta)); items[next]?.focus();}
        else if (!inSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") items.find(item => item.textContent?.toLowerCase().startsWith(event.key.toLowerCase()))?.focus();
      }}>
      {searchable && <div className="app-choice-search"><input ref={search} aria-label={`Search ${label}`} placeholder="Search…" value={query} onChange={event => setQuery(event.target.value)} />{onCreate && <button type="button" aria-label={createLabel} title={createLabel} onClick={() => {setOpen(false); onCreate();}}><UnigentamosIcon role="plus" size={18} /></button>}</div>}
      <div id={listId} role="listbox" aria-label={label} className="app-choice-options" style={{gridTemplateColumns:`repeat(${columns}, minmax(0, 1fr))`}}>{filtered.map(option => <button type="button" role="option" tabIndex={option.value === chosen ? 0 : -1} aria-selected={option.value === chosen} data-select-value={option.value} disabled={option.disabled} className="app-select-item" key={option.value} onClick={() => select(option.value)}>{option.label}{option.value === chosen && <UnigentamosIcon role="check" size={14} />}</button>)}</div>
      {!filtered.length && <p className="app-choice-empty">No matches</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
