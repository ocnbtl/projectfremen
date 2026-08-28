import type { ResourceRecord } from "../resources/types";

export const STYLE_GUIDE_AREA = "Style Guide";
const SECTION = /^## (Visual|Code|Animation)\s*$/im;

export type StyleGuideComponentContent = {
  visual: string;
  code: string;
  animation: string;
};

export function encodeStyleGuideComponent(content: StyleGuideComponentContent): string {
  return [
    "## Visual",
    content.visual.trim(),
    "",
    "## Code",
    content.code.trim(),
    "",
    "## Animation",
    content.animation.trim()
  ].join("\n").trim();
}

export function decodeStyleGuideComponent(body: string): StyleGuideComponentContent {
  if (!SECTION.test(body)) return { visual: body.trim(), code: "", animation: "" };
  const sections: StyleGuideComponentContent = { visual: "", code: "", animation: "" };
  const matches = Array.from(body.matchAll(/^## (Visual|Code|Animation)\s*$/gim));
  matches.forEach((match, index) => {
    const key = match[1].toLowerCase() as keyof StyleGuideComponentContent;
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    sections[key] = body.slice(start, end).trim();
  });
  return sections;
}

export function isStyleGuideComponent(resource: ResourceRecord): boolean {
  return resource.provenance.areas.some((area) => area.toLowerCase() === STYLE_GUIDE_AREA.toLowerCase());
}
