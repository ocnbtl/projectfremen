import { readJsonFile, writeJsonFile } from "./file-store";

const FILE_NAME = "entity-goals.json";

type EntityGoalsState = {
  goalsBySlug: Record<string, string[]>;
};

const EMPTY_STATE: EntityGoalsState = {
  goalsBySlug: {}
};

function normalizeGoals(goals: string[]): string[] {
  return goals
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function readEntityGoals(slug: string, defaults: string[]): Promise<string[]> {
  const state = await readJsonFile<EntityGoalsState>(FILE_NAME, EMPTY_STATE);
  const existing = state.goalsBySlug[slug];
  if (!existing || existing.length === 0) {
    return defaults;
  }
  return normalizeGoals(existing);
}

export async function writeEntityGoals(slug: string, goals: string[]): Promise<string[]> {
  const state = await readJsonFile<EntityGoalsState>(FILE_NAME, EMPTY_STATE);
  const normalized = normalizeGoals(goals);

  const nextState: EntityGoalsState = {
    goalsBySlug: {
      ...state.goalsBySlug,
      [slug]: normalized
    }
  };

  await writeJsonFile(FILE_NAME, nextState);
  return normalized;
}
