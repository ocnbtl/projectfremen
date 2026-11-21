import type { CanvasCategory, CanvasNode, CanvasViewOrganizer } from "../../lib/modules/canvas/model";

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: "base"});

export type OrganizerOptions = CanvasViewOrganizer;
export const defaultOrganizerOptions: OrganizerOptions = {groupBy: "", sortBy: "board", filters: [], search: ""};

type RowTag = {id: string; name: string; category: string; tone: number};
export type OrganizerRow = {
  id: string;
  title: string;
  kind: CanvasNode["kind"];
  kindLabel: string;
  ref?: CanvasNode["ref"];
  tags: RowTag[];
};
export type OrganizerGroup = {id: string; name: string; tone: number; rows: OrganizerRow[]};

export function organizerTagTone(categoryIndex: number, tagIndex: number) {
  return (categoryIndex + tagIndex) % 6;
}

const kinds = {
  sticky: "Sticky note", text: "Text", highlight: "Highlight", object: "Linked item",
  media: "Media", notes: "Notes", people: "People", projects: "Projects", calendar: "Calendar",
  finance: "Finance", map: "Map", reviews: "Reviews", personal_ops: "Personal", resources: "Resources",
};

export function organizerRows(nodes: CanvasNode[], categories: CanvasCategory[], filters: string[], groupBy: string, sortBy: string, search = "") {
  const tagIndex = new Map(categories.flatMap((category, index) => category.tags.map((tag, i) =>
    [tag.id, {...tag, categoryId: category.id, category: category.name, tone: organizerTagTone(index, i)}] as const)));
  const required = filters.filter(id => tagIndex.has(id));
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const category = categories.find(item => item.id === groupBy);
  const groups = new Map<string, OrganizerGroup>();
  const byKind = (groupBy === "kind" && !category) || groupBy === "item/type";
  if (category) {
    for (const [i, tag] of category.tags.entries()) {
      groups.set(tag.id, {id: tag.id, name: tag.name, tone: organizerTagTone(categories.indexOf(category), i), rows: []});
    }
    groups.set("", {id: "", name: "No tag in " + category.name, tone: -1, rows: []});
  } else if (byKind) {
    for (const [i, [id, name]] of Object.entries(kinds).sort((a,b) => collator.compare(a[1],b[1])).entries()) {
      groups.set(id, {id, name, tone: i % 6, rows: []});
    }
  } else {
    groups.set("", {id: "", name: "", tone: -1, rows: []});
  }

  const items = [];
  for (const node of nodes) {
    if (!required.every(id => node.tagIds?.includes(id))) continue;
    const tags = (node.tagIds ?? []).flatMap(id => tagIndex.get(id) ?? []);
    const kindId = node.ref?.module ?? node.kind;
    const kindLabel = kinds[kindId];
    const title = node.title || node.ref?.label || node.body.trim().split(/\r?\n/, 1)[0].slice(0, 120)
      || (node.kind === "sticky" ? "Sticky note" : "Untitled " + node.kind);
    if (terms.length) {
      const searchable = [title, kindLabel, node.body, node.notes, node.group, node.ref?.label,
        node.ref?.objectType.replaceAll("_", " "), ...tags.map(tag => tag.category + " " + tag.name)].join(" ").toLocaleLowerCase();
      if (!terms.every(term => searchable.includes(term))) continue;
    }
    const sortKey = tags.filter(tag => sortBy === "tags" || sortBy === "category/" + tag.categoryId)
      .map(tag => tag.name).sort(collator.compare).join(", ");
    const groupIds = byKind ? [kindId] : tags.filter(tag => tag.categoryId === category?.id).map(tag => tag.id);
    const row: OrganizerRow = {id: node.id, title, kind: node.kind, kindLabel, ref: node.ref, tags};
    items.push({row, sortKey, groupIds});
  }
  if (sortBy !== "board") {
    items.sort((a, b) => {
      if (sortBy === "title") return collator.compare(a.row.title, b.row.title);
      if (Boolean(a.sortKey) !== Boolean(b.sortKey)) return a.sortKey ? -1 : 1;
      return collator.compare(a.sortKey, b.sortKey) || collator.compare(a.row.title, b.row.title);
    });
  }
  for (const item of items) {
    for (const id of item.groupIds.length ? item.groupIds : [""]) groups.get(id)?.rows.push(item.row);
  }
  const populated = Array.from(groups.values()).filter(group => group.rows.length);
  const orderedIds = [...new Set(populated.flatMap(group => group.rows.map(row => row.id)))];
  return {count: items.length, groups: populated, orderedIds};
}
