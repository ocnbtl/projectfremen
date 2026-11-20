import { MODULE_ROUTES } from "../../native-objects/routes";
import { isModuleId, type NativeObjectRef } from "../../native-objects/types";

export type CanvasNode = {
  id: string;
  kind: "sticky" | "text" | "highlight" | "object";
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body: string;
  color: string;
  group: string;
  used: boolean;
  appearance?: "plain" | "outline" | "card";
  imageSize?: {width:number;height:number};
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
export type CanvasView = { id: string; name: string; x: number; y: number; zoom: number };
export type Board = {
  id: string; title: string; folder: string; updatedAt: string; revision: number;
  nodes: CanvasNode[]; edges: CanvasEdge[]; views: CanvasView[];
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
function option<T extends string>(value: unknown, allowed: readonly T[]): T {
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
export function boardContents(value: unknown): Pick<Board, "title" | "folder" | "nodes" | "edges" | "views"> {
  const item = record(value);
  const nodes = entries<CanvasNode>(item.nodes, 1000, node => {
    const kind = option(node.kind, ["sticky","text","highlight","object"] as const);
    const color = string(node.color, 32, "item color");
    if (!/^(?:#[\da-f]{3,8}|[a-z][a-z\d-]{0,31})$/i.test(color)) throw new CanvasError("Choose an item color.");
    if (typeof node.used !== "boolean") throw new CanvasError("Choose a valid used status.");
    return {
      id: canvasId(node.id), kind, x: number(node.x, -1e7, 1e7), y: number(node.y, -1e7, 1e7),
      width: number(node.width, 1, 100000), height: number(node.height, 1, 100000),
      title: string(node.title, 500, "item title"), body: string(node.body, 32000, "item text"),
      group: string(node.group, 160, "group"), color, used: node.used,
      ...(node.appearance !== undefined ? {appearance:option(node.appearance, ["plain","outline","card"] as const)} : {}),
      ...(kind === "object" && node.imageSize ? {imageSize:{width:number(record(node.imageSize).width,1,100000),height:number(record(node.imageSize).height,1,100000)}} : {}),
      ...(kind === "object" ? {ref: reference(node.ref)} : {})
    };
  });
  const ids = new Set(nodes.map(node => node.id));
  const edges = entries<CanvasEdge>(item.edges, 4000, edge => {
    const source = canvasId(edge.source), target = canvasId(edge.target);
    if (source === target || !ids.has(source) || !ids.has(target)) throw new CanvasError("Connect two different items on this board.");
    return {id: canvasId(edge.id), source, target, label: string(edge.label, 250, "connector label"),
      style: option(edge.style, ["solid","dashed","dotted"] as const), symbol: option(edge.symbol, ["arrow","circle","none"] as const)};
  });
  const views = entries<CanvasView>(item.views, 100, view => ({
    id: canvasId(view.id), name: string(view.name, 160, "view name", true).trim(),
    x: number(view.x, -1e8, 1e8), y: number(view.y, -1e8, 1e8), zoom: number(view.zoom, 0.002, 8)
  }));
  return {...boardNames(item), nodes, edges, views};
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
