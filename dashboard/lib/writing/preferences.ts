"use client";

import { useSyncExternalStore } from "react";

import { writingDefaults as defaults, validateWriting as validate, type WritingPreferences } from "./model";
export type { WritingSkill, WritingPreferences } from "./model";
const storageKey = "unigentamos.writing.preferences.v1";
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
