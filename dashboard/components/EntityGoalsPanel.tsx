"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import {
  areGoalListsEqual,
  normalizeGoalItems,
  type EntityGoalItem
} from "../lib/entity-goals";
import { readEntityGoalsFromCache, writeEntityGoalsToCache } from "../lib/entity-goals-cache";
import { ENTITY_GOALS_SYNC_KEY } from "../lib/entity-goals-sync";

type GoalsResponse = {
  ok: boolean;
  goals?: EntityGoalItem[];
  error?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function toDraftGoals(goals: EntityGoalItem[]): string[] {
  if (goals.length === 0) {
    return ["", "", ""];
  }
  return goals.map((item) => item.text);
}

function serializeGoalItems(goals: EntityGoalItem[]): string {
  return JSON.stringify(normalizeGoalItems(goals));
}

function serializeDraftGoals(goals: string[]): string {
  return JSON.stringify(normalizeGoalItems(goals).map((item) => item.text));
}

function draftToGoalItems(goals: string[]): EntityGoalItem[] {
  return normalizeGoalItems(goals).map((item) => ({ text: item.text, done: false }));
}

export default function EntityGoalsPanel({
  slug,
  initialGoals
}: {
  slug: string;
  initialGoals: EntityGoalItem[];
}) {
  const normalizedInitialGoals = useMemo(() => normalizeGoalItems(initialGoals), [initialGoals]);
  const [goals, setGoals] = useState<EntityGoalItem[]>(normalizedInitialGoals);
  const [draftGoals, setDraftGoals] = useState<string[]>(toDraftGoals(normalizedInitialGoals));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const lastSavedGoalsRef = useRef<string>(serializeGoalItems(normalizedInitialGoals));
  const lastSavedDraftGoalsRef = useRef<string>(serializeDraftGoals(toDraftGoals(normalizedInitialGoals)));

  const draftSerialized = useMemo(() => serializeDraftGoals(draftGoals), [draftGoals]);

  function broadcastGoalsUpdated() {
    try {
      window.localStorage.setItem(ENTITY_GOALS_SYNC_KEY, String(Date.now()));
    } catch {
      // No-op. Sync broadcast is best effort.
    }
  }

  useEffect(() => {
    const cached = readEntityGoalsFromCache(slug);
    if (!cached || areGoalListsEqual(cached, normalizedInitialGoals)) {
      return;
    }

    setGoals(cached);
    setDraftGoals(toDraftGoals(cached));
    lastSavedGoalsRef.current = serializeGoalItems(cached);
    lastSavedDraftGoalsRef.current = serializeDraftGoals(toDraftGoals(cached));
  }, [normalizedInitialGoals, slug]);

  function beginEdit() {
    const nextDraft = toDraftGoals(goals);
    setDraftGoals(nextDraft);
    lastSavedDraftGoalsRef.current = serializeDraftGoals(nextDraft);
    setEditing(true);
    setError("");
    setSaveState("idle");
  }

  function cancelEdit() {
    setDraftGoals(toDraftGoals(goals));
    setEditing(false);
    setError("");
    setSaveState("idle");
  }

  async function persistGoalItems(
    nextGoals: EntityGoalItem[],
    options?: { closeEditor?: boolean; force?: boolean }
  ) {
    const closeEditor = options?.closeEditor ?? false;
    const force = options?.force ?? false;
    const normalizedNext = normalizeGoalItems(nextGoals);
    const nextSerialized = serializeGoalItems(normalizedNext);

    if (!force && nextSerialized === lastSavedGoalsRef.current) {
      if (closeEditor) {
        setDraftGoals(toDraftGoals(goals));
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
      body: JSON.stringify({ slug, goals: normalizedNext })
    });
    const payload = (await res.json().catch(() => ({ ok: false, error: "Failed to save goals" }))) as GoalsResponse;

    if (!res.ok || !payload.ok || !payload.goals) {
      setGoals(normalizedNext);
      writeEntityGoalsToCache(slug, normalizedNext);
      lastSavedGoalsRef.current = nextSerialized;
      if (closeEditor) {
        setDraftGoals(toDraftGoals(normalizedNext));
        setEditing(false);
      }
      setSaving(false);
      setSaveState("error");
      setError("Saved locally. Server sync pending.");
      broadcastGoalsUpdated();
      return true;
    }

    const savedGoals = normalizeGoalItems(payload.goals);
    setGoals(savedGoals);
    lastSavedGoalsRef.current = serializeGoalItems(savedGoals);
    writeEntityGoalsToCache(slug, savedGoals);
    if (closeEditor) {
      setDraftGoals(toDraftGoals(savedGoals));
      setEditing(false);
    }
    setSaving(false);
    setSaveState("saved");
    setError("");
    broadcastGoalsUpdated();
    return true;
  }

  async function persistDraftGoals(nextDraft: string[], options?: { closeEditor?: boolean; force?: boolean }) {
    const closeEditor = options?.closeEditor ?? false;
    const force = options?.force ?? false;
    const nextDraftSerialized = serializeDraftGoals(nextDraft);

    if (!force && nextDraftSerialized === lastSavedDraftGoalsRef.current) {
      if (closeEditor) {
        setEditing(false);
      }
      setSaveState("saved");
      return true;
    }

    const ok = await persistGoalItems(draftToGoalItems(nextDraft), { closeEditor, force: true });
    if (ok) {
      lastSavedDraftGoalsRef.current = nextDraftSerialized;
    }
    return ok;
  }

  async function finishEdit() {
    await persistDraftGoals(draftGoals, { closeEditor: true });
  }

  async function toggleGoalDone(index: number) {
    if (editing || saving) {
      return;
    }

    const nextGoals = goals.map((item, itemIndex) =>
      itemIndex === index ? { ...item, done: !item.done } : item
    );
    await persistGoalItems(nextGoals, { force: true });
  }

  useEffect(() => {
    if (!editing) {
      return;
    }
    if (draftSerialized === lastSavedDraftGoalsRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistDraftGoals(draftGoals);
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
          <ul className="entity-goals-list">
            {goals.map((goal, index) => (
              <li className={`entity-goal-item ${goal.done ? "is-done" : ""}`} key={`${slug}-${index}-${goal.text}`}>
                <span className="entity-goal-item-text">{goal.text}</span>
                <button
                  type="button"
                  className={`entity-goal-toggle-btn ${goal.done ? "is-done" : ""}`}
                  onClick={() => {
                    void toggleGoalDone(index);
                  }}
                  disabled={saving}
                >
                  {goal.done ? "Done" : "Mark done"}
                </button>
              </li>
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
                  void persistDraftGoals(draftGoals);
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
