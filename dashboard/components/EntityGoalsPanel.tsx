"use client";

import { useState } from "react";

type GoalsResponse = {
  ok: boolean;
  goals?: string[];
  error?: string;
};

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
  const [error, setError] = useState("");

  function beginEdit() {
    setDraftGoals(goals.length ? goals : ["", "", ""]);
    setEditing(true);
    setError("");
  }

  function cancelEdit() {
    setDraftGoals(goals);
    setEditing(false);
    setError("");
  }

  async function saveGoals() {
    setSaving(true);
    setError("");

    const res = await fetch("/api/entity-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, goals: draftGoals })
    });
    const payload = (await res.json()) as GoalsResponse;

    if (!res.ok || !payload.ok || !payload.goals) {
      setError(payload.error || "Failed to save goals");
      setSaving(false);
      return;
    }

    setGoals(payload.goals);
    setDraftGoals(payload.goals);
    setEditing(false);
    setSaving(false);
  }

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
            <button type="button" className="entity-goals-save-btn" onClick={saveGoals} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="pill warn">{error}</p>}

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
