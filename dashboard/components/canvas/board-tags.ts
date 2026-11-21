import type { Board, CanvasCategory } from "../../lib/modules/canvas/model";

export type TagOperation = "add" | "remove";

export function mergeTagAdditions(categories: CanvasCategory[], additions: CanvasCategory[]) {
  const categoryAliases = new Map<string, string>(), tagAliases = new Map<string, string>();
  const merged = [...categories];
  for (const extra of additions) {
    const index = merged.findIndex(category => category.id === extra.id || category.name.toLowerCase() === extra.name.toLowerCase());
    if (index === -1) { merged.push(extra); continue; }
    const category = merged[index], tags = [...category.tags];
    categoryAliases.set(extra.id, category.id);
    for (const added of extra.tags) {
      const saved = tags.find(tag => tag.id === added.id || tag.name.toLowerCase() === added.name.toLowerCase());
      if (saved) tagAliases.set(added.id, saved.id);
      else tags.push(added);
    }
    merged[index] = {...category, tags};
  }
  return {draftCategories: merged, categoryAliases, tagAliases};
}

export function applyBoardTags(board:Board, targetIds:string[], operation:TagOperation, tagIds:string[], additions:CanvasCategory[]){
  const {draftCategories,tagAliases}=mergeTagAdditions(board.categories??[],operation==="add"?additions:[]);
  const valid=new Set(draftCategories.flatMap(category=>category.tags.map(tag=>tag.id)));
  const requested=new Set(tagIds.map(id=>tagAliases.get(id)??id).filter(id=>valid.has(id)));
  if(!requested.size)return board;
  const targets=new Set(targetIds);
  let changed=false;
  const nodes=board.nodes.map(node=>{
    if(!targets.has(node.id))return node;
    const current=node.tagIds??[];
    const next=operation==="add"?[...new Set([...current,...requested])]:current.filter(id=>!requested.has(id));
    if(next.length===current.length)return node;
    changed=true;
    return {...node,tagIds:next};
  });
  return changed?{...board,nodes,categories:draftCategories}:board;
}
