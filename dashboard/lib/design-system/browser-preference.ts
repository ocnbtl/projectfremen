"use client";

import { useSyncExternalStore, type SetStateAction } from "react";

/** Keep display controls on different pages in sync using their existing browser keys. */
export function browserPreference<T>(key: string, fallback: T, parse: (value: string) => T, serialize: (value: T) => string) {
  const listeners = new Set<() => void>();
  let value = fallback;
  let lastRaw: string | null = null;
  let sessionOnly = false;
  function snapshot() {
    if (!sessionOnly) {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== lastRaw) {
          lastRaw = raw;
          value = raw === null ? fallback : parse(raw);
        }
      } catch { /* Use the last valid preference for this visit. */ }
    }
    return value;
  }
  function changed() { for (const listener of listeners) listener(); }
  function fromStorage(event: StorageEvent) {
    if (event.key === null || event.key === key) { sessionOnly = false; changed(); }
  }
  function subscribe(listener: () => void) {
    if (!listeners.size) window.addEventListener("storage", fromStorage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) window.removeEventListener("storage", fromStorage);
    };
  }
  function update(next: SetStateAction<T>) {
    const current = snapshot();
    value = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
    const raw = serialize(value);
    try { localStorage.setItem(key, raw); lastRaw = raw; sessionOnly = false; }
    catch { sessionOnly = true; }
    changed();
  }
  return function usePreference() {
    return [useSyncExternalStore(subscribe, snapshot, () => fallback), update] as const;
  };
}
