import { readJsonFile, writeJsonFile } from "./file-store";
import { normalizeGoalItems, type EntityGoalItem } from "./entity-goals";

const FILE_NAME = "entity-goals.json";

type EntityGoalsState = {
  goalsBySlug: Record<
    string,
    Array<string | EntityGoalItem | { text?: unknown; done?: unknown }>
  >;
};

const EMPTY_STATE: EntityGoalsState = {
  goalsBySlug: {}
};

export async function readEntityGoals(
  slug: string,
  defaults: string[]
): Promise<EntityGoalItem[]> {
  const state = await readJsonFile<EntityGoalsState>(FILE_NAME, EMPTY_STATE);
  const existing = state.goalsBySlug[slug];
  if (!existing || existing.length === 0) {
    return normalizeGoalItems(defaults);
  }
  return normalizeGoalItems(existing);
}

export async function writeEntityGoals(
  slug: string,
  goals: Array<string | EntityGoalItem | { text?: unknown; done?: unknown }>
): Promise<EntityGoalItem[]> {
  const state = await readJsonFile<EntityGoalsState>(FILE_NAME, EMPTY_STATE);
  const normalized = normalizeGoalItems(goals);
  const prior = normalizeGoalItems(state.goalsBySlug[slug] || []);
  const used = new Set<number>();
  for (const goal of normalized) {
    const index = prior.findIndex((entry, index) => !used.has(index) && entry.text === goal.text);
    if (index < 0) continue;
    used.add(index);
    if (!goal.taskIdentity && prior[index].taskIdentity) goal.taskIdentity = prior[index].taskIdentity;
  }

  const nextState: EntityGoalsState = {
    goalsBySlug: {
      ...state.goalsBySlug,
      [slug]: normalized
    }
  };

  await writeJsonFile(FILE_NAME, nextState);
  return normalized;
}
