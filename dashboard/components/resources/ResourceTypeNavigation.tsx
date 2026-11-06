"use client";

import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export default function ResourceTypeNavigation({ types, selected, onToggle }: {
  types: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (type?: string) => void;
}) {
  const all = selected.size === types.length;
  const choices = <>
    <button type="button" aria-pressed={all} onClick={() => onToggle()}>All types</button>
    {types.map(type => <button type="button" key={type.id} aria-pressed={selected.has(type.id)} onClick={() => onToggle(type.id)}>{type.label}</button>)}
  </>;
  return <>
    <div className="workspace-nav-type-pills resource-types-wide" role="group" aria-label="Resource types">{choices}</div>
    <Popover.Root>
      <Popover.Trigger className="workspace-nav-trigger resource-types-trigger" aria-label="Resource types" title="Filter resource types">
        <UnigentamosIcon role="module-resources" size={18}/><span>Types{all ? "" : ` · ${selected.size}`}</span>
      </Popover.Trigger>
      <Popover.Portal><Popover.Content className="workspace-nav-menu resource-types-menu" aria-label="Resource types" align="end" sideOffset={8} collisionPadding={12}>
        <p>Show types</p><div className="workspace-nav-type-pills" role="group" aria-label="Resource types">{choices}</div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </>;
}
