"use client";
import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { WellnessEntry, WellnessInput, WellnessSection } from "./types";
export const WELLNESS_CHANGE_KEY = "unigentamos-wellness-change";
export function announceWellnessChange() {
  window.dispatchEvent(new Event(WELLNESS_CHANGE_KEY));
  try { localStorage.setItem(WELLNESS_CHANGE_KEY, String(Date.now())); } catch { /* Focus refresh works when storage is unavailable. */ }
}
export async function updateWellnessEntry(section: WellnessSection, id: string, updatedAt: string, input: Partial<WellnessInput>, occurrence?: { date: string; completed?: boolean; skipped?: boolean; start?: string; end?: string }): Promise<WellnessEntry> {
  const response = await fetch("/api/personal/wellness", { method: "PATCH", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ section, id, expectedUpdatedAt: updatedAt, input, occurrence }) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "This plan could not be updated.");
  announceWellnessChange();
  return result.item;
}
