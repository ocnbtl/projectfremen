// Broadcast invalidation only. Mention text and object identities stay in their source.
const writingChange = "unigentamos-writing-sources-changed";
const signals = [writingChange, "unigentamos-tasks-changed", "unigentamos-planning-changed", "unigentamos-media-details-changed"];
const storageSignals = new Set([writingChange, "unigentamos-task-change", "unigentamos-media-details-changed"]);
export function notifyWritingSourcesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(writingChange));
  try { localStorage.setItem(writingChange, crypto.randomUUID()); } catch { /* Same-tab notification still works. */ }
}

export function watchWritingSources(refresh: () => void) {
  let dirty = false, timer: ReturnType<typeof setTimeout>;
  let lastRead = Date.now();
  function flush() {
    if (document.hidden || !dirty) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.hidden) return;
      dirty = false;
      lastRead = Date.now();
      refresh();
    }, 220);
  }
  function changed() { dirty = true; flush(); }
  function returned() {
    if (Date.now() - lastRead >= 60_000) dirty = true;
    flush();
  }
  function restored(event: PageTransitionEvent) { if (event.persisted) changed(); }
  function storage(event: StorageEvent) { if (event.key && storageSignals.has(event.key)) changed(); }
  for (const name of signals) window.addEventListener(name,changed);
  window.addEventListener("storage",storage);
  window.addEventListener("pageshow",restored);
  document.addEventListener("visibilitychange",returned);
  return () => {
    clearTimeout(timer);
    for (const name of signals) window.removeEventListener(name,changed);
    window.removeEventListener("storage",storage);
    window.removeEventListener("pageshow",restored);
    document.removeEventListener("visibilitychange",returned);
  };
}
