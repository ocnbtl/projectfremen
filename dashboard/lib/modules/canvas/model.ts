import { MODULE_ROUTES } from "../../native-objects/routes";
import { isModuleId, type NativeObjectRef } from "../../native-objects/types";

export type ImagePin = {id:string; x:number; y:number; text:string};
export const imagePinLimits = {count:100, text:2000} as const;

export type CanvasNode = {
  id: string;
  kind: "sticky" | "text" | "highlight" | "object";
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body: string;
  notes?: string;
  tagIds?: string[];
  color: string;
  group: string;
  used: boolean;
  appearance?: "plain" | "outline" | "card";
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  locked?: boolean;
  imageSize?: {width:number;height:number};
  imagePins?: ImagePin[];
  ref?: NativeObjectRef;
};
export type CanvasAppearance = NonNullable<CanvasNode["appearance"]>;
export const canvasAppearances = {plain:"Plain",outline:"Outline",card:"Card"} satisfies Record<CanvasAppearance,string>;
export function defaultCanvasAppearance(node:CanvasNode): CanvasAppearance {
  if (node.kind==="text" || node.ref?.module==="media") return "plain";
  return node.kind==="highlight" ? "outline" : "card";
}
export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  style: "solid" | "dashed" | "dotted";
  symbol: "arrow" | "circle" | "none";
  label: string;
};
export type CanvasViewOrganizer = {groupBy: string; sortBy: string; filters: string[]; search: string};
export type CanvasRect = {x:number; y:number; width:number; height:number};
export type CanvasPosition = {id:string; x:number; y:number};
export type CanvasArrangementLabel = {axis:"row"|"column"; key:string; label:string};
export type CanvasArrangementBand = CanvasArrangementLabel & CanvasRect & {
  axisName:string; fontSize:number; region:CanvasRect;
};
export type CanvasArrangementOptions = {
  rowBy:string; columnBy:string; headerStyle:"solid"|"outline"|"minimal"; headerColor:string;
  rowName?:string; columnName?:string; labelOverrides?:CanvasArrangementLabel[];
  rowTint?:string; columnTint?:string; rowOutline?:string; columnOutline?:string;
  rowAlternateTint?:string; columnAlternateTint?:string;
  headerFont?:"sans"|"serif"|"mono"; headerBold?:boolean;
  headerTextColor?:string; headerAlign?:"left"|"center"|"right";
};
export type CanvasArrangement = CanvasArrangementOptions & {
  organizer:CanvasViewOrganizer; bands:CanvasArrangementBand[];
};
export type CanvasView = {
  id: string; name: string; x: number; y: number; zoom: number;
  frameSize?: {width: number; height: number};
  inSequence?: boolean;
  mode?: "board" | "gallery";
  organizer?: CanvasViewOrganizer;
  arrangement?: CanvasArrangement;
  positions?: CanvasPosition[];
};
export const canvasViewLimits = {count: 100, name: 160, search: 240, position: 1e8, minZoom: .002, maxZoom: 8} as const;
export const canvasMaxRequestBytes = 3_000_000;
export const sequenceViews=(views:CanvasView[])=>views.filter(view=>view.inSequence!==false);
export const canvasTagLimits = {categories:64,tags:128,name:80} as const;
export type CanvasCategory = {id:string;name:string;tags:{id:string;name:string}[]};
export type Board = {
  id: string; title: string; folder: string; updatedAt: string; revision: number;
  nodes: CanvasNode[]; edges: CanvasEdge[]; views: CanvasView[];
  categories?: CanvasCategory[];
  arrangement?: CanvasArrangement;
  legacyPositions?: CanvasPosition[];
};
export type BoardSummary = Pick<Board, "id" | "title" | "folder" | "updatedAt" | "revision"> & {
  viewNames?: Pick<CanvasView,"id"|"name">[];
  nodeCount: number; edgeCount: number; viewCount: number; colors: string[];
  preview: Pick<CanvasNode,"x" | "y" | "width" | "height" | "color">[];
};

