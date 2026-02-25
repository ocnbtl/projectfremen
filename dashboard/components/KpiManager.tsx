"use client";

import { useEffect, useMemo, useState } from "react";
import type { EntityName, KpiEntry } from "../lib/types";

type KpiResponse = {
  ok: boolean;
  items: KpiEntry[];
  error?: string;
};

type TrendDirection = "up" | "down" | "flat";

type TrendMeta = {
  direction: TrendDirection;
  symbol: string;
  percent: string;
};

type ProgressMeta = {
  current: number;
  target: number;
  percent: number;
};

const ENTITIES: EntityName[] = ["Unigentamos", "pngwn", "Diyesu Decor"];
const PRIORITIES = ["P1", "P2", "P3"] as const;

function extractTrend(value: string): TrendMeta | null {
  const match = value.match(/[\(\[]?\s*([↑↓↔])\s*([0-9]+(?:\.[0-9]+)?%)\s*[\)\]]?/);
  if (!match) {
    return null;
  }

  const symbol = match[1];
  const percent = match[2];

  if (symbol === "↑") {
    return { direction: "up", symbol, percent };
  }
  if (symbol === "↓") {
    return { direction: "down", symbol, percent };
  }
  return { direction: "flat", symbol, percent };
}

function extractProgress(value: string): ProgressMeta | null {
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const current = Number(match[1]);
  const target = Number(match[2]);

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return null;
  }

  const percent = Math.min(100, Math.max(0, (current / target) * 100));
  return { current, target, percent };
}

export default function KpiManager() {
  const [items, setItems] = useState<KpiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [entity, setEntity] = useState<EntityName>("Unigentamos");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [link, setLink] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("P1");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/kpis", { cache: "no-store" });
    const payload = (await res.json()) as KpiResponse;
    if (!res.ok || !payload.ok) {
      setError(payload.error || "Failed to load KPIs");
      setLoading(false);
      return;
    }
    setItems(payload.items);
    setLoading(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, name, value, priority, link })
    });
    const payload = (await res.json()) as KpiResponse;
    if (!res.ok || !payload.ok) {
      setError(payload.error || "Failed to save KPI");
      setSaving(false);
      return;
    }

    setItems(payload.items);
    setName("");
    setValue("");
    setLink("");
    setSaving(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const groupedItems = useMemo(
    () =>
      ENTITIES.map((entityName) => {
        const entityItems = items
          .filter((item) => item.entity === entityName)
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          entity: entityName,
          items: entityItems
        };
      }),
    [items]
  );

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <h2>KPI Tracker</h2>
      <p className="muted">Grouped by brand for quick weekly review.</p>
      {error && <p className="pill warn">{error}</p>}

      <form onSubmit={onSubmit} className="inline-form" style={{ marginBottom: 12 }}>
        <label>
          Entity
          <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)}>
            {ENTITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          KPI Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Example: Waitlist Signups (Past 7 Days)"
            required
          />
        </label>
        <label>
          Value
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Example: 38 (↑ 12%)"
            required
          />
        </label>
        <label>
          Link (Optional)
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://sentry.io/..."
          />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as "P1" | "P2" | "P3")}>
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save KPI"}
        </button>
      </form>

      {loading ? (
        <p className="muted">Loading KPI values...</p>
      ) : (
        <div className="kpi-groups">
          {groupedItems.map((group) => (
            <article className="kpi-group" key={group.entity}>
              <div className="kpi-group-header">
                <h3>{group.entity}</h3>
                <span className="pill">{group.items.length} KPIs</span>
              </div>

              {group.items.length === 0 ? (
                <p className="muted">No KPIs yet.</p>
              ) : (
                <div className="kpi-card-grid">
                  {group.items.map((item) => {
                    const trend = extractTrend(item.value);
                    const progress = extractProgress(item.value);

                    return (
                      <article className="kpi-value-card" key={item.id}>
                        <p className="kpi-name">{item.name}</p>
                        <p className="kpi-value">{item.value}</p>
                        {progress && (
                          <div className="kpi-progress-wrap" aria-label={`${progress.current} of ${progress.target}`}>
                            <div className="kpi-progress-track">
                              <div
                                className="kpi-progress-fill"
                                style={{ width: `${progress.percent.toFixed(2)}%` }}
                              />
                            </div>
                            <p className="kpi-progress-label">
                              {progress.current} / {progress.target} ({Math.round(progress.percent)}%)
                            </p>
                          </div>
                        )}

                        <div className="kpi-meta-row">
                          <span className="pill p1">{item.priority}</span>
                          {trend && (
                            <span className={`trend trend-${trend.direction}`}>
                              {trend.symbol} {trend.percent}
                            </span>
                          )}
                          {item.link && (
                            <a href={item.link} target="_blank" rel="noreferrer" className="kpi-link">
                              Open link
                            </a>
                          )}
                        </div>

                        <p className="kpi-updated muted">
                          Updated {new Date(item.updatedAt).toLocaleString()}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
