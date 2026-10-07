/** Optional semantic keywords let icon pickers use everyday language, without
 * exposing a long list of synonyms as the option's accessible name. */
export function matchesChoiceSearch(query: string, label: string, value: string, keywords?: string) {
  if (!query) return true;
  if (keywords === undefined) return `${label} ${value}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const normalize = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const haystack = normalize(`${label} ${value} ${keywords}`);
  return normalize(query).split(/\s+/).every(term => haystack.includes(term));
}
