import { parseWriting, writingContext, writingPlainText } from "./tokens";

export type WritingSource = {
  key: string;
  title: string;
  field: string;
  area: string;
  text: string;
  href: string;
  updatedAt?: string;
  legacyPrompt?: string;
  promptRecord?: boolean;
};
export type WritingUsage = Pick<WritingSource, "key" | "title" | "field" | "area" | "text" | "href" | "updatedAt">;

export function findSkillUsages(sources: WritingSource[], id: string, collections: readonly string[] = ["prompt"]): WritingUsage[] {
  const rows: WritingUsage[] = [];
  for (const source of sources) {
    const contexts = new Set<string>();
    const add = (suffix: string, text: string) => {
      if (contexts.has(text)) return;
      contexts.add(text);
      rows.push({key:source.key + ":" + suffix, title:writingPlainText(source.title), field:source.field,
        area:source.area, href:source.href, updatedAt:source.updatedAt, text});
    };
    const text = source.text;
    const parts = text.includes("](/admin/") ? parseWriting(text) : [];
    if (source.legacyPrompt !== undefined && (id === "copy-prompt" || id === "prompt")) add("import", source.legacyPrompt);
    if (source.promptRecord && id === "prompt" && !parts.some(p => p.kind === "skill" && (p.id === "prompt" || p.id === "copy-prompt"))) {
      add("record", parts.length ? writingContext(text, 0, []) : text);
    }
    for (const part of parts) {
      if (part.kind === "skill" && (part.id === id || (id === "prompt" && part.id === "copy-prompt"))) {
        add(String(part.offset), writingContext(text, part.offset, collections));
      }
    }
  }
  return rows;
}
