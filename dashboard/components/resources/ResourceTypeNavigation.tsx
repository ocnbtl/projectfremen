"use client";

import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./ResourceTypeNavigation.module.css";

const icons: Record<string, string> = {
  article: "calendar-group-notebook", website: "website", tool: "calendar-group-tool",
  vendor: "organization", document: "resource", dataset: "component",
  video_media: "calendar-group-video", book: "calendar-group-book-2",
  contract_invoice: "calendar-group-file-certificate", external_account: "link",
  unknown: "module-resources", components: "component",
};

export default function ResourceTypeNavigation({ types, selected, onToggle, onClear }: {
  types: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (type?: string) => void;
  onClear: () => void;
}) {
  const all = selected.size === types.length;
  return <Popover.Root>
      <Popover.Trigger className={styles.trigger} data-resource-type-trigger data-filtered={!all || undefined} aria-label={`Resource types: ${all ? "all" : `${selected.size} selected`}`} title="Filter resource types">
        <UnigentamosIcon role="module-resources" size={19}/><span>Types</span>
        {!all && <b>{selected.size}</b>}<UnigentamosIcon role="chevron-down" size={13}/>
      </Popover.Trigger>
      <Popover.Portal><Popover.Content className={`workspace-nav-menu ${styles.menu}`} aria-label="Resource types" align="end" sideOffset={8} collisionPadding={12}>
        <header><h2>Resource types</h2><span>{all ? "All shown" : `${selected.size} selected`}</span></header>
        <div className={styles.shortcuts}>
          <button type="button" aria-pressed={all} onClick={() => onToggle()}>All types</button>
          <button type="button" disabled={!selected.size} onClick={onClear}>Clear</button>
        </div>
        <div className={styles.choices} role="group" aria-label="Choose resource types">
          {types.map(type => <button type="button" key={type.id} aria-pressed={selected.has(type.id)} onClick={() => onToggle(type.id)}>
            <UnigentamosIcon role={icons[type.id] || "resource"} size={18}/><span>{type.label}</span>
            <UnigentamosIcon role="check" size={14} className={styles.check}/>
          </button>)}
        </div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>;
}
