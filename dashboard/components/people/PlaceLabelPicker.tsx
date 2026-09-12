"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";

const choices = [
  { label: "Primary home", icon: "hometown" },
  { label: "Second home", icon: "location" },
  { label: "Work", icon: "briefcase" },
  { label: "University", icon: "university" },
  { label: "Travel", icon: "travel" },
  { label: "Other", icon: "object" }
];

export default function PlaceLabelPicker({ value, index, onChange }: { value: string; index: number; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false), [custom, setCustom] = useState("");
  const selected = choices.find(choice => choice.label.toLowerCase() === value.toLowerCase());
  function choose(label: string) { onChange(label); setOpen(false); }
  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) setCustom(selected ? "" : value); }}>
    <Popover.Trigger asChild><button type="button" className="people-place-label-trigger" role="combobox" aria-label={`Place ${index + 1} label`} aria-description={value || "Choose a place label"} title={value || "Place label"} data-value={value} aria-haspopup="dialog">
      <UnigentamosIcon role={selected?.icon || (value ? "edit" : "location")} size={18} />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="app-select-menu people-place-label-menu" sideOffset={6} collisionPadding={12} aria-label="Place label" onEscapeKeyDown={event => event.stopImmediatePropagation()}>
      <strong>Place label</strong>
      <div className="people-place-label-options" role="group" aria-label="Place types">{choices.map(choice => <button key={choice.label} type="button" aria-pressed={selected?.label === choice.label} onClick={() => choose(choice.label)}><UnigentamosIcon role={choice.icon} size={20} /><span>{choice.label}</span></button>)}</div>
      <label>Custom label<input aria-label="Custom place label" value={custom} onChange={event => setCustom(event.target.value)} placeholder="e.g. Family home" maxLength={120} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (custom.trim()) choose(custom.trim()); } }} /></label>
      <button className="people-place-label-apply" type="button" disabled={!custom.trim()} onClick={() => choose(custom.trim())}>Use custom label</button>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
