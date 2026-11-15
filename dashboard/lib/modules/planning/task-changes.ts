/** Invalidation only: task records always come from the authenticated catalogue. */
export const TASK_CHANGE_KEY = "unigentamos-task-change";
export function notifyTaskChange() {
  window.dispatchEvent(new Event("unigentamos-tasks-changed"));
  try { localStorage.setItem(TASK_CHANGE_KEY, crypto.randomUUID()); } catch { /* Storage can be unavailable in private browsing. */ }
}

/** Hidden tabs refresh once when shown; no polling or background catalogue reads. */
export function subscribeTaskChanges(refresh: () => void, local = true) {
  let dirty = false;
  const flush = () => { if (dirty && !document.hidden) { dirty = false; refresh(); } };
  const changed = () => { dirty = true; flush(); };
  const storage = (event: StorageEvent) => { if (event.key === TASK_CHANGE_KEY) changed(); };
  window.addEventListener("storage", storage);
  document.addEventListener("visibilitychange", flush);
  if (local) window.addEventListener("unigentamos-tasks-changed", changed);
  return () => {
    window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", flush);
    if (local) window.removeEventListener("unigentamos-tasks-changed", changed);
  };
}
