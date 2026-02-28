"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCsrfHeaders } from "../lib/client-csrf";
import type { DocsIndexItem } from "../lib/types";

type DocsPayload = {
  ok: boolean;
  lastSynced: string | null;
  items: DocsIndexItem[];
  error?: string;
};

type SyncPayload = {
  ok: boolean;
  lastSynced?: string | null;
  count?: number;
  error?: string;
};

export default function DocsIndexPanel() {
  const [items, setItems] = useState<DocsIndexItem[]>([]);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [repoFilter, setRepoFilter] = useState("");

  async function loadDocs() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/docs", { cache: "no-store" });
    const payload = (await res.json()) as DocsPayload;
    if (!res.ok || !payload.ok) {
      setError(payload.error || "Failed to load docs index");
      setLoading(false);
      return;
    }
    setItems(payload.items);
    setLastSynced(payload.lastSynced);
    setLoading(false);
  }

  async function syncDocs() {
    setSyncing(true);
    setError("");
    const res = await fetch("/api/docs/sync", { method: "POST", headers: buildCsrfHeaders() });
    const payload = (await res.json()) as SyncPayload;
    if (!res.ok || !payload.ok) {
      setError(payload.error || "Docs sync failed");
      setSyncing(false);
      return;
    }
    await loadDocs();
    setSyncing(false);
  }

  useEffect(() => {
    void loadDocs();
  }, []);

  const repoOptions = useMemo(
    () => [...new Set(items.map((item) => item.repo))].sort(),
    [items]
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (repoFilter && item.repo !== repoFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q) ||
        item.projects.join(" ").toLowerCase().includes(q) ||
        item.subjects.join(" ").toLowerCase().includes(q)
      );
    });
  }, [items, query, repoFilter]);

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="topbar" style={{ marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>GitHub Docs Index</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Last sync: {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}
          </p>
        </div>
        <button type="button" onClick={syncDocs} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync From GitHub"}
        </button>
      </div>

      {error && <p className="pill warn">{error}</p>}

      <div className="inline-form">
        <label>
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="title, path, projects, subjects"
          />
        </label>
        <label>
          Repo
          <select value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
            <option value="">All repos</option>
            {repoOptions.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading docs...</p>
      ) : (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Repo</th>
              <th>Title</th>
              <th>Class</th>
              <th>Status</th>
              <th>Projects</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 250).map((item) => (
              <tr key={item.id}>
                <td>{item.repo}</td>
                <td>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.title || item.path}
                  </a>
                </td>
                <td>{item.class}</td>
                <td>{item.status}</td>
                <td>{item.projects.join(", ")}</td>
                <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
