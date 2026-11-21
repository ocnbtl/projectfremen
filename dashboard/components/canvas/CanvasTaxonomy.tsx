"use client";

import { useEffect, useMemo, useState } from "react";
import { IconChevronRight, IconFilter, IconX } from "@tabler/icons-react";
import type { CanvasNode } from "../../lib/modules/canvas/model";
import SelectField from "../ui/SelectField";
import { Panel } from "./CanvasPanels";
import { TagPicker, type CategoryProps } from "./CanvasTagPicker";
import { organizerRows, type OrganizerGroup } from "./organizer-rows";
import styles from "./CanvasTaxonomy.module.css";

export {ItemTags} from "./CanvasTagPicker";

type OrganizerOptions = {groupBy: string; sortBy: string; filters: string[]};
const boardOptions = new Map<string, OrganizerOptions>();

function GroupRows({group, onEdit}: {group: OrganizerGroup; onEdit: (id: string) => void}) {
  const [limit, setLimit] = useState(40);
  return <div className={styles.group}>
    {group.name && <h4>{group.name} <span>{group.rows.length}</span></h4>}
    <ul>
      {group.rows.slice(0, limit).map(row => <li key={row.id}>
        <button type="button" className={styles.row} onClick={() => onEdit(row.id)} aria-label={"Edit " + row.title}>
          <span className={styles.copy}>
            <strong>{row.title}</strong>
            {row.tags.length > 0 && <small>{row.tags.join("  /  ")}</small>}
          </span>
          <IconChevronRight aria-hidden size={16}/>
        </button>
      </li>)}
    </ul>
    {group.rows.length > limit && <button type="button" className={styles.more} onClick={() => setLimit(limit + 40)}>Show more items</button>}
  </div>;
}

export function BoardOrganizer({boardId, categories, nodes, onEdit, close, onCategoriesChange, onShowOnCanvas}: CategoryProps & {
  boardId?: string;
  nodes: CanvasNode[];
  onEdit: (id: string) => void;
  onShowOnCanvas?: (tagIds: string[]) => void;
  close: () => void;
}) {
  const [options, setOptions] = useState<OrganizerOptions>(() => (boardId && boardOptions.get(boardId)) || {groupBy: "", sortBy: "board", filters: []});
  const {filters} = options;
  const groupBy = categories.some(category => category.id === options.groupBy) ? options.groupBy : "";
  const sortBy = options.sortBy.startsWith("category/") && !categories.some(category => "category/" + category.id === options.sortBy) ? "board" : options.sortBy;
  useEffect(() => {if (boardId) boardOptions.set(boardId, options);}, [boardId, options]);
  const setFilters = (next: string[]) => setOptions(previous => ({...previous, filters: next}));
  const selected = categories.flatMap(category => category.tags.filter(tag => filters.includes(tag.id)).map(tag => ({...tag, category: category.name})));
  const results = useMemo(() => organizerRows(nodes, categories, filters, groupBy, sortBy), [nodes, categories, filters, groupBy, sortBy]);
  return <Panel title="Board organizer" close={close}>
    <div className={styles.organizer} onKeyDown={event => {if (event.key === "Delete" || event.key === "Backspace") event.stopPropagation();}}>
      <div className={styles.controls}>
        <label>Group by<SelectField portalToBody value={groupBy} onChange={event => setOptions({...options, groupBy: event.target.value})}>
          <option value="">No grouping</option>
          {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </SelectField></label>
        <label>Sort by<SelectField portalToBody value={sortBy} onChange={event => setOptions({...options, sortBy: event.target.value})}>
          <option value="board">Board order</option>
          <option value="title">Title A–Z</option>
          <option value="tags">Tag A–Z</option>
          {categories.map(category => <option key={category.id} value={"category/" + category.id}>{category.name} A–Z</option>)}
        </SelectField></label>
      </div>
      <details className={styles.filter}>
        <summary><IconFilter aria-hidden size={16}/>Filter &amp; manage tags<IconChevronRight aria-hidden size={15}/></summary>
        <TagPicker categories={categories} tagIds={filters} onChange={setFilters} onCategoriesChange={onCategoriesChange}/>
      </details>
      {selected.length > 0 && <div className={styles.chips} role="group" aria-label="Active tag filters">
        {selected.map(tag => <button key={tag.id} type="button" className={styles.filterTag}
          aria-label={"Remove filter " + tag.category + " " + tag.name} onClick={() => setFilters(filters.filter(id => id !== tag.id))}>
          {tag.category} · {tag.name}<IconX aria-hidden size={12}/>
        </button>)}
        {selected.length > 1 && <button type="button" className={styles.clear} onClick={() => setFilters([])}>Clear filters</button>}
      </div>}
      {selected.length > 0 && onShowOnCanvas && <button type="button" className={styles.applyFilter}
        onClick={() => onShowOnCanvas(selected.map(tag => tag.id))}>Show matches on canvas</button>}
      <div className={styles.results}>
        <p className={styles.count} role="status">{results.count} {selected.length ? "of " + nodes.length + " " : ""}{(selected.length ? nodes.length : results.count) === 1 ? "item" : "items"}</p>
        {results.groups.map(group => <GroupRows key={groupBy + "/" + group.id} group={group} onEdit={onEdit}/>)}
        {!results.count && <p className={styles.note}>{nodes.length ? "No items match all selected tags." : "Items added to this board will appear here."}</p>}
      </div>
    </div>
  </Panel>;
}
