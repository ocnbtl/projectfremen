"use client";

import { useEffect, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";

type ExportPreviewPayload = {
  ok: boolean;
  rootDir?: string;
  itemCount?: number;
  error?: string;
};

type ExportRunPayload = {
  ok: boolean;
  mode?: "dry-run" | "write";
  rootDir?: string;
  itemCount?: number;
  items?: Array<{ kind: string; sourceId: string; targetPath: string }>;
  error?: string;
};

export default function ObsidianExportPanel() {
  const [rootDir, setRootDir] = useState("");
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [lastMode, setLastMode] = useState<"dry-run" | "write" | "">("");
  const [loading, setLoading] = useState(true);
  const [runningPreview, setRunningPreview] = useState(false);
  const [runningWrite, setRunningWrite] = useState(false);
  const [error, setError] = useState("");
  const [recentPaths, setRecentPaths] = useState<string[]>([]);

  async function loadPreview() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/exports/obsidian", { cache: "no-store" });
    const payload = (await res.json()) as ExportPreviewPayload;
    if (!res.ok || !payload.ok) {
      setError(payload.error || "Failed to load export preview");
      setLoading(false);
      return;
    }
    setRootDir(payload.rootDir || "");
    setItemCount(typeof payload.itemCount === "number" ? payload.itemCount : null);
    setLoading(false);
  }

  async function runExport(dryRun: boolean) {
    if (dryRun) {
      setRunningPreview(true);
    } else {
      setRunningWrite(true);
    }
    setError("");

    try {
      const res = await fetch("/api/exports/obsidian", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ dryRun })
      });
      const payload = (await res.json()) as ExportRunPayload;
      if (!res.ok || !payload.ok) {
        setError(payload.error || "Export failed");
        return;
      }

      setLastMode(payload.mode || "");
      setRootDir(payload.rootDir || "");
      setItemCount(typeof payload.itemCount === "number" ? payload.itemCount : null);
      setRecentPaths((payload.items || []).slice(0, 5).map((item) => item.targetPath));
    } catch {
      setError("Export failed");
    } finally {
      setRunningPreview(false);
      setRunningWrite(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, []);

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <h2>Obsidian Export</h2>
      {error && <p className="pill warn">{error}</p>}

      {loading ? (
        <p className="muted">Loading export status...</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Target directory: <code>{rootDir || "Unavailable"}</code>
          </p>
          <p className="muted">
            Planned files: {itemCount ?? 0}
            {lastMode ? ` (last run: ${lastMode})` : ""}
          </p>
          <div className="inline-form">
            <button type="button" onClick={() => void runExport(true)} disabled={runningPreview || runningWrite}>
              {runningPreview ? "Previewing..." : "Preview Export"}
            </button>
            <button type="button" onClick={() => void runExport(false)} disabled={runningPreview || runningWrite}>
              {runningWrite ? "Writing..." : "Write Export Files"}
            </button>
          </div>
          {recentPaths.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ marginBottom: 6 }}>Recent targets:</p>
              <ul>
                {recentPaths.map((item) => (
                  <li key={item}>
                    <code>{item}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

