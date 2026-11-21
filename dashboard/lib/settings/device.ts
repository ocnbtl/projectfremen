import { dailyDefaults, validateDaily } from "./preferences";
export const preferenceKey = "unigentamos.settings.daily.v1";
let lastRaw: string | null = null,
  current = dailyDefaults;
export function readDeviceDaily() {
  if (typeof window === "undefined") return dailyDefaults;
  try {
    const raw = localStorage.getItem(preferenceKey);
    if (raw !== lastRaw) {
      current = raw ? validateDaily(JSON.parse(raw)) : dailyDefaults;
      lastRaw = raw;
    }
    return current;
  } catch {
    return dailyDefaults;
  }
}
export function subscribeDaily(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === preferenceKey) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(preferenceKey, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(preferenceKey, listener);
  };
}
export async function changeDeviceDaily(patch: Partial<typeof dailyDefaults>) {
  const change = () => {
    const raw = localStorage.getItem(preferenceKey);
    const existing = raw ? validateDaily(JSON.parse(raw)) : dailyDefaults;
    const next = validateDaily({ ...existing, ...patch });
    localStorage.setItem(preferenceKey, JSON.stringify(next));
    window.dispatchEvent(new Event(preferenceKey));
  };
  if (navigator.locks) await navigator.locks.request(preferenceKey, change);
  else change();
}
