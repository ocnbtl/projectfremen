import type { FeatureCollection } from "geojson";
import type { RegionMetric } from "./map-providers";

export type MapData = {
  rows: RegionMetric[];
  source: string;
  sourceUrl: string;
  period: string;
  unit: string;
  geography: string;
  geometry: FeatureCollection | null;
  geometryNote?: string;
};
export type MapAnalysisSettings = {
  countryCode?: string;
  metrics: { metric: string; min?: number; max?: number }[];
  match: "all" | "any";
  scale: "quantile" | "linear";
};
export const MAP_METRICS: Record<string, string> = {
  "world-population": "Population",
  "world-density": "Population density",
  "regional-population": "Population estimate",
  "regional-density": "Population density",
  population: "Population",
  age: "Median age",
  income: "Household income",
};
export const MAP_COLORS = [
  "#edf8b1",
  "#addd8e",
  "#41b6c4",
  "#2c7fb8",
  "#253494",
];
export function mapAnalysis(data: MapData[], settings: MapAnalysisSettings) {
  const primary = data[0];
  if (!primary) return;
  if (
    data.some(
      (d) =>
        d.geography !== primary.geography ||
        (!settings.metrics[0].metric.startsWith("world-") &&
          d.period !== primary.period),
    )
  )
    throw new Error(
      "These releases cannot be combined: geography or dates differ.",
    );
  const values = primary.rows
    .flatMap((r) => (r.value === null ? [] : [r.value]))
    .sort((a, b) => a - b);
  const min = values[0] ?? 0,
    max = values.at(-1) ?? 0;
  const thresholds = [1, 2, 3, 4].map((i) =>
    settings.scale === "linear"
      ? min + ((max - min) * i) / 5
      : (values[
          Math.min(values.length - 1, Math.floor((values.length * i) / 5))
        ] ?? 0),
  );
  const indexes = data.map((d) => new Map(d.rows.map((r) => [r.id, r])));
  const active = settings.metrics.flatMap((filter, i) =>
    filter.min !== undefined || filter.max !== undefined
      ? [{ ...filter, i }]
      : [],
  );
  const rows = primary.rows.map((row) => {
    const matches = active.map((filter) => {
      const value = indexes[filter.i].get(row.id)?.value;
      return (
        value !== null &&
        value !== undefined &&
        (filter.min === undefined || value >= filter.min) &&
        (filter.max === undefined || value <= filter.max)
      );
    });
    return {
      ...row,
      matches:
        !active.length ||
        (settings.match === "all"
          ? matches.every(Boolean)
          : matches.some(Boolean)),
      comparisons: settings.metrics.map((filter, i) => ({
        label: MAP_METRICS[filter.metric],
        value: indexes[i].get(row.id)?.value ?? null,
        unit: data[i].unit,
        year: indexes[i].get(row.id)?.year,
        uncertainty: indexes[i].get(row.id)?.uncertainty,
      })),
    };
  });
  const index = new Map(rows.map((r) => [r.id, r]));
  const features =
    primary.geometry?.features.map((feature) => {
      const row = index.get(String(feature.properties?.GEOID));
      const value = row?.value ?? null;
      return {
        ...feature,
        properties: {
          name: row?.name || feature.properties?.NAME,
          value,
          normalized: value === null || max === min ? 0 : (value - min) / (max - min),
          year: row?.year,
          matches: row?.matches ?? false,
          color:
            value === null
              ? "#c4c9c0"
              : MAP_COLORS[thresholds.filter((t) => value >= t).length],
          details: JSON.stringify(row?.comparisons || []),
        },
      };
    }) || [];
  return {
    geometry: { type: "FeatureCollection" as const, features },
    rows,
    thresholds,
    min,
    max,
    unit: primary.unit,
    matched: rows.filter((r) => r.matches && r.value !== null).length,
  };
}
