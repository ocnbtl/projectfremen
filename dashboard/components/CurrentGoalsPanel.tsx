"use client";

import { useEffect, useMemo, useState } from "react";
import { ENTITY_GOALS_SYNC_KEY } from "../lib/entity-goals-sync";

type GoalTheme = "fremen" | "iceflake" | "pint";

export type HomeGoalItem = {
  slug: string;
  entity: string;
  theme: GoalTheme;
  goals: string[];
};

type GoalsPayload = {
  ok: boolean;
  items?: Array<{
    slug: string;
    entity: string;
    goals: string[];
  }>;
  error?: string;
};

const THEME_BY_SLUG: Record<string, GoalTheme> = {
  unigentamos: "fremen",
  pngwn: "iceflake",
  "diyesu-decor": "pint"
};

export default function CurrentGoalsPanel({ initialItems }: { initialItems: HomeGoalItem[] }) {
  const [items, setItems] = useState<HomeGoalItem[]>(initialItems);
  const [error, setError] = useState("");

  const orderedSlugs = useMemo(() => initialItems.map((item) => item.slug), [initialItems]);

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

    setItems(
      sorted.map((item) => ({
        ...item,
        theme: THEME_BY_SLUG[item.slug] || "fremen"
      }))
    );
    setError("");
  }

  useEffect(() => {
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
          key: `${item.slug}-${idx}-${goal}`,
          goal,
          entity: item.entity,
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
            <li className={`admin-goal-item admin-goal-item-${item.theme}`} key={item.key}>
              <span className={`admin-goal-marker admin-goal-marker-${item.theme}`} aria-hidden />
              <span className="admin-goal-text">{item.goal}</span>
              <span className="admin-goal-entity">{item.entity}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
