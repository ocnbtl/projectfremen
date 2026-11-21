import { MODULE_ROUTES } from "../native-objects/routes";
import type { ModuleId, NativeObjectRef } from "../native-objects/types";

type TextPart = { kind: "text"; text: string };
type Mark = { label: string; href: string; raw: string; offset: number };
export type WritingPart = TextPart | (Mark & ({ kind: "skill"; id: string; action?: "copy" | "collection" } | { kind: "object"; module: ModuleId }));
const moduleEntries = Object.entries(MODULE_ROUTES) as [ModuleId, string][];
const marker = /\[((?:\\[\\[\]]|[^\]\\\r\n]){1,512})\]\((\/admin\/[^\s()\\]{1,2048})\)/g;

export function writingDestination(label: string, href: string, raw = "", offset = 0): Exclude<WritingPart, TextPart> | null {
  if (!href.startsWith("/admin/") || /[\\\u0000-\u001f]|%(?:5c|0a|0d)|(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(href)) return null;
  const url = new URL(href, "https://workspace.invalid");
  const owner = moduleEntries.find(([, base]) => url.pathname === base || url.pathname.startsWith(base + "/"));
  if (!owner) return null;
  const id = url.searchParams.get("skill");
  if (url.pathname === "/admin/personal/settings" && id && /^[\w-]{1,128}$/.test(id)) {
    const action = url.searchParams.get("behavior");
    return { kind: "skill", id, href, label, raw, offset, action: action === "copy" || action === "collection" ? action : undefined };
  }
  return { kind: "object", module: owner[0], href, label, raw, offset };
}

function link(label: string, href: string) {
  const name = label.replace(/\s+/g, " ").trim().slice(0, 250).replace(/[\\[\]]/g, "\\$&");
  return "[" + name + "](" + href.replace(/[\s()]/g, c => "%" + c.charCodeAt(0).toString(16)) + ")";
}
export function objectToken(ref: NativeObjectRef) {
  return writingDestination(ref.label, ref.route) ? link(ref.label, ref.route) : ref.label;
}
export function skillToken(skill: { id: string; name: string; behavior?: "copy" | "collection" | "snippet" }) {
  const params = new URLSearchParams({skill:skill.id});
  if (skill.behavior && skill.behavior !== "snippet" && !["prompt","copy-prompt"].includes(skill.id)) {
    params.set("behavior",skill.behavior);
    params.set("name",skill.name);
  }
  return link(skill.name, "/admin/personal/settings?" + params.toString());
}
export function parseWriting(text: string): WritingPart[] {
  const parts: WritingPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(marker)) {
    const part = writingDestination(match[1].replace(/\\([\\[\]])/g, "$1"), match[2], match[0], match.index);
    if (!part) continue;
    if (match.index > cursor) parts.push({ kind: "text", text: text.slice(cursor, match.index) });
    parts.push(part);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length || !parts.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}

export function writingPlainText(text: string) {
  if (!text.includes("](/admin/")) return text;
  return parseWriting(text).map(part => part.kind === "text" ? part.text : part.label).join("");
}

// Keep multi-paragraph prompts intact. A new collection marker starts a new passage.
export function writingContext(text: string, offset: number, collectionIds: readonly string[] = ["prompt"]) {
  const parts = parseWriting(text);
  const headings = parts.filter(p => p.kind === "skill" && (collectionIds.includes(p.id) || p.action === "collection"));
  let start = 0, end = text.length;
  for (const heading of headings) {
    if (heading.kind !== "skill") continue;
    if (heading.offset <= offset) start = heading.offset + heading.raw.length;
    else { end = heading.offset; break; }
  }
  const passage = (start === end || !text.slice(start, end).trim()) ? text : text.slice(start, end);
  return parseWriting(passage).map(p => p.kind === "text" ? p.text : p.kind === "object" ? p.label : "").join("").trim();
}
