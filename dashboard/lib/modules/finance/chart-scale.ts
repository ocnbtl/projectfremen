/** Dollar-based domain shared by every Finance cashflow series, including withdrawals. */
export function financeChartScale(values: readonly number[]) {
  const finite = values.filter(Number.isFinite);
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const span = high - low || 100;
  const roughStep = span / 4;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= roughStep)! * power;
  const min = Math.floor(low / step) * step;
  const max = Math.max(min + step, Math.ceil(high / step) * step);
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step) };
}