export class CanvasError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanvasError("Choose a valid canvas item.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, field: string, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new CanvasError("Check the " + field + ".");
  return value;
}
export function canvasId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new CanvasError("Choose a valid canvas ID.");
  return value;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new CanvasError("A canvas position or size is outside the supported range.");
  return value;
}
function option<T extends string | boolean>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new CanvasError("Choose a supported canvas option.");
  return value as T;
}
function entries<T extends {id: string}>(value: unknown, max: number, parse: (input: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value) || value.length > max) throw new CanvasError("This board exceeds the item limit.");
  const result = value.map(item => parse(record(item)));
  if (new Set(result.map(item => item.id)).size !== result.length) throw new CanvasError("Each canvas item needs a unique ID.");
  return result;
}
function reference(value: unknown): NativeObjectRef {
  const item = record(value);
  const moduleId = string(item.module, 30, "linked module", true);
  if (!isModuleId(moduleId)) throw new CanvasError("Choose an object from the workspace.");
  const route = string(item.route, 2048, "object link", true);
  const base = MODULE_ROUTES[moduleId];
  const url = new URL(route, "https://workspace.invalid");
  if (!route.startsWith("/admin/") || /[\\\u0000-\u001f]/.test(route) || url.origin !== "https://workspace.invalid" ||
      !(url.pathname === base || url.pathname.startsWith(base + "/"))) throw new CanvasError("Choose an internal link to the object's module.");
  return {
    module: moduleId, objectType: string(item.objectType, 100, "object type", true),
    objectId: string(item.objectId, 350, "object ID", true), label: string(item.label, 500, "object label", true),
    route: url.pathname + url.search + url.hash,
    ...(item.containerObjectId ? {containerObjectId: string(item.containerObjectId, 350, "parent ID", true)} : {}),
    ...(item.versionId ? {versionId: string(item.versionId, 350, "version ID", true)} : {}),
  };
}
export function boardNames(value: unknown) {
  const item = record(value);
  return {title: string(item.title, 160, "board name", true).trim(), folder: string(item.folder ?? "", 120, "folder").trim()};
}
function namedTag(input:Record<string,unknown>){
  return {id:canvasId(input.id),name:string(input.name,canvasTagLimits.name,"tag name",true).trim()};
}
function checkNames(items:{name:string}[]){
  if(new Set(items.map(item=>item.name.toLowerCase())).size!==items.length)throw new CanvasError("That name is already in use.");
}
function viewOrganizer(value: unknown, categoryIds: Set<string>, tagIds: Set<string>): CanvasViewOrganizer {
  const input = record(value);
  let groupBy = "";
  if (input.groupBy === "item/type" || input.groupBy === "kind") {
    groupBy = input.groupBy;
  } else if (input.groupBy !== undefined && input.groupBy !== "") {
    const categoryId = canvasId(input.groupBy);
    if (categoryIds.has(categoryId)) groupBy = categoryId;
  }

  let sortBy: string = "board";
  if (typeof input.sortBy === "string" && input.sortBy.startsWith("category/")) {
    const categoryId = canvasId(input.sortBy.slice("category/".length));
    if (categoryIds.has(categoryId)) sortBy = input.sortBy;
  } else if (input.sortBy !== undefined) {
    sortBy = option(input.sortBy, ["board", "title", "tags"] as const);
  }

  const filters = input.filters === undefined ? [] : input.filters;
  if (!Array.isArray(filters) || filters.length > canvasTagLimits.categories * canvasTagLimits.tags) {
    throw new CanvasError("Choose filters from this board.");
  }
  return {
    groupBy, sortBy,
    filters: [...new Set(filters.map(canvasId).filter(id => tagIds.has(id)))],
    search: string(input.search === undefined ? "" : input.search, canvasViewLimits.search, "view search").trim()
  };
}
function arrangementRect(value: unknown): CanvasRect {
  const input = record(value);
  return {x:number(input.x,-1e8,1e8), y:number(input.y,-1e8,1e8),
    width:number(input.width,1,2e8), height:number(input.height,1,2e8)};
}
function arrangementLabels<T extends CanvasArrangementLabel>(value:unknown, parse:(input:Record<string,unknown>)=>T):T[] {
  if (!Array.isArray(value) || value.length > 2000) throw new CanvasError("This layout exceeds the lane limit.");
  const result = value.map(item => parse(record(item)));
  if (new Set(result.map(item => item.axis + "/" + item.key)).size !== result.length)
    throw new CanvasError("Each lane needs a unique key within its axis.");
  return result;
}
function arrangementLabel(input:Record<string,unknown>):CanvasArrangementLabel {
  return {axis:option(input.axis,["row","column"] as const), key:string(input.key,128,"lane key"),
    label:string(input.label,160,"lane name",true).trim()};
}
function arrangementColor(value:unknown) {
  if (typeof value !== "string" || !/^#[a-f\d]{6}$/i.test(value)) throw new CanvasError("Choose a valid layout color.");
  return value;
}
function canvasArrangement(value:unknown, categoryIds:Set<string>, tags:Set<string>):CanvasArrangement {
  const input=record(value);
  const dimension=(value:unknown) => {
    if(value==="" || value==="item/type") return value;
    const id=canvasId(value);
    return categoryIds.has(id) || id==="kind" ? id : "";
  };
  const result:CanvasArrangement={
    rowBy:dimension(input.rowBy), columnBy:dimension(input.columnBy),
    headerStyle:option(input.headerStyle,["solid","outline","minimal"] as const), headerColor:arrangementColor(input.headerColor),
    organizer:viewOrganizer(input.organizer,categoryIds,tags),
    bands:arrangementLabels(input.bands,band=>({...arrangementLabel(band),...arrangementRect(band),
      axisName:string(band.axisName,80,"axis name"), fontSize:number(band.fontSize,1,10000),region:arrangementRect(band.region)}))
  };
  for(const prop of ["rowName","columnName"] as const)
    if(input[prop]!==undefined) result[prop]=string(input[prop],80,"axis name").trim();
  for(const prop of ["rowTint","columnTint","rowAlternateTint","columnAlternateTint","rowOutline","columnOutline","headerTextColor"] as const)
    if(input[prop]!==undefined) result[prop]=arrangementColor(input[prop]);
  if(input.headerFont!==undefined) result.headerFont=option(input.headerFont,["sans","serif","mono"] as const);
  if(input.headerBold!==undefined) result.headerBold=option(input.headerBold,[true,false] as const);
  if(input.headerAlign!==undefined) result.headerAlign=option(input.headerAlign,["left","center","right"] as const);
  if(input.labelOverrides!==undefined) result.labelOverrides=arrangementLabels(input.labelOverrides,arrangementLabel);
  return result;
}
function canvasPositions(value:unknown, ids:Set<string>) {
  return entries<CanvasPosition>(value,1000,
    pos=>({id:canvasId(pos.id),x:number(pos.x,-1e7,1e7),y:number(pos.y,-1e7,1e7)})).filter(pos=>ids.has(pos.id));
}
export function boardContents(value: unknown): Pick<Board, "title" | "folder" | "nodes" | "edges" | "views" | "categories" | "arrangement" | "legacyPositions"> {
  const item = record(value);
  const tags=new Set<string>();
  const categories=item.categories===undefined?undefined:entries<CanvasCategory>(item.categories,canvasTagLimits.categories,category=>{
    const options=entries(category.tags,canvasTagLimits.tags,namedTag);
    checkNames(options);
    for(const option of options){
      if(tags.has(option.id))throw new CanvasError("Each board tag needs a unique ID.");
      tags.add(option.id);
    }
    return {...namedTag(category),tags:options};
  });
  if(categories)checkNames(categories);
  const nodes = entries<CanvasNode>(item.nodes, 1000, node => {
    const kind = option(node.kind, ["sticky","text","highlight","object"] as const);
    const color = string(node.color, 32, "item color");
    if (!/^(?:#[\da-f]{3,8}|[a-z][a-z\d-]{0,31})$/i.test(color)) throw new CanvasError("Choose an item color.");
    if (typeof node.used !== "boolean") throw new CanvasError("Choose a valid used status.");
    for (const color of [node.strokeColor,node.fillColor]) {
      if (color !== undefined && (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color))) throw new CanvasError("Choose a valid frame color.");
    }
    if (node.locked !== undefined && typeof node.locked !== "boolean") throw new CanvasError("Choose a valid lock setting.");
    let tagIds:string[]|undefined;
    if(node.tagIds!==undefined){
      if(!Array.isArray(node.tagIds)||node.tagIds.length>tags.size)throw new CanvasError("Choose tags from this board.");
      tagIds=[...new Set(node.tagIds.map(canvasId))];
      if(tagIds.some(id=>!tags.has(id)))throw new CanvasError("Choose tags from this board.");
    }
    const ref = kind === "object" ? reference(node.ref) : undefined;
    let imagePins:ImagePin[] | undefined;
    if (node.imagePins !== undefined) {
      if (ref?.module !== "media" || ref.objectType === "workspace_link") throw new CanvasError("Choose a Media image for pinned notes.");
      imagePins = entries(node.imagePins, imagePinLimits.count, pin => ({
        id:canvasId(pin.id), x:number(pin.x,0,1), y:number(pin.y,0,1),
        text:string(pin.text,imagePinLimits.text,"pin note",true).trim()
      }));
    }
    return {
      id: canvasId(node.id), kind, x: number(node.x, -1e7, 1e7), y: number(node.y, -1e7, 1e7),
      width: number(node.width, 1, 100000), height: number(node.height, 1, 100000),
      title: string(node.title, 500, "item title"), body: string(node.body, 32000, "item text"),
      ...(node.notes!==undefined?{notes:string(node.notes,20000,"notes")} : {}),
      ...(tagIds?{tagIds}:{}),
      group: string(node.group, 160, "group"), color, used: node.used,
      ...(node.appearance !== undefined ? {appearance:option(node.appearance, ["plain","outline","card"] as const)} : {}),
      ...(node.strokeColor !== undefined ? {strokeColor:node.strokeColor as string} : {}),
      ...(node.strokeWidth !== undefined ? {strokeWidth:number(node.strokeWidth,0,32)} : {}),
      ...(node.fillColor !== undefined ? {fillColor:node.fillColor as string} : {}),
      ...(node.locked !== undefined ? {locked:node.locked} : {}),
      ...(kind === "object" && node.imageSize ? {imageSize:{width:number(record(node.imageSize).width,1,100000),height:number(record(node.imageSize).height,1,100000)}} : {}),
      ...(ref ? {ref} : {}),
      ...(imagePins ? {imagePins} : {})
    };
  });
  const ids = new Set(nodes.map(node => node.id));
  const edges = entries<CanvasEdge>(item.edges, 4000, edge => {
    const source = canvasId(edge.source), target = canvasId(edge.target);
    if (source === target || !ids.has(source) || !ids.has(target)) throw new CanvasError("Connect two different items on this board.");
    return {id: canvasId(edge.id), source, target, label: string(edge.label, 250, "connector label"),
      style: option(edge.style, ["solid","dashed","dotted"] as const), symbol: option(edge.symbol, ["arrow","circle","none"] as const)};
  });
  const categoryIds = new Set(categories?.map(category => category.id));
  const views = entries<CanvasView>(item.views, canvasViewLimits.count, view => ({
    id: canvasId(view.id), name: string(view.name, canvasViewLimits.name, "view name", true).trim(),
    x: number(view.x, -canvasViewLimits.position, canvasViewLimits.position), y: number(view.y, -canvasViewLimits.position, canvasViewLimits.position),
    zoom: number(view.zoom, canvasViewLimits.minZoom, canvasViewLimits.maxZoom),
    ...(view.inSequence===undefined?{}:{inSequence:option(view.inSequence,[true,false] as const)}),
    ...(view.frameSize === undefined ? {} : {frameSize: {
      width: number(record(view.frameSize).width, 1, 100000),
      height: number(record(view.frameSize).height, 1, 100000)
    }}),
    ...(view.mode === undefined ? {} : {mode: option(view.mode, ["board", "gallery"] as const)}),
    ...(view.organizer === undefined ? {} : {organizer: viewOrganizer(view.organizer, categoryIds, tags)}),
    ...(view.arrangement === undefined ? {} : {arrangement:canvasArrangement(view.arrangement,categoryIds,tags)}),
    ...(view.positions === undefined ? {} : {positions:canvasPositions(view.positions,ids)})
  }));
  return {...boardNames(item), nodes, edges, views,...(categories?{categories}:{}),
    ...(item.arrangement===undefined?{}:{arrangement:canvasArrangement(item.arrangement,categoryIds,tags)}),
    ...(item.legacyPositions===undefined?{}:{legacyPositions:canvasPositions(item.legacyPositions,ids)})};
}
export function boardSummary(board: Board): BoardSummary {
  const {id, title, folder, updatedAt, revision} = board;
  const nodes = board.nodes;
  const left = Math.min(...nodes.map(node => node.x)), top = Math.min(...nodes.map(node => node.y));
  const width = Math.max(...nodes.map(node => node.x + node.width)) - left;
  const height = Math.max(...nodes.map(node => node.y + node.height)) - top;
  const count = Math.min(20, nodes.length);
  const preview = Array.from({length: count}, (_, i) => {
    const node = nodes[Math.floor(i * (nodes.length - 1) / Math.max(1, count - 1))];
    const percent = (fraction: number) => Math.round(fraction * 10000) / 100;
    return {x: percent((node.x-left)/width), y: percent((node.y-top)/height),
      width: percent(node.width/width), height: percent(node.height/height), color: node.color};
  });
  return {id, title, folder, updatedAt, revision, nodeCount: board.nodes.length, edgeCount: board.edges.length,
    viewCount: board.views.length, viewNames:board.views.map(({id,name})=>({id,name})), colors: [...new Set(nodes.map(node => node.color))].slice(0,4), preview};
}
