export const HOME_SHORTCUTS = [
  { id: "passwords", label: "Passwords", icon: "password", href: "/admin/personal/passwords" },
  { id: "lists", label: "Lists", icon: "list", href: "/admin/personal/lists" },
  { id: "travel", label: "Travel", icon: "travel", href: "/admin/personal/travel" },
  { id: "personal-build", label: "Personal Build", icon: "build", href: "/admin/personal/personal-build" },
  { id: "car", label: "Car", icon: "car", href: "/admin/personal/car" },
  { id: "style-guide", label: "Style Guide", icon: "style-guide", href: "/admin/personal/style-guide" },
  { id: "dog", label: "Dog", icon: "dog", href: "/admin/personal/dog" }
] as const;
export const SECTION_ICONS = ["list", "goal", "routine", "travel", "car", "dog", "build", "resource", "star", "person"] as const;
export type PersonalSection = { id: string; label: string; icon: typeof SECTION_ICONS[number]; listId: string };
export type PersonalHomeSettings = { updatedAt: string; hidden: string[]; sections: PersonalSection[] };
export const emptyHomeSettings = (): PersonalHomeSettings => ({ updatedAt: "", hidden: [], sections: [] });
export function validateHomeSettings(value: unknown): Pick<PersonalHomeSettings, "hidden" | "sections"> {
  if (!value || typeof value !== "object") throw new Error("Personal settings are required");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.hidden) || !Array.isArray(raw.sections) || raw.sections.length > 40) throw new Error("Choose up to 40 personal sections");
  const sections = raw.sections.map((entry: unknown): PersonalSection => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid section");
    const s = entry as Record<string, unknown>;
    if (typeof s.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(s.id) || typeof s.listId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(s.listId) || typeof s.label !== "string" || !s.label.trim() || s.label.trim().length > 60 || !SECTION_ICONS.includes(s.icon as typeof SECTION_ICONS[number])) throw new Error("A section needs a name, icon, and saved list");
    return { id: s.id, label: s.label.trim(), icon: s.icon as PersonalSection["icon"], listId: s.listId };
  });
  if (new Set(sections.map(s => s.id)).size !== sections.length) throw new Error("Duplicate sections");
  const known = new Set<string>([...HOME_SHORTCUTS.map(s => s.id), ...sections.map(s => s.id)]);
  if (raw.hidden.some(id => typeof id !== "string" || !known.has(id))) throw new Error("Unknown hidden section");
  return { hidden: [...new Set(raw.hidden as string[])], sections };
}
