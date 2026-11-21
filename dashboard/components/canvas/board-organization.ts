import {
  CanvasError, type Board, type CanvasArrangementBand, type CanvasArrangementOptions,
  type CanvasCategory, type CanvasNode, type CanvasPosition, type CanvasRect, type CanvasView,
  type CanvasViewOrganizer,
} from "../../lib/modules/canvas/model";
import {defaultOrganizerOptions, organizerRows} from "./organizer-rows";

export const defaultArrangementOptions:CanvasArrangementOptions = {
  rowBy:"", columnBy:"", headerStyle:"solid", headerColor:"#374151",
};
const footerSpace=60;

export const snapshotPositions = (nodes:CanvasNode[]):CanvasPosition[] => nodes.map(({id,x,y})=>({id,x,y}));

export function restorePositions(nodes:CanvasNode[], positions:CanvasPosition[], respectLocks=true):CanvasNode[] {
  const saved=new Map(positions.map(position=>[position.id,position]));
  return nodes.map(node=>{
    const pos=saved.get(node.id);
    if(!pos || (respectLocks && node.locked) || (node.x===pos.x && node.y===pos.y)) return node;
    return {...node,x:pos.x,y:pos.y};
  });
}

type Lane = {key:string;label:string};
type Axis = {name:string; lanes:Lane[]; assignment:Map<string,string>};
function categoryAxis(nodes:CanvasNode[], categories:CanvasCategory[], key:string):Axis {
  const name=categories.find(category=>category.id===key)?.name ?? "Item type";
  const {groups}=organizerRows(nodes,categories,[],key,"board");
  const assignment=new Map<string,string>();
  const lanes:Lane[]=[];
  // The first matching tag in the category's declared order owns the placement.
  for(const group of groups) {
    let populated=false;
    for(const row of group.rows) {
      if(assignment.has(row.id)) continue;
      assignment.set(row.id,group.id);
      populated=true;
    }
    if(populated) lanes.push({key:group.id,label:group.name});
  }
  return {name,lanes,assignment};
}

function numberedAxis(nodes:CanvasNode[], index:(node:CanvasNode,i:number)=>number, name:string):Axis {
  const assignment=new Map<string,string>();
  let count=0;
  nodes.forEach((node,i)=>{
    const number=index(node,i)+1;
    count=Math.max(count,number);
    assignment.set(node.id,String(number));
  });
  const lanes=Array.from({length:count},(_,i)=>({key:String(i+1),label:name+" "+String(i+1)}));
  return {name,lanes,assignment};
}

function layoutAxes(nodes:CanvasNode[], categories:CanvasCategory[], options:CanvasArrangementOptions) {
  let rows:Axis, columns:Axis;
  if(options.rowBy) {
    rows=categoryAxis(nodes,categories,options.rowBy);
    columns=options.columnBy ? categoryAxis(nodes,categories,options.columnBy)
      : numberedAxis(nodes,()=>0,"Column");
  } else if(options.columnBy) {
    columns=categoryAxis(nodes,categories,options.columnBy);
    const nextIndex=new Map<string,number>();
    rows=numberedAxis(nodes,node=>{
      const key=columns.assignment.get(node.id)!;
      const n=nextIndex.get(key)??0;
      nextIndex.set(key,n+1);
      return n;
    },"Row");
  } else {
    const n=Math.ceil(Math.sqrt(nodes.length));
    rows=numberedAxis(nodes,(_,i)=>Math.floor(i/n),"Row");
    columns=numberedAxis(nodes,(_,i)=>i%n,"Column");
  }
  return {rows,columns,grid:Boolean(options.columnBy || !options.rowBy)};
}

function packCell(nodes:CanvasNode[], gap:number) {
  const count=Math.ceil(Math.sqrt(nodes.length));
  const widths=Array<number>(count).fill(0);
  nodes.forEach((node,i)=>{widths[i%count]=Math.max(widths[i%count],node.width);});
  const offsets=offsetsFor(widths,gap);
  const positions:CanvasPosition[]=[];
  let y=0,height=0;
  nodes.forEach((node,i)=>{
    if(i && i%count===0) {y+=height+gap; height=0;}
    positions.push({id:node.id,x:offsets.at[i%count],y});
    height=Math.max(height,node.height+footerSpace);
  });
  return {positions,width:offsets.size,height:y+height};
}

