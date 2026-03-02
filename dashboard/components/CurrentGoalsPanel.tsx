"use client";

import { useEffect, useMemo, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import {
  normalizeGoalItems,
  type EntityGoalItem
} from "../lib/entity-goals";
import {
  readEntityGoalsCache,
  writeEntityGoalsToCache
} from "../lib/entity-goals-cache";
import { ENTITY_GOALS_SYNC_KEY } from "../lib/entity-goals-sync";

type GoalTheme = "fremen" | "iceflake" | "pint";

export type HomeGoalItem = {
  slug: string;
  entity: string;
  theme: GoalTheme;
  goals: EntityGoalItem[];
};

type GoalsPayload = {
  ok: boolean;
  items?: Array<{
    slug: string;
    entity: string;
    goals: EntityGoalItem[];
  }>;
  error?: string;
};

const THEME_BY_SLUG: Record<string, GoalTheme> = {
  unigentamos: "fremen",
  pngwn: "iceflake",
  "diyesu-decor": "pint"
};

export default function CurrentGoalsPanel({ initialItems }: { initialItems: HomeGoalItem[] }) {
  const [items, setItems] = useState<HomeGoalItem[]>(
    initialItems.map((item) => ({ ...item, goals: normalizeGoalItems(item.goals) }))
  );
  const [error, setError] = useState("");

  const orderedSlugs = useMemo(() => initialItems.map((item) => item.slug), [initialItems]);

  function broadcastGoalsUpdated() {
    try {
      window.localStorage.setItem(ENTITY_GOALS_SYNC_KEY, String(Date.now()));
    } catch {
      // Best-effort broadcast only.
    }
  }

  function mergeCachedGoals(sourceItems: HomeGoalItem[]): HomeGoalItem[] {
    const cache = readEntityGoalsCache();
    if (Object.keys(cache).length === 0) {
      return sourceItems;
    }

    return sourceItems.map((item) => ({
      ...item,
      goals: cache[item.slug] ? normalizeGoalItems(cache[item.slug]) : item.goals
    }));
  }

  async function refreshGoals() {
    const res = await fetch("/api/entity-goals", { cache: "no-store" });
    const payload = (await res.json().catch(() => ({ ok: false, items: [] }))) as GoalsPayload;
    if (!res.ok || !payload.ok || !payload.items) {
      setError(payload.error || "Failed to refresh goals");
      return;
    }

    const sorted = [...payload.items].sort(
      (a, b) => orderedSlugs.indexOf(a.slug) - orderedSlugs.indexOf(b.slug)
    );

    const nextItems = sorted.map((item) => ({
      ...item,
      goals: normalizeGoalItems(item.goals),
      theme: THEME_BY_SLUG[item.slug] || "fremen"
    }));

    setItems(mergeCachedGoals(nextItems));
    setError("");
  }

  async function toggleGoalDone(slug: string, index: number) {
    const currentItem = items.find((item) => item.slug === slug);
    if (!currentItem) {
      return;
    }

    const nextGoals = currentItem.goals.map((goal, goalIndex) =>
      goalIndex === index ? { ...goal, done: !goal.done } : goal
    );

    setItems((current) =>
      current.map((item) => (item.slug === slug ? { ...item, goals: nextGoals } : item))
    );
    writeEntityGoalsToCache(slug, nextGoals);
    broadcastGoalsUpdated();

    const res = await fetch("/api/entity-goals", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ slug, goals: nextGoals })
    });
    const payload = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      goals?: EntityGoalItem[];
      error?: string;
    };

    if (!res.ok || !payload.ok || !payload.goals) {
      setError("Saved locally. Server sync pending.");
      return;
    }

    const savedGoals = normalizeGoalItems(payload.goals);
    setItems((current) =>
      current.map((item) => (item.slug === slug ? { ...item, goals: savedGoals } : item))
    );
    writeEntityGoalsToCache(slug, savedGoals);
    setError("");
    broadcastGoalsUpdated();
  }

  useEffect(() => {
    setItems((current) => mergeCachedGoals(current));

    const timer = window.setInterval(() => {
      void refreshGoals();
    }, 12000);

    const onStorage = (event: StorageEvent) => {
      if (event.key === ENTITY_GOALS_SYNC_KEY) {
        void refreshGoals();
      }
    };

    const onFocus = () => {
      void refreshGoals();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const flatGoals = useMemo(
    () =>
      items.flatMap((item) =>
        item.goals.map((goal, idx) => ({
          key: `${item.slug}-${idx}-${goal.text}`,
          goal,
          index: idx,
          slug: item.slug,
          theme: item.theme
        }))
      ),
    [items]
  );

  return (
    <section className="admin-plain-section">
      <h2>Current Goals</h2>
      {error && <p className="muted">{error}</p>}
      {flatGoals.length === 0 ? (
        <p className="muted">No goals set yet.</p>
      ) : (
        <ul className="admin-plain-list admin-goals-list">
          {flatGoals.map((item) => (
            <li
              className={`admin-goal-item admin-goal-item-${item.theme} ${item.goal.done ? "is-done" : ""}`}
              key={item.key}
            >
              <span className={`admin-goal-marker admin-goal-marker-${item.theme}`} aria-hidden />
              <span className="admin-goal-text">{item.goal.text}</span>
              <button
                type="button"
                className={`admin-goal-toggle ${item.goal.done ? "is-done" : ""}`}
                onClick={() => {
                  void toggleGoalDone(item.slug, item.index);
                }}
              >
                {item.goal.done ? "Undo" : "Done"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
