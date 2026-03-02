export type EntityGoalItem = {
  text: string;
  done: boolean;
};

function normalizeGoalText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeGoalItems(
  input: Array<string | EntityGoalItem | { text?: unknown; done?: unknown }>
): EntityGoalItem[] {
  return input
    .map((item) => {
      if (typeof item === "string") {
        return { text: normalizeGoalText(item), done: false };
      }

      return {
        text: normalizeGoalText(item?.text),
        done: Boolean(item?.done)
      };
    })
    .filter((item) => item.text.length > 0)
    .slice(0, 6);
}

export function areGoalListsEqual(a: EntityGoalItem[], b: EntityGoalItem[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i].text !== b[i].text || a[i].done !== b[i].done) {
      return false;
    }
  }

  return true;
}