function offsetsFor(sizes:number[],gap:number) {
  let end=0;
  const at=sizes.map((size,i)=>{
    const start=end+(i?gap:0);
    end=start+size;
    return start;
  });
  return {at,size:end};
}

// Slide the whole grid into the nearest clear horizontal or vertical interval.
// Moving all lanes together keeps fixed items clear of headers as well as cards.
function clearOrigin(anchor:{x:number;y:number},width:number,height:number,fixed:CanvasNode[],gap:number) {
  const limit=1e7;
  if(width>2*limit || height>2*limit) throw new CanvasError("This arrangement is too large. Choose fewer items or another grouping.");
  const x=Math.min(limit-width,Math.max(-limit,anchor.x));
  const y=Math.min(limit-height,Math.max(-limit,anchor.y));
  const nearest=(desired:number,size:number,blocked:[number,number][])=>{
    const max=limit-size;
    let left=-limit, best:number|undefined;
    function consider(right:number) {
      if(left>right) return;
      const candidate=Math.min(right,Math.max(left,desired));
      if(best===undefined || Math.abs(candidate-desired)<Math.abs(best-desired)) best=candidate;
    }
    for(const [from,to] of blocked.sort((a,b)=>a[0]-b[0])) {
      if(to<=left) continue;
      if(from>=max) break;
      consider(Math.min(max,from));
      left=Math.max(left,to);
    }
    consider(max);
    return best;
  };
  const clearY=(candidateX:number)=>nearest(y,height,
    fixed.filter(n=>n.x<candidateX+width+gap && n.x+n.width>candidateX-gap)
      .map((n):[number,number]=>[n.y-height-gap,n.y+n.height+footerSpace+gap]));
  const horizontal=fixed.filter(n=>n.y<y+height+gap && n.y+n.height+footerSpace>y-gap)
    .map((n):[number,number]=>[n.x-width-gap,n.x+n.width+gap]);
  const newY=clearY(x), newX=nearest(x,width,horizontal);
  if(newY!==undefined && (newX===undefined || Math.abs(newY-y)<=Math.abs(newX-x))) return {x,y:newY};
  if(newX!==undefined) return {x:newX,y};
  // If obstacles block both direct translations, search the boundaries of their
  // X intervals. Between successive boundaries the same vertical gaps exist.
  const candidates=new Set([-limit,limit-width,...fixed.flatMap(n=>[n.x-width-gap,n.x+n.width+gap])]);
  let best:{x:number;y:number}|undefined, distance=Infinity;
  for(const candidate of candidates) {
    if(candidate < -limit || candidate > limit-width || Math.abs(candidate-x)>=distance) continue;
    const candidateY=clearY(candidate);
    if(candidateY===undefined) continue;
    const d=Math.hypot(candidate-x,candidateY-y);
    if(d<distance) {distance=d; best={x:candidate,y:candidateY};}
  }
  if(best) return best;
  throw new CanvasError("There is no clear space for this arrangement. Choose fewer items or another grouping.");
}

