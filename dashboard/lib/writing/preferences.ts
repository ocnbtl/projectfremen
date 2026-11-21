"use client";

import { useSyncExternalStore } from "react";

export type WritingSkill = {
  id: string;
  name: string;
  description: string;
  behavior: "collection" | "copy" | "snippet";
  snippet: string;
};

export type WritingPreferences = {
  objectTrigger: string;
  skillTrigger: string;
  objectSuggestions: boolean;
  skillSuggestions: boolean;
  mediaEmbeds: boolean;
  skills: WritingSkill[];
};

// The admin session has no individual account identifier. Keep definitions on this browser profile.
const storageKey = "unigentamos.writing.preferences.v1";
const defaults: WritingPreferences = {
  objectTrigger: "@@",
  skillTrigger: "##",
  objectSuggestions: true,
  skillSuggestions: true,
  mediaEmbeds: false,
  skills: [
    { id: "prompt", name: "Prompt", description: "Collect prompt text alongside the places you used it.", behavior: "collection", snippet: "" },
    { id: "copy-prompt", name: "Copy prompt", description: "Keep a prompt in your writing and copy it with one click.", behavior: "copy", snippet: "" }
  ]
};

function validate(value: WritingPreferences): WritingPreferences {
  for (const trigger of [value.objectTrigger, value.skillTrigger]) {
    if (typeof trigger !== "string" || !/^[!-~]{1,4}$/.test(trigger) || /[A-Za-z0-9]/.test(trigger)) {
      throw new Error("Choose one to four punctuation marks for each shortcut.");
    }
  }
  if (value.objectTrigger.startsWith(value.skillTrigger) || value.skillTrigger.startsWith(value.objectTrigger)) {
    throw new Error("Choose distinct shortcuts. One shortcut cannot start with the other.");
  }
  if ([value.objectSuggestions, value.skillSuggestions, value.mediaEmbeds].some(flag => typeof flag !== "boolean") || !Array.isArray(value.skills)) {
    throw new Error("These writing preferences could not be read.");
  }
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const skill of value.skills) {
    if (!skill || typeof skill.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(skill.id) || ids.has(skill.id)) throw new Error("Invalid skill identifier.");
    if (typeof skill.name !== "string" || !skill.name.trim() || skill.name.length > 80) throw new Error("Give the skill a name of up to 80 characters.");
    const name = skill.name.trim().toLowerCase();
    if (names.has(name)) throw new Error("Choose a different name. A skill with this name already exists.");
    if (typeof skill.description !== "string" || !skill.description.trim() || skill.description.length > 1000) throw new Error("Describe the skill in up to 1,000 characters.");
    if (!["collection", "copy", "snippet"].includes(skill.behavior)) throw new Error("Choose a supported skill action.");
    if (typeof skill.snippet !== "string" || (skill.behavior === "snippet" && !skill.snippet.trim()) || skill.snippet.length > 4000) throw new Error("Enter reusable text of up to 4,000 characters.");
    names.add(name);
    ids.add(skill.id);
  }
  return value;
}

const listeners = new Set<() => void>();
let knownRaw: string | null | undefined;
let knownValue = defaults;

function refresh() {
  let raw: string | null;
  try { raw = window.localStorage.getItem(storageKey); }
  catch { raw = null; }
  if (raw === knownRaw) return;
  knownRaw = raw;
  try { knownValue = raw === null ? defaults : validate(JSON.parse(raw)); }
  catch { knownValue = defaults; }
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === storageKey) refresh();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
    refresh();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

const snapshot = () => knownValue;
const serverSnapshot = () => defaults;
export function useWritingPreferences(): WritingPreferences {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export async function updateWritingPreferences(update: (current: WritingPreferences) => WritingPreferences) {
  const persist = () => {
    let raw: string | null;
    try { raw = window.localStorage.getItem(storageKey); }
    catch { throw new Error("Allow browser storage to save writing preferences on this device."); }
    let current: WritingPreferences;
    try { current = raw === null ? defaults : validate(JSON.parse(raw)); }
    catch { throw new Error("Stored preferences could not be read. Your saved settings have been preserved."); }
    const next = validate(update(current));
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { throw new Error("Your browser could not save these preferences. Check available storage and try again."); }
    refresh();
  };
  if (navigator.locks) await navigator.locks.request(storageKey, persist);
  else persist();
}
