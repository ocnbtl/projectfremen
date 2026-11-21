import { fromMarkdown } from "mdast-util-from-markdown";
import { isBoardSourceModule, sourceFromUrl } from "../modules/canvas/source-reference";
import { parseWriting, writingDestination, writingPlainText, type WritingPart } from "./tokens";
import type { WritingSource } from "./usage";

export type WritingMention = { href: string; title: string; area: string; field: string; context: string };
export type MentionSources = { sources: WritingSource[]; aliases: Map<string,string>; unavailable: string[] };

/** Resolve the selected record, ignoring display state. Child records retain their container identity. */
export function mentionIdentity(href: string): string | undefined {
  if (href.length > 2048 || /\s/.test(href)) return;
  const destination = writingDestination("", href);
  if (destination?.kind !== "object") return;
  const url = new URL(href, "https://workspace.invalid");
  const path = url.pathname.replace(/\/$/, "");
  const query = url.searchParams;
  if (/^\/admin\/personal\/(?:passwords|settings)(?:\/|$)/.test(path)) return;
  if (isBoardSourceModule(destination.module)) {
    const id = sourceFromUrl(destination.module, url);
    if (id) return "/admin/" + destination.module + "/" + encodeURIComponent(id);
  }
  const profile = path === "/admin/people" && query.get("person");
  const resource = path === "/admin/resources" && query.get("selected");
  const review = path === "/admin/reviews" && query.get("review");
  const interaction = path === "/admin/people" && query.get("interaction");
  if (interaction) return "/admin/people?interaction=" + encodeURIComponent(interaction);
  if (profile || resource || review) return path + "/" + encodeURIComponent(profile || resource || review || "");
  const task = (path === "/admin/personal" || path === "/admin/personal/tasks") && query.get("task");
  if (task) return "/admin/personal?task=" + encodeURIComponent(task);
  const base = path.replace(/\/edit$/, "");
  const parts = base.split("/").filter(Boolean);
  const identity = new URLSearchParams();
  for (const name of ["board","card","entry","travel","selected","item"]) {
    const id = query.get(name);
    if (id) identity.set(name, id);
  }
  if (identity.size) return base + "?" + identity.toString();
  if (parts.length < 3 || (destination.module === "personal_ops" && parts.length < 4)) return;
  try { return parts.map(part => "/" + encodeURIComponent(decodeURIComponent(part))).join(""); }
  catch { return; }
}

function markdownLinkOffsets(text: string) {
  const offsets = new Set<number>();
  type Node = { type: string; children?: readonly Node[]; position?: { start: { offset?: number } } };
  function visit(node: Node) {
    if (node.type === "link" && node.position?.start.offset !== undefined) offsets.add(node.position.start.offset);
    else node.children?.forEach(visit);
  }
  visit(fromMarkdown(text));
  return offsets;
}

function snippet(parts: WritingPart[], index: number) {
  const visible = (part: WritingPart) => part.kind === "text" ? part.text : part.label;
  const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
  const before = parts.slice(0,index).map(visible).join("").replace(/\s+/g," ");
  const after = parts.slice(index+1).map(visible).join("").replace(/\s+/g," ");
  return tidy((before.length > 72 ? "…" + before.slice(-72) : before) + visible(parts[index]) +
    (after.length > 100 ? after.slice(0,100) + "…" : after));
}

export function findObjectMentions({sources, aliases}: MentionSources, target: string) {
  const canonical = (href: string) => aliases.get(href) ?? href;
  const items = new Map<string,WritingMention>();
  for (const source of sources) {
    const sourceId = canonical(mentionIdentity(source.href) || source.href);
    if (items.has(sourceId) || !source.text.includes("](/admin/")) continue;
    const parts = parseWriting(source.text);
    let rendered: Set<number> | undefined;
    const index = parts.findIndex(part => {
      if (part.kind !== "object" || canonical(mentionIdentity(part.href) || "") !== canonical(target)) return false;
      if (!source.markdown) return true;
      rendered ??= markdownLinkOffsets(source.text);
      return rendered.has(part.offset);
    });
    if (index < 0) continue;
    items.set(sourceId, {href:source.href, title:writingPlainText(source.title), area:source.area, field:source.field, context:snippet(parts,index)});
  }
  return [...items.values()].sort((a,b) => a.area.localeCompare(b.area) || a.title.localeCompare(b.title) || a.href.localeCompare(b.href));
}
