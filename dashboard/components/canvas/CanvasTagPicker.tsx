"use client";

import { useState, type KeyboardEvent } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { canvasTagLimits, type CanvasCategory } from "../../lib/modules/canvas/model";
import SelectField from "../ui/SelectField";
import styles from "./CanvasTaxonomy.module.css";

export type CategoryProps = {
  categories: CanvasCategory[];
  onCategoriesChange: (categories: CanvasCategory[]) => void;
};

type TagPickerProps = CategoryProps & {
  tagIds: string[];
  onChange: (tagIds: string[]) => void;
};

type TagAvailability = {count:number; disabled:boolean};
export function TagPicker({categories, tagIds, onChange, onCategoriesChange, assignNew = false, canCreate = true, availability}: TagPickerProps & {
  assignNew?:boolean;
  canCreate?:boolean;
  availability?:Map<string,TagAvailability>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [creating, setCreating] = useState<"category" | "tag" | null>(null);
  const [draft, setDraft] = useState("");
  const category = categories.find(item => item.id === categoryId) ?? categories[0];
  const name = draft.trim();
  const siblings = creating === "category" ? categories : category?.tags ?? [];
  const duplicate = siblings.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const limit = creating === "category" ? canvasTagLimits.categories : canvasTagLimits.tags;

  function start(kind: typeof creating) {
    setDraft("");
    setCreating(kind);
  }
  function add() {
    if (!creating || !name || duplicate || siblings.length >= limit) return;
    const entry = {id: crypto.randomUUID(), name};
    if (creating === "category") {
      onCategoriesChange([...categories, {...entry, tags: []}]);
      setCategoryId(entry.id);
      start("tag");
    } else if (category) {
      onCategoriesChange(categories.map(item => item.id === category.id ? {...item, tags: [...item.tags, entry]} : item));
      if (assignNew) onChange([...tagIds, entry.id]);
      start(null);
    }
  }
  function handleNameKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") add();
      else start(null);
    }
  }
  return <div className={styles.picker}>
    {category && <>
      <label>Category
        <SelectField portalToBody value={category.id} onChange={event => {setCategoryId(event.target.value); start(null);}}>
          {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
      </label>
      {category.tags.length > 0 && <div className={styles.chips} role="group" aria-label={category.name + " tags"}>
        {category.tags.map(tag => {
          const selected = tagIds.includes(tag.id);
          const usage=availability?.get(tag.id);
          return <button type="button" key={tag.id} className={styles.chip} aria-pressed={selected} aria-label={tag.name}
            disabled={usage?.disabled} title={usage?`On ${usage.count} selected ${usage.count===1?"item":"items"}`:undefined}
            onClick={() => onChange(selected ? tagIds.filter(id => id !== tag.id) : [...tagIds, tag.id])}>
            {selected && <IconCheck aria-hidden size={13}/>} {tag.name}{usage && <small>{usage.count}</small>}
          </button>;
        })}
      </div>}
    </>}
    {creating ? <div className={styles.composer}>
      <label>{creating === "category" ? "Category name" : "Tag name"}
        <input key={creating} autoFocus maxLength={canvasTagLimits.name} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleNameKey}/>
      </label>
      {duplicate && <span className={styles.note} role="status">{creating === "category" ? "This category already exists." : "This tag already exists in this category."}</span>}
      <div className={styles.actions}>
        <button className={styles.add} type="button" disabled={!name || duplicate || siblings.length >= limit} onClick={add}>Add {creating}</button>
        <button type="button" onClick={() => start(null)}>Cancel</button>
      </div>
    </div> : canCreate && <div className={styles.actions}>
      {category && <button type="button" disabled={category.tags.length >= canvasTagLimits.tags} onClick={() => start("tag")}><IconPlus aria-hidden size={14}/>New tag</button>}
      <button type="button" disabled={categories.length >= canvasTagLimits.categories} onClick={() => start("category")}><IconPlus aria-hidden size={14}/>New category</button>
    </div>}
  </div>;
}

export function ItemTags(props: TagPickerProps) {
  const selected = new Set(props.tagIds);
  const assigned = props.categories.flatMap(category => category.tags.filter(tag => selected.has(tag.id)).map(tag => ({...tag, category: category.name})));
  return <fieldset className={styles.itemTags}>
    <legend>Tags</legend>
    {assigned.length > 0 && <ul aria-label="Assigned tags" className={styles.assigned}>
      {assigned.map(tag => <li key={tag.id}>{tag.category} · {tag.name}</li>)}
    </ul>}
    <TagPicker {...props} assignNew/>
  </fieldset>;
}
