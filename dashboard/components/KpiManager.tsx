"use client";

import { useEffect, useMemo, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import type { EntityName, KpiEntry } from "../lib/types";

type KpiResponse = {
  ok: boolean;
  items: KpiEntry[];
  error?: string;
};

type TrendDirection = "up" | "down" | "flat";

type TrendMeta = {
  direction: TrendDirection;
  percent: string;
};

type ProgressMeta = {
  current: number;
  target: number;
  percent: number;
};

const ENTITIES: EntityName[] = ["Unigentamos", "pngwn", "Diyesu Decor"];
const DEFAULT_STALE_DAYS = 14;
const STALE_DAYS_STORAGE_KEY = "kpi-stale-days";

const BRAND_CLASS_BY_ENTITY: Record<EntityName, "fremen" | "iceflake" | "pint"> = {
  Unigentamos: "fremen",
  pngwn: "iceflake",
  "Diyesu Decor": "pint"
};

const KPI_ORDER_BY_ENTITY: Record<EntityName, string[]> = {
  Unigentamos: ["Documentation Coverage", "Open Blockers"],
  pngwn: [
    "Waitlist Signups (Total)",
    "Waitlist Signups (Past 7 Days)",
    "Total Website Impressions",
    "Errors Reported in Sentry",
    "Unread Emails (Zoho)"
  ],
  "Diyesu Decor": [
    "Pins Published This Week",
    "Blogs Published This Week",
    "Outbound Clicks from Pinterest",
    "Total Website Impressions",
    "Total Email Newsletter Signups",
    "Email Newsletter Signups (Past 7 Days)",
    "Unread Emails (Zoho)"
  ]
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function getKpiOrder(entity: EntityName, name: string): number {
  const order = KPI_ORDER_BY_ENTITY[entity] ?? [];
  const idx = order.findIndex((label) => normalizeLabel(label) === normalizeLabel(name));
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function extractTrend(value: string): TrendMeta | null {
  const arrowMatch = value.match(/([↑↓↔])\s*([0-9]+(?:\.[0-9]+)?%)/);
  if (arrowMatch) {
    const symbol = arrowMatch[1];
    const percent = arrowMatch[2];

    if (symbol === "↑") {
      return { direction: "up", percent };
    }
    if (symbol === "↓") {
      return { direction: "down", percent };
    }
    return { direction: "flat", percent };
  }

  const signMatch = value.match(/([+-])\s*([0-9]+(?:\.[0-9]+)?%)/);
  if (signMatch) {
    return {
      direction: signMatch[1] === "+" ? "up" : "down",
      percent: signMatch[2]
    };
  }

  return null;
}

function stripTrendFromValue(value: string): string {
  return value
    .replace(/\s*[\(\[]?\s*[↑↓↔]\s*[0-9]+(?:\.[0-9]+)?%\s*[\)\]]?\s*$/, "")
    .replace(/\s*[\(\[]?\s*[+-]\s*[0-9]+(?:\.[0-9]+)?%\s*[\)\]]?\s*$/, "")
    .trim();
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

function isStale(updatedAt: string, staleDays: number): boolean {
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) {
    return false;
  }
  const maxAgeMs = staleDays * 24 * 60 * 60 * 1000;
  return Date.now() - parsed > maxAgeMs;
}

export default function KpiManager() {
  const [items, setItems] = useState<KpiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [entity, setEntity] = useState<EntityName>("Unigentamos");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [link, setLink] = useState("");
  const [staleDays, setStaleDays] = useState(DEFAULT_STALE_DAYS);
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

    if (!name.trim()) {
      setError("Select a KPI name before saving.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/kpis", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ entity, name, value, priority: "P1", link })
    });
    const payload = (await res.json()) as KpiResponse;
    if (!res.ok || !payload.ok) {
      setError(payload.error || "Failed to save KPI");
      setSaving(false);
      return;
    }

    setItems(payload.items);
    setValue("");
    setLink("");
    setSaving(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(STALE_DAYS_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 365) {
      setStaleDays(parsed);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STALE_DAYS_STORAGE_KEY, String(staleDays));
  }, [staleDays]);

  const kpiNameOptions = useMemo(() => {
    const baseNames = KPI_ORDER_BY_ENTITY[entity] ?? [];
    const existingNames = items
      .filter((item) => item.entity === entity)
      .map((item) => item.name);

    const merged: string[] = [...baseNames];
    for (const existingName of existingNames) {
      if (!merged.some((candidate) => normalizeLabel(candidate) === normalizeLabel(existingName))) {
        merged.push(existingName);
      }
    }
    return merged;
  }, [entity, items]);

  useEffect(() => {
    if (kpiNameOptions.length === 0) {
      setName("");
      return;
    }

    const validCurrent = kpiNameOptions.some(
      (optionName) => normalizeLabel(optionName) === normalizeLabel(name)
    );
    if (!validCurrent) {
      setName(kpiNameOptions[0]);
    }
  }, [kpiNameOptions, name]);

  const groupedItems = useMemo(
    () =>
      ENTITIES.map((entityName) => {
        const entityItems = items
          .filter((item) => item.entity === entityName)
          .sort((a, b) => {
            const aOrder = getKpiOrder(entityName, a.name);
            const bOrder = getKpiOrder(entityName, b.name);
            if (aOrder !== bOrder) {
              return aOrder - bOrder;
            }
            return a.name.localeCompare(b.name);
          });

        return {
          entity: entityName,
          brandClass: BRAND_CLASS_BY_ENTITY[entityName],
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

      <form onSubmit={onSubmit} className="inline-form kpi-form" style={{ marginBottom: 12 }}>
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
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          >
            {kpiNameOptions.map((kpiName) => (
              <option key={kpiName} value={kpiName}>
                {kpiName}
              </option>
            ))}
          </select>
        </label>
        <label className="value-field">
          Value
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="38 (+12%)"
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
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save KPI"}
        </button>
        <label className="stale-inline-field">
          Stale Days
          <input
            type="number"
            min={1}
            max={365}
            value={staleDays}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) {
                return;
              }
              setStaleDays(Math.max(1, Math.min(365, Math.round(next))));
            }}
          />
        </label>
      </form>

      {loading ? (
        <p className="muted">Loading KPI values...</p>
      ) : (
        <div className="kpi-groups">
          {groupedItems.map((group) => (
            <article className={`kpi-group kpi-group-${group.brandClass}`} key={group.entity}>
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
                    const displayValue = stripTrendFromValue(item.value);
                    const progress = extractProgress(displayValue);
                    const stale = isStale(item.updatedAt, staleDays);

                    return (
                      <article className={`kpi-value-card ${stale ? "is-stale" : ""}`} key={item.id}>
                        {stale && (
                          <span
                            className="stale-dot"
                            title={`Stale KPI: not updated in the last ${staleDays} days`}
                            aria-label="Stale KPI"
                          />
                        )}
                        <p className="kpi-name">{item.name}</p>
                        <div className="kpi-value-row">
                          <p className="kpi-value">{displayValue || item.value}</p>
                          {trend && (
                            <span className={`trend trend-${trend.direction}`}>
                              {trend.direction === "up" ? "+" : trend.direction === "down" ? "-" : ""}
                              {trend.percent}
                            </span>
                          )}
                        </div>
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
