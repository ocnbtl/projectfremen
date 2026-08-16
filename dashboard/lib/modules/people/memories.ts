import type { PersonalMemoryEntry } from "../../personal-records-store";

function recencyValue(memory: PersonalMemoryEntry): number {
  if (memory.occurredOn) {
    const value = Date.parse(`${memory.occurredOn}T12:00:00.000Z`);
    if (!Number.isNaN(value)) return value;
  }
  if (memory.createdAt) {
    const value = Date.parse(memory.createdAt);
    if (!Number.isNaN(value)) return value;
  }
  return Number.NEGATIVE_INFINITY;
}

export function sortPeopleMemories(memories: readonly PersonalMemoryEntry[]): PersonalMemoryEntry[] {
  return memories
    .map((memory, index) => ({ memory, index }))
    .sort((left, right) => {
      const recency = recencyValue(right.memory) - recencyValue(left.memory);
      if (recency !== 0) return recency;
      return left.index - right.index;
    })
    .map(({ memory }) => memory);
}

export function memoryCategoryLabel(value?: string): string {
  if (!value) return "Memory";
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
