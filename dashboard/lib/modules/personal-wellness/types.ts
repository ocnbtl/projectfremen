export const WELLNESS_SECTIONS = ["health", "meals", "fitness"] as const;
export type WellnessSection = typeof WELLNESS_SECTIONS[number];
export type WellnessEntry = {
  id: string; kind: string; title: string; date: string; status: "planned" | "completed";
  notes: string; fields: Record<string, string>; archived: boolean; createdAt: string; updatedAt: string;
};
export type WellnessState = { schemaVersion: 1; entries: WellnessEntry[] };
export type WellnessInput = Pick<WellnessEntry, "kind" | "title" | "date" | "status" | "notes" | "fields" | "archived">;
export type WellnessField = { id: string; label: string; type: "text" | "number" | "textarea" | "select"; min?: number; max?: number; options?: string[]; suffix?: string };
export const WELLNESS_CONFIG: Record<WellnessSection, { title: string; icon: string; kinds: { id: string; label: string; plural: string; fields: WellnessField[] }[] }> = {
  health: { title: "Health", icon: "health", kinds: [
    { id: "check-in", label: "Check-in", plural: "Check-ins", fields: [{ id: "sleep", label: "Sleep · hours", type: "number", min: 0, max: 24, suffix: "h sleep" }, { id: "energy", label: "Energy · 1 to 5", type: "select", options: ["1", "2", "3", "4", "5"], suffix: "/5 energy" }] },
    { id: "care-note", label: "Care note", plural: "Care notes", fields: [{ id: "provider", label: "Provider or clinic", type: "text" }, { id: "nextStep", label: "Next step", type: "text" }] }
  ] },
  meals: { title: "Meals", icon: "meals", kinds: [
    { id: "meal", label: "Meal", plural: "Meal plan", fields: [{ id: "mealTime", label: "Meal", type: "select", options: ["Breakfast", "Lunch", "Dinner", "Snack"] }, { id: "recipeId", label: "Recipe", type: "text" }] },
    { id: "recipe", label: "Recipe", plural: "Recipes", fields: [{ id: "servings", label: "Servings", type: "number", min: 1, max: 100, suffix: "servings" }, { id: "minutes", label: "Prep & cook · minutes", type: "number", min: 1, max: 1440, suffix: "min" }, { id: "ingredients", label: "Ingredients", type: "textarea" }] }
  ] },
  fitness: { title: "Fitness", icon: "fitness", kinds: [
    { id: "workout", label: "Workout", plural: "Workouts", fields: [{ id: "activity", label: "Activity", type: "select", options: ["Strength", "Walking", "Running", "Cycling", "Swimming", "Mobility", "Sport", "Other"] }, { id: "minutes", label: "Duration · minutes", type: "number", min: 1, max: 1440, suffix: "min" }, { id: "distance", label: "Distance · km", type: "number", min: 0, max: 2000, suffix: "km" }, { id: "exercises", label: "Exercises & sets", type: "textarea" }] }
  ] }
};
export const isWellnessSection = (value: unknown): value is WellnessSection => WELLNESS_SECTIONS.includes(value as WellnessSection);
export const emptyWellnessState = (): WellnessState => ({ schemaVersion: 1, entries: [] });
