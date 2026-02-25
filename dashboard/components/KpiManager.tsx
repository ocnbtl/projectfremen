"use client";

import { useEffect, useMemo, useState } from "react";
import type { EntityName, KpiEntry } from "../lib/types";

type KpiResponse = {
  ok: boolean;
  items: KpiEntry[];
  error?: string;
};

const ENTITIES: EntityName[] = ["Unigentamos", "pngwn", "Diyesu Decor"];
const PRIORITIES = ["P1", "P2", "P3"] as const;

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

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        `${a.entity}:${a.name}`.localeCompare(`${b.entity}:${b.name}`)
      ),
    [items]
  );

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <h2>KPI Tracker</h2>
      <p className="muted">Persisted values (saved in local app data for MVP).</p>
      {error && <p className="pill warn">{error}</p>}

      <form onSubmit={onSubmit} className="inline-form">
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
            placeholder="Example: Waitlist Signups (Weekly)"
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
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Name</th>
              <th>Value</th>
              <th>Link</th>
              <th>Priority</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.id}>
                <td>{item.entity}</td>
                <td>{item.name}</td>
                <td>{item.value}</td>
                <td>
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    ""
                  )}
                </td>
                <td>{item.priority}</td>
                <td>{new Date(item.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
