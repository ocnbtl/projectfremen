import type { CanvasCategory, CanvasNode } from "../../lib/modules/canvas/model";

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: "base"});

export type OrganizerRow = {id: string; title: string; tags: string[]};
export type OrganizerGroup = {id: string; name: string; rows: OrganizerRow[]};

export function organizerRows(nodes: CanvasNode[], categories: CanvasCategory[], filters: string[], groupBy: string, sortBy: string) {
  const tagIndex = new Map(categories.flatMap(category => category.tags.map(tag => [tag.id, {...tag, category}] as const)));
  const required = filters.filter(id => tagIndex.has(id));
  const category = categories.find(item => item.id === groupBy);
  const groups = new Map<string, OrganizerGroup>();
  if (category) {
    for (const tag of category.tags) groups.set(tag.id, {id: tag.id, name: tag.name, rows: []});
    groups.set("", {id: "", name: "No tag in " + category.name, rows: []});
  } else {
    groups.set("", {id: "", name: "", rows: []});
  }
  const sorted = nodes.filter(node => required.every(id => node.tagIds?.includes(id))).map(node => {
    const tags = (node.tagIds ?? []).flatMap(id => tagIndex.get(id) ?? []);
    const title = node.title || node.ref?.label || node.body.trim().split(/\r?\n/, 1)[0].slice(0, 120)
      || (node.kind === "sticky" ? "Sticky note" : "Untitled " + node.kind);
    const sortKey = tags.filter(tag => sortBy === "tags" || sortBy === "category/" + tag.category.id)
      .map(tag => tag.name).sort(collator.compare).join(", ");
    const row = {id: node.id, title, tags: tags.map(tag => tag.category.name + " · " + tag.name)};
    return {row, sortKey, groupIds: tags.filter(tag => tag.category.id === category?.id).map(tag => tag.id)};
  });
  if (sortBy !== "board") {
    sorted.sort((a, b) => {
      if (sortBy === "title") return collator.compare(a.row.title, b.row.title);
      if (Boolean(a.sortKey) !== Boolean(b.sortKey)) return a.sortKey ? -1 : 1;
      return collator.compare(a.sortKey, b.sortKey) || collator.compare(a.row.title, b.row.title);
    });
  }
  for (const item of sorted) {
    const ids = item.groupIds.length ? item.groupIds : [""];
    for (const id of ids) groups.get(id)?.rows.push(item.row);
  }
  return {count: sorted.length, groups: Array.from(groups.values()).filter(group => group.rows.length)};
}
