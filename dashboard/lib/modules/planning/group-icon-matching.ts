import catalog from "./group-icon-catalog.json";
import registry from "../../icons/icon-registry.json";
import type { EventGroup } from "./types";

const normalize = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stem = (word: string) => word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.length > 3 && word.endsWith("s") && !/(ss|us)$/.test(word) ? word.slice(0, -1) : word;
const filler = new Set("a an the my our and or for of to with in on at group groups calendar calendars new custom session sessions activity activities".split(" ").map(stem));
const words = (text: string) => [...new Set(normalize(text).split(" ").map(stem).filter(word => word.length > 1 && !filler.has(word)))];
const glyphs = new Map(registry.map(icon => [icon.id, icon.defaultCandidate]));
const entries = catalog.map(icon => ({
  role: icon.role,
  label: normalize(icon.label),
  glyph: normalize(glyphs.get(icon.role) || icon.role),
  primary: new Set(words(`${icon.label} ${glyphs.get(icon.role) || icon.role}`)),
  terms: new Set(words(`${icon.label} ${glyphs.get(icon.role) || icon.role} ${icon.description} ${icon.keywords}`)),
}));
const frequency = new Map<string, number>();
for (const entry of entries) for (const term of entry.terms) frequency.set(term, (frequency.get(term) || 0) + 1);

// Familiar broad group names should select the broad icon, not a specialist
// activity that happens to mention the same word in its search synonyms.
const commonNames: Record<string, string> = {
  work: "briefcase", business: "briefcase", school: "university", education: "university",
  personal: "person", travel: "travel", fitness: "calendar-group-barbell", exercise: "calendar-group-barbell",
  health: "calendar-group-medical-cross", wellness: "calendar-group-yoga", meditation: "calendar-group-yoga",
  cleaning: "calendar-group-vacuum-cleaner", housework: "calendar-group-vacuum-cleaner",
  family: "calendar-group-home-heart", friend: "calendar-group-friends", pet: "dog",
  finance: "module-finance", money: "wallet", meeting: "interaction-meeting", birthday: "birthday",
};

/** Local matching uses the same icon names, descriptions, and synonyms as search.
 * Whole words avoid matching partial typing (e.g. "car" inside "care"). */
export function suggestGroupIcon(name: string): string | null {
  const query = normalize(name);
  if (query.length < 3) return null;
  const exact = entries.find(entry => entry.label === query || entry.glyph === query);
  if (exact) return exact.role;
  const tokens = words(name);
  if (!tokens.length) return null;
  if (tokens.length === 1 && commonNames[tokens[0]]) return commonNames[tokens[0]];
  let best: string | null = null, bestScore = 0;
  for (const entry of entries) {
    const matched = tokens.filter(token => entry.terms.has(token));
    if (!matched.length || matched.length / tokens.length < 0.5) continue;
    const score = matched.reduce((sum, term) => sum + Math.log(1 + entries.length / (frequency.get(term) || 1)) * (entry.primary.has(term) ? 3 : 1), 0)
      * matched.length / tokens.length;
    if (score > bestScore) { bestScore = score; best = entry.role; }
  }
  return bestScore >= 2 ? best : null;
}

export function renameCalendarGroup(group: EventGroup, name: string): EventGroup {
  const automatic = group.iconSource === "auto" || (!group.iconSource && group.icon === "star");
  return automatic
    ? { ...group, name, icon: suggestGroupIcon(name) || "star", iconSource: "auto" }
    : { ...group, name };
}
