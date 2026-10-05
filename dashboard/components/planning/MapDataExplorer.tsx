"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import {
  mapAnalysis,
  MAP_METRICS,
  type MapAnalysisSettings,
  type MapData,
} from "../../lib/modules/planning/map-analysis";
import { MAP_CATALOG, MAP_PALETTES } from "../../lib/modules/planning/map-catalog";
import styles from "./MapWorkspace.module.css";
import countryCatalog from "../../data/map/world-regions-catalog.json";
import { STATE_FLAGS } from "../../lib/modules/planning/map-flags";
export type AnalysisResult = NonNullable<ReturnType<typeof mapAnalysis>> & {
  label: string;
  data: MapData[];
  scale: string;
};
const usLevels = ["country", "state", "county", "place", "tract"];
const format = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);

export default function MapDataExplorer({
  level,
  state,
  states,
  settings,
  onLevel,
  onState,
  onSettings,
  onResult,
  loadKey = 0,
}: {
  level: string;
  state: string;
  states: string[][];
  settings: MapAnalysisSettings;
  onLevel: (level: string) => void;
  onState: (state: string) => void;
  onSettings: (settings: MapAnalysisSettings) => void;
  onResult: (value: AnalysisResult | undefined) => void;
  loadKey?: number;
}) {
  const [data, setData] = useState<MapData[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [sort, setSort] = useState("value"),
    [onlyMatches, setOnlyMatches] = useState(false),
    [page, setPage] = useState(0);
  const [regionQuery, setRegionQuery] = useState("");
  const countryCode = settings.countryCode || "USA";
  const international = countryCode !== "USA";
  const levels = international ? usLevels.slice(0, 3) : usLevels;
  const labels = international ? ["Country", "Province / state", "District / county"] : ["Country", "State", "County", "City / town", "Tract"];
  const territory = countryCatalog.find((c) => c.code === countryCode);
  const coverage = territory?.levels[level === "state" ? "1" : "2"];
  const key = JSON.stringify([
      level,
      state,
      countryCode,
      settings.metrics.map((m) => m.metric),
    ]),
    currentKey = useRef(key),
    request = useRef(0);
  currentKey.current = key;
  const [loadedKey, setLoadedKey] = useState("");
  const country = level === "country",
    available = country
      ? Object.keys(MAP_CATALOG).filter(key => key.startsWith("world-"))
      : international ? ["regional-population", "regional-density"]
      : ["population", "age", "income"];
  const invalidRange = settings.metrics.some(
    (m) => m.min !== undefined && m.max !== undefined && m.min > m.max,
  );
  const result = useMemo(() => {
    if (loadedKey !== key || !data.length || invalidRange) return undefined;
    try {
      const value = mapAnalysis(data, settings);
      return value
        ? {
            ...value,
            label: MAP_METRICS[settings.metrics[0].metric],
            data,
            scale: settings.scale,
          }
        : undefined;
    } catch {
      return undefined;
    }
  }, [data, loadedKey, key, settings, invalidRange]);
  useEffect(() => {
    onResult(result);
    setPage(0);
  }, [result, onResult]);
  function changeLevel(next: string) {
    onLevel(next);
    const nextCountry = next === "country";
    if (nextCountry !== country)
      onSettings({
        ...settings,
        metrics: [{ metric: nextCountry ? "world-population" : international ? "regional-population" : "population" }],
      });
    setError("");
  }
  async function load() {
    const token = ++request.current,
      queryKey = key;
    setBusy(true);
    setError("");
    try {
      const loaded = await Promise.all(
        settings.metrics.map(async ({ metric }) => {
          const response = await fetch(
            `/api/map?${new URLSearchParams({ operation: "demographics", metric, level, state, country: countryCode })}`,
          );
          const body = await response.json();
          if (!response.ok || !body.ok)
            throw new Error(body.error || "Map data unavailable");
          return body.data as MapData;
        }),
      );
      // Fail closed on mixed releases rather than displaying a misleading cross-filter.
      mapAnalysis(loaded, settings);
      if (token === request.current && queryKey === currentKey.current) {
        setData(loaded);
        setLoadedKey(queryKey);
      }
    } catch (e) {
      if (token === request.current) setError((e as Error).message);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (loadKey && settings.metrics.length) void load();
    // A saved-view selection is the explicit trigger; changing filters stays local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);
  const shown = (result?.rows || [])
    .filter(r => r.name.toLowerCase().includes(regionQuery.toLowerCase()))
    .filter((r) => !onlyMatches || (r.matches && r.value !== null))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (b.value ?? -1) - (a.value ?? -1),
    );
  return (
    <section className={styles.layers} aria-label="Map data explorer">
      <div className={styles.explorerForm}>
        <label>
          Country or territory
          <SelectField aria-label="Data country" searchable autoFocusSearch={false} value={country ? "WORLD" : countryCode}
            onChange={(e) => {
              const next = e.target.value;
              onLevel(next === "WORLD" ? "country" : "state");
              onState("");
              onSettings({ ...settings, countryCode: next === "WORLD" ? countryCode : next,
                metrics: [{ metric: next === "WORLD" ? "world-population" : next === "USA" ? "population" : "regional-population" }] });
              setError("");
            }}>
            <option value="WORLD">All countries · World overview</option>
            {countryCatalog.map((c) => <option key={c.code} value={c.code}>
              <span className={styles.flagOption}>
                {/^[A-Z]{2}$/.test(c.iso2 || "") && <svg width="24" height="16" viewBox="0 0 513 342" aria-hidden="true"><use href={`/country-flags.svg#flag-${c.iso2}`} /></svg>}
                <span>{c.name}{c.code !== "USA" && !c.levels["2"]?.available ? " · boundaries only" : ""}</span>
              </span>
            </option>)}
          </SelectField>
        </label>
        <label>
          Detail <strong>{labels[levels.indexOf(level)]}</strong>
          <input
            aria-label="Geographic detail"
            type="range"
            min={0}
            max={levels.length - 1}
            step={1}
            value={Math.max(0, levels.indexOf(level))}
            aria-valuetext={labels[levels.indexOf(level)]}
            onChange={(e) => changeLevel(levels[Number(e.target.value)])}
          />
        </label>
        <div className={styles.levels}>
          {levels.map((v, i) => (
            <button
              type="button"
              key={v}
              aria-pressed={v === level}
              onClick={() => changeLevel(v)}
            >
              {labels[i]}
            </button>
          ))}
        </div>
        <small className="work-muted">
          {country
            ? "World countries · World Bank"
            : international ? `${territory?.name} · WorldPop estimates, 2020`
            : "United States · Census ACS five-year estimates"}
        </small>
        {!country && international && <small className={styles.coverageNote}>
          {coverage?.available || 0} of {coverage?.regions || 0} regions have population estimates.
          {" "}State/province and district/county equivalents follow each country’s administrative system. City and tract data are currently U.S. only.
        </small>}
        {!country && !international && level !== "state" && (
          <label>
            State or territory
            <SelectField
              aria-label="Data state"
              searchable
              autoFocusSearch={false}
              value={state}
              onChange={(e) => onState(e.target.value)}
            >
              <option value="">Choose a state</option>
              {states.map(([value, label]) => (
                <option key={value} value={value}>
                  <span className={styles.flagOption}>
                    {/* Static local flags avoid third-party image requests. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/map-flags/${STATE_FLAGS[value]}.${value === "11" ? "svg" : "png"}`} width="24" height="16" alt="" />
                    <span>{label}</span>
                  </span>
                </option>
              ))}
            </SelectField>
          </label>
        )}
        <fieldset className={styles.dataMetrics}>
          <legend>Data layers</legend>
          <div className={styles.metricCatalog}>
          {[...new Set(available.map(metric => MAP_CATALOG[metric].category))].map(category => <section key={category} className={styles.metricCategory}>
            <h3>{category}</h3><div className={styles.metricGrid}>{available.filter(metric => MAP_CATALOG[metric].category === category).map(metric => {
              const item = MAP_CATALOG[metric], selected = settings.metrics.some(m => m.metric === metric);
              return <button type="button" key={metric} className={styles.metricCard} aria-pressed={selected} disabled={!selected && settings.metrics.length >= 3} onClick={() => onSettings({...settings, metrics: selected ? settings.metrics.filter(m => m.metric !== metric) : [...settings.metrics, {metric}]})}>
                <UnigentamosIcon role={item.icon} size={20} /><span><strong>{item.name}</strong><small>{item.description}</small></span><span className={styles.metricCheck}><UnigentamosIcon role={selected ? "check" : "plus"} size={14} /></span>
              </button>;
            })}</div>
          </section>)}
          </div>
          <div className={styles.layerSelection}><span>{settings.metrics.length} / 3 layers</span>{!!settings.metrics.length && <button type="button" onClick={() => { onSettings({...settings, metrics: []}); setData([]); }}>Clear</button>}</div>
        </fieldset>
        {settings.metrics.length > 1 && (
          <label>
            Color by
            <SelectField
              value={settings.metrics[0].metric}
              onChange={(e) =>
                onSettings({
                  ...settings,
                  metrics: [
                    settings.metrics.find((m) => m.metric === e.target.value)!,
                    ...settings.metrics.filter(
                      (m) => m.metric !== e.target.value,
                    ),
                  ],
                })
              }
            >
              {settings.metrics.map((m) => (
                <option key={m.metric} value={m.metric}>
                  {MAP_METRICS[m.metric]}
                </option>
              ))}
            </SelectField>
          </label>
        )}
        {error && (
          <p role="alert" className={styles.dataError}>
            {error}
          </p>
        )}
        {!!settings.metrics.length && (
          <>
            <div className={styles.dataHeading}>
              <strong><UnigentamosIcon role="sliders" size={16} /> Filter regions</strong>
              <SelectField
                aria-label="Combine filters"
                value={settings.match}
                onChange={(e) =>
                  onSettings({
                    ...settings,
                    match: e.target.value as "all" | "any",
                  })
                }
              >
                <option value="all">Match all</option>
                <option value="any">Match any</option>
              </SelectField>
            </div>
            {settings.metrics.map((filter, i) => (
              <div className={styles.rangeFilter} key={filter.metric}>
                <span>{MAP_METRICS[filter.metric]}</span>
                {(["min", "max"] as const).map((bound) => (
                  <input
                    key={bound}
                    aria-label={`${MAP_METRICS[filter.metric]} ${bound}`}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={bound === "min" ? "Min" : "Max"}
                    value={filter[bound] ?? ""}
                    onChange={(e) =>
                      onSettings({
                        ...settings,
                        metrics: settings.metrics.map((m, j) =>
                          j === i
                            ? {
                                ...m,
                                [bound]:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              }
                            : m,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            ))}
            {invalidRange && (
              <p role="alert" className={styles.dataError}>
                Minimum must be at or below maximum.
              </p>
            )}
            <label>
              Color scale
              <SelectField
                value={settings.scale}
                onChange={(e) =>
                  onSettings({
                    ...settings,
                    scale: e.target.value as "quantile" | "linear",
                  })
                }
              >
                <option value="quantile">Balanced color bands</option>
                <option value="linear">Equal numeric ranges</option>
              </SelectField>
            </label>
            <fieldset className={styles.palettePicker}><legend>Map colors</legend><div>{Object.entries(MAP_PALETTES).map(([key, palette]) => <button type="button" key={key} aria-label={palette.name} title={palette.name} aria-pressed={(settings.palette || "terrain") === key} onClick={() => onSettings({...settings, palette: key})}>{palette.colors.map(color => <i key={color} style={{background: color}} />)}</button>)}</div></fieldset>
          </>
        )}
        <div className={styles.applyDataBar}><Button icon="view-grid" busy={busy} intent="primary" disabled={invalidRange || !settings.metrics.length || (!country && !international && level !== "state" && !state)} onClick={() => void load()}>{loadedKey === key && result ? "Refresh data" : `Apply ${settings.metrics.length || ""} ${settings.metrics.length === 1 ? "layer" : "layers"}`}</Button>{result && <span role="status">{result.matched} / {result.rows.length} regions</span>}</div>
        {result && (
          <>
            <small>
              {result.matched} of {result.rows.length} regions match. Dimmed
              regions fall outside your filters; gray means no data.
            </small>
            {data.map((d, i) => (
              <p className={styles.source} key={i}>
                <strong className={styles.coverageTotal}>{d.rows.filter(row => row.value !== null && Number.isFinite(row.value)).length.toLocaleString()} / {d.rows.length.toLocaleString()} returned {level === "country" ? "countries" : level === "state" ? "states / provinces" : level === "county" ? "counties / districts" : level === "place" ? "cities / towns" : "tracts"} with data</strong>
                <a href={d.sourceUrl} target="_blank" rel="noreferrer">
                  {MAP_METRICS[settings.metrics[i].metric]} · {d.source}
                </a>
                <br />
                {d.geography} · {d.period} · {d.unit}
                {d.geometryNote && <small>{d.geometryNote}</small>}
              </p>
            ))}
            <label>
              <input
                type="checkbox"
                checked={onlyMatches}
                onChange={(e) => {
                  setOnlyMatches(e.target.checked);
                  setPage(0);
                }}
              />
              Only matching regions in table
            </label>
            <SelectField
              aria-label="Sort regions"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="value">Highest value</option>
              <option value="name">Name</option>
            </SelectField>
            <label className={styles.dataSearch}><UnigentamosIcon role="search" size={16} /><input type="search" aria-label="Search data regions" placeholder="Find a state, county or region" value={regionQuery} onChange={e => { setRegionQuery(e.target.value); setPage(0); }} /></label>
            {!shown.length && <p className="work-muted">No regions match this search and filter combination.</p>}
            <div className={styles.regionTable}>
              {shown.slice(page * 25, page * 25 + 25).map((r) => (
                <div key={r.id}>
                  <strong>{r.name}</strong>
                  {r.comparisons.map((c, i) => (
                    <span key={i}>
                      {c.label}:{" "}
                      {c.value === null ? "No data" : c.value.toLocaleString()}{" "}
                      {c.unit} · {c.year || "No year"}
                      {c.uncertainty != null
                        ? ` ± ${c.uncertainty.toLocaleString()}`
                        : ""}
                    </span>
                  ))}
                  <small>
                    {r.year} · {r.value === null ? "No data" : r.matches ? "Matches" : "Outside filters"}
                  </small>
                </div>
              ))}
            </div>
            <div className="work-actions">
              <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>
                {page + 1}/{Math.max(1, Math.ceil(shown.length / 25))}
              </span>
              <Button
                disabled={(page + 1) * 25 >= shown.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
export function MapDataLegend({ result }: { result: AnalysisResult }) {
  const breaks = [result.min, ...result.thresholds, result.max];
  return (
    <aside className={styles.onMapLegend} aria-label="Map data scale">
      <strong>{result.label}</strong>
      <span>
        {result.data[0].geography} · {result.unit}
      </span>
      <span>{result.data[0].period}</span>
      <div>
        {result.colors.map((color, i) => (
          <i
            key={color}
            style={{ background: color }}
            title={`${format(breaks[i])} – ${format(breaks[i + 1])}`}
          />
        ))}
      </div>
      <div className={styles.scaleNumbers}>
        {breaks.map((v, i) => (
          <span key={i}>{format(v)}</span>
        ))}
      </div>
      <small>
        {result.scale === "quantile" ? "Balanced bands" : "Equal ranges"} ·{" "}
        {result.matched} matching regions · Gray: no data
      </small>
    </aside>
  );
}
