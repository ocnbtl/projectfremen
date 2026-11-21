"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconChevronRight, IconFilter, IconRotateClockwise2, IconTags, IconX } from "@tabler/icons-react";
import { canvasViewLimits, type Board, type CanvasArrangement, type CanvasArrangementOptions, type CanvasCategory, type CanvasNode } from "../../lib/modules/canvas/model";
import SearchField from "../ui/SearchField";
import SelectField from "../ui/SelectField";
import { Panel } from "./CanvasPanels";
import { TagPicker } from "./CanvasTagPicker";
import { ArrangementControls } from "./ArrangementControls";
import { defaultArrangementOptions } from "./board-organization";
import { OrganizerPreview } from "./OrganizerPreview";
import { mergeTagAdditions } from "./board-tags";
import { defaultOrganizerOptions, organizerRows, organizerTagTone, type OrganizerGroup, type OrganizerOptions } from "./organizer-rows";
import styles from "./CanvasTaxonomy.module.css";

export {ItemTags} from "./CanvasTagPicker";

function GroupRows({group, picked, onPick, onEdit}: {group: OrganizerGroup; picked?: Set<string>; onPick: (id: string) => void; onEdit: (id: string, button: HTMLButtonElement) => void}) {
  const [limit, setLimit] = useState(32);
  const [expanded, setExpanded] = useState(true);
  const showRows = !group.name || expanded;
  return <section className={styles.group} data-grouped={Boolean(group.name)}>
    {group.name && <h4><button type="button" className={styles.groupHead} data-tone={group.tone} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <i className={styles.dot} aria-hidden/>
      <span>{group.name}</span><small>{group.rows.length}</small><IconChevronDown aria-hidden size={14}/>
    </button></h4>}
    {showRows && <ul>
      {group.rows.slice(0, limit).map(row => <li key={row.id}>
        {picked && <label className={styles.pickRow}>
          <input type="checkbox" aria-label={"Select " + row.title} checked={picked.has(row.id)} onChange={() => onPick(row.id)}/>
        </label>}
        <button type="button" className={styles.row} onClick={event => onEdit(row.id, event.currentTarget)} aria-label={"Edit " + row.title}>
          <span className={styles.thumbnail}><OrganizerPreview row={row}/></span>
          <span className={styles.copy}>
            <strong>{row.title}</strong>
            <span className={styles.meta}>
              <small>{row.kindLabel}</small>
              {row.tags.slice(0, 2).map(tag => <span className={styles.badge} key={tag.id} data-tone={tag.tone} title={tag.category + " · " + tag.name}>{tag.name}</span>)}
              {row.tags.length > 2 && <small title={row.tags.slice(2).map(tag => tag.category + " · " + tag.name).join(", ")}>+{row.tags.length - 2}</small>}
            </span>
          </span>
          <IconChevronRight aria-hidden size={15}/>
        </button>
      </li>)}
    </ul>}
    {showRows && group.rows.length > limit && <button type="button" className={styles.more} onClick={() => setLimit(limit + 32)}>
      Show {Math.min(32, group.rows.length - limit)} more
    </button>}
  </section>;
}

