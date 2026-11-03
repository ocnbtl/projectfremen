"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import SelectField from "../ui/SelectField";
import ViewCycleButton, { type DirectoryView } from "../ui/ViewCycleButton";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceNavSlot } from "../admin-shell/WorkspaceTopbar";
import { WorkspaceButton } from "../admin-shell/WorkspaceKit";
import type { FinanceSort, FinanceFilter } from "../../lib/native-objects/url-state";
import styles from "./FinanceCollections.module.css";

export function useFinanceCollectionView(collection: string) {
  const key = `unigentamos.finance.${collection}.view`;
  const [view, setView] = useState<DirectoryView>("comfortable");
  useEffect(() => {try {const saved=localStorage.getItem(key);if(saved==="comfortable"||saved==="compact"||saved==="grid")setView(saved);}catch{}},[key]);
  return [view,(next:DirectoryView)=>{setView(next);try{localStorage.setItem(key,next);}catch{}}] as const;
}

export default function FinanceCollectionControls({label,view,onView,sort,onSort,sortOptions,filter="",onFilter,filterOptions=[]}: {
  label:string;view:DirectoryView;onView:(view:DirectoryView)=>void;sort:string;onSort:(sort:FinanceSort)=>void;
  sortOptions:{value:FinanceSort;label:string}[];filter?:FinanceFilter;onFilter?:(filter:FinanceFilter)=>void;filterOptions?:{value:FinanceFilter;label:string}[];
}) {
  return <WorkspaceNavSlot kind="search"><div className={styles.controls}>
    {onFilter && <Popover.Root><Popover.Trigger asChild><WorkspaceButton icon="filter" aria-label={`Filter ${label}`} title={`Filter ${label}`} aria-pressed={Boolean(filter)}/></Popover.Trigger><Popover.Portal><Popover.Content className={`workspace-nav-menu ${styles.filterMenu}`} align="end" sideOffset={8} collisionPadding={12} aria-label={`${label} filters`}><strong>Show</strong><div>{filterOptions.map(option=><WorkspaceButton key={option.value} aria-pressed={filter===option.value} onClick={()=>onFilter(option.value)}>{option.label}</WorkspaceButton>)}</div></Popover.Content></Popover.Portal></Popover.Root>}
    <SelectField className="toolbar-icon-select" title={`Sort ${label}`} aria-label={`Sort ${label}`} triggerContent={<UnigentamosIcon role="sort" size={20}/>} value={sort} onChange={event=>onSort(event.target.value as FinanceSort)}>{sortOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</SelectField>
    <ViewCycleButton label={`${label} view`} value={view} onChange={onView}/>
  </div></WorkspaceNavSlot>;
}
