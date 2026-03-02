import { normalizeGoalItems, type EntityGoalItem } from "./entity-goals";

const ENTITY_GOALS_CACHE_KEY = "entity_goals_cache_v2";

type EntityGoalsCacheState = Record<string, EntityGoalItem[]>;

export function readEntityGoalsCache(): EntityGoalsCacheState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(ENTITY_GOALS_CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const next: EntityGoalsCacheState = {};
    for (const [slug, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) {
        continue;
      }
      next[slug] = normalizeGoalItems(
        value as Array<string | EntityGoalItem | { text?: unknown; done?: unknown }>
      );
    }
    return next;
  } catch {
    return {};
  }
}

export function writeEntityGoalsCache(nextState: EntityGoalsCacheState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ENTITY_GOALS_CACHE_KEY, JSON.stringify(nextState));
  } catch {
    // Non-fatal in private mode or locked storage.
  }
}

export function readEntityGoalsFromCache(slug: string): EntityGoalItem[] | null {
  const cache = readEntityGoalsCache();
  return cache[slug] || null;
}

export function writeEntityGoalsToCache(slug: string, goals: EntityGoalItem[]): void {
  const cache = readEntityGoalsCache();
  cache[slug] = normalizeGoalItems(goals);
  writeEntityGoalsCache(cache);
}