export function organizeBoard(board:Board, organizer:CanvasViewOrganizer, options:CanvasArrangementOptions):Board {
  const categories=board.categories??[];
  const byId=new Map(board.nodes.map(node=>[node.id,node]));
  const {orderedIds}=organizerRows(board.nodes,categories,organizer.filters,"",organizer.sortBy,organizer.search);
  const moving=orderedIds.map(id=>byId.get(id)!).filter(node=>!node.locked);
  const arrangement={...options,organizer,bands:[] as CanvasArrangementBand[]};
  if(!moving.length) return {...board,arrangement};
  const {rows,columns,grid}=layoutAxes(moving,categories,options);
  const typical=moving.map(n=>Math.sqrt(n.width*n.height)).sort((a,b)=>a-b)[Math.floor(moving.length/2)];
  const fontSize=Math.max(18,Math.min(512,Math.round(typical/12)));
  const gap=fontSize*2, header=fontSize*4;
  const overrides=new Map(options.labelOverrides?.map(o=>[o.axis+"/"+o.key,o.label]));
  function names(lanes:Axis,axis:"row"|"column",name:string|undefined) {
    const axisName=name?.trim() || lanes.name;
    return lanes.lanes.map(lane=>({...lane,axisName,
      label:overrides.get(axis+"/"+lane.key) || lane.label}));
  }
  const rowLanes=names(rows,"row",options.rowName), columnLanes=names(columns,"column",options.columnName);
  const labelWidth=(lane:{label:string;axisName:string})=>fontSize*(3+Math.max(lane.axisName.length*.55,lane.label.length*.74));
  const gutter=grid?Math.max(fontSize*7,...rowLanes.map(labelWidth))+gap:0;
  const rowIndex=new Map(rowLanes.map((lane,i)=>[lane.key,i]));
  const colIndex=new Map(columnLanes.map((lane,i)=>[lane.key,i]));
  const cells=new Map<number,CanvasNode[]>();
  for(const node of moving) {
    const r=rowIndex.get(rows.assignment.get(node.id)!)!;
    const c=colIndex.get(columns.assignment.get(node.id)!)!;
    const index=r*columnLanes.length+c;
    const cell=cells.get(index);
    if(cell) cell.push(node); else cells.set(index,[node]);
  }
  const rowHeights=rowLanes.map(()=>header);
  const colWidths=columnLanes.map(lane=>grid?labelWidth(lane):Math.max(...rowLanes.map(labelWidth)));
  const packed=[];
  for(const [index,items] of cells) {
    const r=Math.floor(index/columnLanes.length), c=index%columnLanes.length;
    const cell=packCell(items,gap);
    rowHeights[r]=Math.max(rowHeights[r],cell.height+2*gap+(grid?0:header));
    colWidths[c]=Math.max(colWidths[c],cell.width+2*gap);
    packed.push({r,c,cell});
  }
  const rowOffsets=offsetsFor(rowHeights,gap), colOffsets=offsetsFor(colWidths,gap);
  const width=gutter+colOffsets.size, top=grid?header+gap:0, height=top+rowOffsets.size;
  const prior=board.arrangement?.bands.map(b=>b.region)??[];
  const anchors=prior.length?prior:moving;
  const anchor={x:Math.min(...anchors.map(n=>n.x)),y:Math.min(...anchors.map(n=>n.y))};
  const movingIds=new Set(moving.map(node=>node.id));
  const origin=clearOrigin(anchor,width,height,board.nodes.filter(n=>!movingIds.has(n.id)),gap);
  function band(axis:"row"|"column",lane:typeof rowLanes[number],rect:CanvasRect,region:CanvasRect):CanvasArrangementBand {
    return {axis,...lane,...rect,fontSize,region};
  }
  rowLanes.forEach((lane,r)=>{
    const y=origin.y+top+rowOffsets.at[r], region={x:origin.x,y,width,height:rowHeights[r]};
    arrangement.bands.push(band("row",lane,{...region,width:grid?gutter-gap:width,height:header},region));
  });
  if(grid) columnLanes.forEach((lane,c)=>{
    const x=origin.x+gutter+colOffsets.at[c], region={x,y:origin.y,width:colWidths[c],height};
    arrangement.bands.push(band("column",lane,{...region,height:header},region));
  });
  const positions=packed.flatMap(({r,c,cell})=>cell.positions.map(({id,x,y})=>({
    id,x:origin.x+gutter+colOffsets.at[c]+gap+x,
    y:origin.y+top+rowOffsets.at[r]+gap+(grid?0:header)+y,
  })));
  const preserveLegacy=board.legacyPositions===undefined
    && board.views.some(view=>view.mode!=="gallery" && !view.positions && !view.arrangement);
  return {...board,nodes:restorePositions(board.nodes,positions),arrangement,
    ...(preserveLegacy?{legacyPositions:snapshotPositions(board.nodes)}:{})};
}

export function resolveCanvasView(board:Board, view:CanvasView, respectLocks=true):Board {
  if(view.positions!==undefined || view.arrangement) {
    return {...board,arrangement:view.arrangement,
      nodes:view.positions?restorePositions(board.nodes,view.positions,respectLocks):board.nodes};
  }
  const freeform={...board,arrangement:undefined,
    nodes:board.legacyPositions?restorePositions(board.nodes,board.legacyPositions,respectLocks):board.nodes};
  if(view.mode!=="gallery") return freeform;
  const organizer=view.organizer??defaultOrganizerOptions;
  try {
    return organizeBoard(freeform,organizer,{...defaultArrangementOptions,rowBy:organizer.groupBy});
  } catch (error) {
    // A legacy gallery can exceed the board coordinate limits. Its filtered cards remain viewable.
    if (error instanceof CanvasError) return freeform;
    throw error;
  }
}
