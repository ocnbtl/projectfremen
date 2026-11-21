import type { Board, CanvasNode } from "../../lib/modules/canvas/model";
import type { NativeObjectRef } from "../../lib/native-objects/types";

export const colors = { butter: "#fff1b6", sky: "#dceafa", mint: "#d7eee2", rose: "#f7dcdd", lilac: "#e7dff5", paper: "#ffffff" };
export const keyOf = (ref:NativeObjectRef) => JSON.stringify([ref.module,ref.objectType,ref.objectId,ref.containerObjectId||""]);
export function bounds(nodes: CanvasNode[]) {
  const x = Math.min(...nodes.map(n=>n.x)), y = Math.min(...nodes.map(n=>n.y));
  return { x,y,width:Math.max(...nodes.map(n=>n.x+n.width))-x,height:Math.max(...nodes.map(n=>n.y+n.height))-y };
}
export function tile(nodes: CanvasNode[], origin: {x:number;y:number}, columns=Math.ceil(Math.sqrt(nodes.length))) {
  if (!nodes.length) return [];
  const step = Math.max(...nodes.map(n=>n.width)) + 32;
  const rowGap=Math.min(170,Math.max(88,step*.14));
  let top=origin.y, rowHeight=0;
  return nodes.map((node,index)=>{
    const column=index%columns;
    if (index && column===0) {top+=rowHeight+rowGap;rowHeight=0;}
    rowHeight=Math.max(rowHeight,node.height);
    return {...node,x:origin.x+column*step,y:top};
  });
}
export function makeNode(kind: CanvasNode["kind"], point:{x:number;y:number}, ref?: NativeObjectRef):CanvasNode {
  return {id:crypto.randomUUID(),kind,...point,width:kind==="highlight"?320:220,height:kind==="object"?200:kind==="highlight"?176:136,
    title:ref?.label || "",body:"",color:kind==="sticky"?"butter":kind==="highlight"?"mint":"paper",group:"",used:false,...(kind==="text"?{appearance:"outline" as const}:{}),...(ref?{ref}:{})};
}

export function unusedGroupName(base:string, taken:Set<string>) {
  let name=base;
  for(let i=2;taken.has(name);i++)name=base+" "+i;
  return name;
}

export function duplicateItems(board:Board,selection:CanvasNode[],offset:number) {
  const ids=new Map(selection.map(node=>[node.id,crypto.randomUUID()]));
  const taken=new Set(board.nodes.map(node=>node.group));
  const groups=new Map<string,string>();
  const dx=Math.min(offset,...selection.map(n=>1e7-n.x));
  const dy=Math.min(offset,...selection.map(n=>1e7-n.y));
  const nodes=selection.map(node=>{
    if(node.group && !groups.has(node.group)){
      const name=unusedGroupName(node.group.slice(0,145)+" copy",taken);
      groups.set(node.group,name);taken.add(name);
    }
    return {...node,id:ids.get(node.id)!,x:node.x+dx,y:node.y+dy,group:groups.get(node.group)||"",locked:false};
  });
  const edges=board.edges.flatMap(edge=>{
    const source=ids.get(edge.source),target=ids.get(edge.target);
    return source && target ? [{...edge,id:crypto.randomUUID(),source,target}] : [];
  });
  return {nodes,edges};
}
export function addObjects(board:Board, refs:NativeObjectRef[], origin:{x:number;y:number}, sizes?:Map<string,{width:number;height:number}>){
  const seen=new Set(board.nodes.flatMap(n=>n.ref?[keyOf(n.ref)]:[]));
  const added:CanvasNode[]=[];
  for(const ref of refs){
    const key=keyOf(ref);
    if(seen.has(key)) continue;
    seen.add(key);
    const node=makeNode("object",origin,ref);
    const size=ref.module==="media" && sizes?.get(ref.objectId);
    added.push(size?{...node,...size,imageSize:size}:node);
  }
  // Start in the nearest free band so successive pastes never cover older ads.
  const batch=tile(added,origin);
  if(!batch.length) return [];
  const box=bounds(batch);
  const nearby=board.nodes.filter(n=>n.x<box.x+box.width+16 && n.x+n.width>box.x-16 && n.y+n.height>box.y-16);
  let y=box.y;
  for(const n of nearby.sort((a,b)=>a.y-b.y)){
    if(n.y>y+box.height+16) break;
    y=Math.max(y,n.y+n.height+Math.min(170,Math.max(88,n.width*.14)));
  }
  return batch.map(n=>({...n,y:n.y+y-box.y}));
}
export function withoutSelection(board:Board, ids:Set<string>, edgeIds:Set<string>):Board {
  return {...board,nodes:board.nodes.filter(n=>!ids.has(n.id)),edges:board.edges.filter(e=>!edgeIds.has(e.id)&&!ids.has(e.source)&&!ids.has(e.target))};
}
