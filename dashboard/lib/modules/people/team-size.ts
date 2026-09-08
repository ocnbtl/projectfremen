/** Format completed numeric entries; preserve ranges, qualifiers and free-form descriptions. */
export function formatTeamSize(value: string): string {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value.trim())) return value;
  const count = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(count) ? count.toLocaleString("en-US") : value;
}

export function editTeamSize(value: string): string {
  return /^\d{1,3}(?:,\d{3})+$/.test(value) ? value.replace(/,/g, "") : value;
}

/** Round sourced exact totals only. Ranges and lower bounds retain their published meaning. */
export function approximateTeamSize(value: string): string {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) return value;
  const count = Number(value.replace(/,/g, ""));
  if (!Number.isSafeInteger(count) || count < 100) return formatTeamSize(value);
  const step = count < 1000 ? 10 : count < 10000 ? 100 : 10 ** Math.max(3, Math.floor(Math.log10(count)) - 2);
  const rounded = Math.ceil(count / step) * step;
  const coarseStep = 10 ** Math.floor(Math.log10(count));
  const coarse = Math.ceil(count / coarseStep) * coarseStep;
  return formatTeamSize(String(count >= 10000 && (coarse - count) / count <= 0.02 ? coarse : rounded));
}