export function BoardOrganizer({board, arrangement = board.arrangement, categories, nodes, applied, hidden = false, onApply, onClear, onTagMatches, onEdit, close}: {
  board: Board;
  arrangement?: CanvasArrangement;
  categories: CanvasCategory[];
  nodes: CanvasNode[];
  applied: OrganizerOptions;
  hidden?: boolean;
  onApply: (options: OrganizerOptions, arrangement: CanvasArrangementOptions, categories?: CanvasCategory[]) => void;
  onClear: () => void;
  onTagMatches: (ids: string[]) => void;
  onEdit: (id: string) => void;
  close: () => void;
}) {
  const [options, setOptions] = useState<OrganizerOptions>(applied);
  const [layout, setLayout] = useState<CanvasArrangementOptions>(() => {
    if (!arrangement) return applied.groupBy ? {...defaultArrangementOptions, rowBy: applied.groupBy} : defaultArrangementOptions;
    const {bands: _bands, organizer: _organizer, ...saved} = arrangement;
    return saved;
  });
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [additions, setAdditions] = useState<CanvasCategory[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const lastRow = useRef<HTMLButtonElement | null>(null);
  const searchField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (hidden || !lastRow.current) return;
    const focus = lastRow.current.isConnected ? lastRow.current : searchField.current;
    focus?.focus({preventScroll: true});
    lastRow.current = null;
  }, [hidden]);

  const {draftCategories, categoryAliases, tagAliases} = useMemo(() => mergeTagAdditions(categories, additions), [categories, additions]);
  const filters = useMemo(() => options.filters.map(id => tagAliases.get(id) ?? id), [options.filters, tagAliases]);
  const search = options.search;
  function axisId(id: string) {
    const value = categoryAliases.get(id) ?? id;
    if (value === "kind" && !draftCategories.some(category => category.id === value)) return "item/type";
    return value === "item/type" || draftCategories.some(category => category.id === value) ? value : "";
  }
  const rowBy = axisId(layout.rowBy), columnBy = axisId(layout.columnBy);
  const groupBy = rowBy || columnBy;
  const sortCategory = options.sortBy.slice("category/".length);
  const sortId = categoryAliases.get(sortCategory) ?? sortCategory;
  const sortBy = !options.sortBy.startsWith("category/") ? options.sortBy
    : draftCategories.some(category => category.id === sortId) ? "category/" + sortId : "board";
  const selected = draftCategories.flatMap((category, index) => category.tags.flatMap((tag, i) =>
    filters.includes(tag.id) ? [{...tag, category: category.name, tone: organizerTagTone(index, i)}] : []));
  const results = useMemo(() => organizerRows(nodes, draftCategories, filters, groupBy, sortBy, search),
    [nodes, draftCategories, filters, groupBy, sortBy, search]);
  const organizer = useMemo(() => ({groupBy, sortBy, search: search.trim(), filters}), [groupBy, sortBy, search, filters]);
  const selectedIds = results.orderedIds.filter(id => picked.has(id));
  const changed = Boolean(groupBy || sortBy !== "board" || filters.length || search || additions.length || layout !== defaultArrangementOptions);
  const active = Boolean(board.arrangement || applied.groupBy || applied.sortBy !== "board" || applied.filters.length || applied.search);

  function stageCategories(next: CanvasCategory[]) {
    setOptions({...options, filters, groupBy, sortBy});
    setAdditions(next.flatMap(category => {
      const saved = categories.find(existing => existing.id === category.id);
      if (!saved) return [category];
      const tags = category.tags.filter(tag => !saved.tags.some(existing => existing.id === tag.id));
      return tags.length ? [{...category, tags}] : [];
    }));
  }
  function apply() {
    const labelOverrides = layout.labelOverrides?.filter(item => item.label.trim()).map(item => ({
      ...item, label: item.label.trim(), key: tagAliases.get(item.key) ?? item.key,
    }));
    onApply({...organizer, filters: selected.map(tag => tag.id)}, {...layout, rowBy, columnBy, rowName: layout.rowName?.trim() || undefined,
      columnName: layout.columnName?.trim() || undefined, labelOverrides}, additions.length ? draftCategories : undefined);
  }
  function clear() {
    setOptions(defaultOrganizerOptions);
    setLayout(defaultArrangementOptions);
    setAdditions([]);
    setPicked(new Set());
    setPicking(false);
    setTagsOpen(false);
    onClear();
  }
  function setAxis(axis: "row" | "column", value: string) {
    setLayout({...layout, [axis === "row" ? "rowBy" : "columnBy"]: value,
      [axis === "row" ? "rowName" : "columnName"]: undefined,
      labelOverrides: layout.labelOverrides?.filter(item => item.axis !== axis)});
  }
  function togglePick(id: string) {
    setPicked(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <div hidden={hidden}><Panel title="Board organizer" close={close}>
    <div className={styles.organizer} onKeyDown={event => {if (event.key === "Delete" || event.key === "Backspace") event.stopPropagation();}}>
      <div className={styles.scroller}>
        <div className={`${styles.controls} ${styles.layoutControls}`}>
          <SearchField ref={searchField} className={styles.search} aria-label="Search board items" placeholder="Search board items" maxLength={canvasViewLimits.search} value={search}
            onChange={event => setOptions({...options, search: event.target.value})}>
            {search && <button type="button" aria-label="Clear search" onClick={() => {setOptions({...options, search: ""}); searchField.current?.focus();}}><IconX size={15} aria-hidden/></button>}
          </SearchField>
          {(["row", "column"] as const).map(axis => <label key={axis}>Group {axis}s by
            <SelectField portalToBody value={axis === "row" ? rowBy : columnBy} onChange={event => setAxis(axis, event.target.value)}>
              <option value="">Automatic</option>
              <option value="item/type">Item type</option>
              {draftCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </SelectField>
          </label>)}
          <label>Sort by<SelectField portalToBody value={sortBy} onChange={event => setOptions({...options, sortBy: event.target.value})}>
            <option value="board">Board order</option>
            <option value="title">Title A–Z</option>
            <option value="tags">Tag A–Z</option>
            {draftCategories.map(category => <option key={category.id} value={"category/" + category.id}>{category.name} A–Z</option>)}
          </SelectField></label>
        </div>
        <ArrangementControls board={board} nodes={nodes} categories={draftCategories} organizer={organizer} options={{...layout, rowBy, columnBy}}
          update={patch => setLayout(previous => ({...previous, ...patch}))}/>
        <details className={styles.filter} open={tagsOpen} onToggle={e => setTagsOpen(e.currentTarget.open)}>
          <summary><IconFilter aria-hidden size={16}/>Filter &amp; manage tags{selected.length > 0 && <small>{selected.length}</small>}<IconChevronRight aria-hidden size={15}/></summary>
          <TagPicker categories={draftCategories} tagIds={filters} onChange={next => setOptions({...options, filters: next})} onCategoriesChange={stageCategories}/>
        </details>
        {selected.length > 0 && <div className={styles.chips} role="group" aria-label="Selected tag filters">
          {selected.map(tag => <button key={tag.id} type="button" className={styles.filterTag} data-tone={tag.tone}
            aria-label={"Remove filter " + tag.category + " " + tag.name} onClick={() => setOptions({...options, filters: filters.filter(id => id !== tag.id)})}>
            {tag.category} · {tag.name}<IconX aria-hidden size={12}/>
          </button>)}
        </div>}
        <div className={styles.results}>
          <div className={styles.resultBar}><p className={styles.count} role="status">
            <strong>{results.count}</strong>{selected.length || search.trim() ? " of " + nodes.length : ""} {nodes.length === 1 ? "item" : "items"}
            {groupBy && results.groups.length > 0 && <span> · {results.groups.length} {results.groups.length === 1 ? "group" : "groups"}</span>}
          </p>{results.count > 0 && <button type="button" aria-pressed={picking} onClick={() => {setPicking(!picking); setPicked(new Set());}}>
            {picking ? "Cancel selection" : "Select items"}
          </button>}</div>
          {results.count > 0 && <div className={styles.matchActions}>
            <button type="button" onClick={() => onTagMatches(results.orderedIds)}><IconTags aria-hidden size={15}/>Select all matches for tagging</button>
            {picking && <button type="button" disabled={!selectedIds.length} onClick={() => onTagMatches(selectedIds)}>Tag selected items ({selectedIds.length})</button>}
          </div>}
          {results.groups.map(group => <GroupRows key={groupBy + "/" + group.id} group={group} picked={picking ? picked : undefined} onPick={togglePick}
            onEdit={(id, button) => {lastRow.current = button; onEdit(id);}}/>)}
          {!results.count && <p className={styles.empty}>{nodes.length ? "No items match this search or the selected tags." : "Items added to this board will appear here."}</p>}
        </div>
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.clear} disabled={!active && !changed} onClick={clear}><IconRotateClockwise2 aria-hidden size={15}/>Clear</button>
        <button type="button" className={styles.applyFilter} onClick={apply}><IconCheck aria-hidden size={16}/>Apply to canvas</button>
      </footer>
    </div>
  </Panel></div>;
}
