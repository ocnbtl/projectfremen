"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import { ENTITY_GOALS_SYNC_KEY } from "../lib/entity-goals-sync";

type GoalsResponse = {
  ok: boolean;
  goals?: string[];
  error?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function normalizeGoals(goals: string[]): string[] {
  return goals
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function serializeGoals(goals: string[]): string {
  return JSON.stringify(normalizeGoals(goals));
}

export default function EntityGoalsPanel({
  slug,
  initialGoals
}: {
  slug: string;
  initialGoals: string[];
}) {
  const [goals, setGoals] = useState<string[]>(initialGoals);
  const [draftGoals, setDraftGoals] = useState<string[]>(initialGoals);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const lastSavedGoalsRef = useRef<string>(serializeGoals(initialGoals));

  const draftSerialized = useMemo(() => serializeGoals(draftGoals), [draftGoals]);

  function broadcastGoalsUpdated() {
    try {
      window.localStorage.setItem(ENTITY_GOALS_SYNC_KEY, String(Date.now()));
    } catch {
      // No-op. Sync broadcast is best effort.
    }
  }

  function beginEdit() {
    setDraftGoals(goals.length ? goals : ["", "", ""]);
    setEditing(true);
    setError("");
    setSaveState("idle");
  }

  function cancelEdit() {
    setDraftGoals(goals);
    setEditing(false);
    setError("");
    setSaveState("idle");
  }

  async function persistGoals(nextGoals: string[], options?: { closeEditor?: boolean; force?: boolean }) {
    const closeEditor = options?.closeEditor ?? false;
    const force = options?.force ?? false;
    const nextSerialized = serializeGoals(nextGoals);

    if (!force && nextSerialized === lastSavedGoalsRef.current) {
      if (closeEditor) {
        setDraftGoals(goals.length ? goals : ["", "", ""]);
        setEditing(false);
      }
      setSaveState("saved");
      return true;
    }

    setSaving(true);
    setSaveState("saving");
    setError("");

    const res = await fetch("/api/entity-goals", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ slug, goals: nextGoals })
    });
    const payload = (await res.json()) as GoalsResponse;

    if (!res.ok || !payload.ok || !payload.goals) {
      setError(payload.error || "Failed to save goals");
      setSaving(false);
      setSaveState("error");
      return false;
    }

    setGoals(payload.goals);
    lastSavedGoalsRef.current = serializeGoals(payload.goals);
    if (closeEditor) {
      setDraftGoals(payload.goals.length ? payload.goals : ["", "", ""]);
      setEditing(false);
    }
    setSaving(false);
    setSaveState("saved");
    broadcastGoalsUpdated();
    return true;
  }

  async function finishEdit() {
    await persistGoals(draftGoals, { closeEditor: true, force: true });
  }

  useEffect(() => {
    if (!editing) {
      return;
    }
    if (draftSerialized === lastSavedGoalsRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistGoals(draftGoals);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [draftSerialized, editing, draftGoals]);

  return (
    <article className="card">
      <div className="entity-goals-head">
        <h2>Current Focus Goals</h2>
        {!editing ? (
          <button type="button" className="entity-goals-edit-btn" onClick={beginEdit}>
            Edit goals
          </button>
        ) : (
          <div className="entity-goals-actions">
            <button type="button" className="entity-goals-edit-btn" onClick={cancelEdit}>
              Cancel
            </button>
            <button type="button" className="entity-goals-save-btn" onClick={finishEdit} disabled={saving}>
              {saving ? "Saving..." : "Done"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="pill warn">{error}</p>}
      {editing && !error && (
        <p className="muted" style={{ marginTop: 0 }}>
          {saveState === "saving"
            ? "Autosaving..."
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Autosave failed"
                : "Autosave on"}
        </p>
      )}

      {!editing ? (
        goals.length === 0 ? (
          <p className="muted">No goals set yet.</p>
        ) : (
          <ul>
            {goals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        )
      ) : (
        <div className="entity-goals-form">
          {draftGoals.map((goal, index) => (
            <label key={`${slug}-goal-${index}`}>
              Goal {index + 1}
              <input
                type="text"
                value={goal}
                placeholder="Write a clear outcome"
                onChange={(event) => {
                  const next = [...draftGoals];
                  next[index] = event.target.value;
                  setDraftGoals(next);
                }}
                onBlur={() => {
                  void persistGoals(draftGoals);
                }}
              />
            </label>
          ))}

          <div className="entity-goals-inline-actions">
            <button
              type="button"
              className="entity-goals-add-btn"
              onClick={() => setDraftGoals((current) => [...current, ""])}
              disabled={draftGoals.length >= 6}
            >
              + Add Goal
            </button>
            <button
              type="button"
              className="entity-goals-remove-btn"
              onClick={() => setDraftGoals((current) => current.slice(0, -1))}
              disabled={draftGoals.length === 0}
            >
              − Remove Goal
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
