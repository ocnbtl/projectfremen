import { randomUUID } from "node:crypto";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import { emptyWellnessState, WELLNESS_CONFIG, type WellnessEntry, type WellnessInput, type WellnessSection, type WellnessState } from "./types";

const key = (section: WellnessSection) => `personal-${section}.v1.json`;
function assertState(state: WellnessState) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.entries)) throw new Error("This section could not be read safely. Reload before making changes.");
  return state;
}
export async function readWellnessState(section: WellnessSection) { return assertState(await readJsonFile(key(section), emptyWellnessState())); }
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new Error(`${label} ${required ? "is required and " : ""}must be text of up to ${max} characters.`);
  return value.trim();
}
function validate(section: WellnessSection, raw: Record<string, unknown>, entries: WellnessEntry[]): WellnessInput {
  const kind = WELLNESS_CONFIG[section].kinds.find(item => item.id === raw.kind);
  if (!kind) throw new Error("Choose a valid entry type.");
  const date = text(raw.date ?? "", "Date", 10, kind.id !== "recipe");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error("Choose a valid date.");
  if (raw.status !== "planned" && raw.status !== "completed") throw new Error("Choose planned or completed.");
  if (typeof raw.archived !== "boolean") throw new Error("Invalid archive status.");
  if (!raw.fields || typeof raw.fields !== "object" || Array.isArray(raw.fields)) throw new Error("Invalid entry fields.");
  const fields: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw.fields)) {
    const field = kind.fields.find(item => item.id === id);
    if (!field) throw new Error("An entry field is not supported.");
    const normalized = text(value, field.label, field.type === "textarea" ? 8000 : 300);
    if (normalized && field.type === "number" && (!Number.isFinite(Number(normalized)) || Number(normalized) < field.min! || Number(normalized) > field.max!)) throw new Error(`${field.label} must be between ${field.min} and ${field.max}.`);
    if (normalized && field.options && !field.options.includes(normalized)) throw new Error(`Choose a valid ${field.label.toLowerCase()}.`);
    if (id === "recipeId" && normalized && !entries.some(entry => entry.id === normalized && entry.kind === "recipe")) throw new Error("Choose a saved recipe.");
    fields[id] = normalized;
  }
  return { kind: kind.id, title: text(raw.title, "Title", 180, true), date, status: section === "health" || kind.id === "recipe" ? "completed" : raw.status, notes: text(raw.notes ?? "", "Notes", 12000), fields, archived: raw.archived };
}
export async function saveWellnessEntry(section: WellnessSection, raw: unknown, id?: string, expectedUpdatedAt?: string): Promise<WellnessEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Entry details are required.");
  return mutateJsonFile(key(section), emptyWellnessState(), current => {
    const state = assertState(current);
    const previous = id ? state.entries.find(entry => entry.id === id) : undefined;
    if (id && !previous) throw new Error("Entry not found.");
    if (previous && (!expectedUpdatedAt || previous.updatedAt !== expectedUpdatedAt)) throw new Error("This record changed elsewhere. Reload before saving; your draft is still here.");
    const input = validate(section, { ...(previous || {}), ...(raw as object) }, state.entries);
    if (previous && input.kind !== previous.kind) throw new Error("An entry type cannot be changed. Create a separate entry instead.");
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(previous?.updatedAt || "") + 1 || 0)).toISOString();
    const item: WellnessEntry = { ...input, id: previous?.id || randomUUID(), createdAt: previous?.createdAt || updatedAt, updatedAt };
    return { value: { ...state, entries: previous ? state.entries.map(entry => entry.id === id ? item : entry) : [...state.entries, item] }, result: item };
  });
}
