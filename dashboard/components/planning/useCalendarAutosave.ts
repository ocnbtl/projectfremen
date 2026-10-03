"use client";
import { useEffect, useRef, useState } from "react";

/** Coalesce typing, flush on dismissal, and retain failed values for explicit retry. */
export default function useCalendarAutosave<T>(save: (value: T) => Promise<boolean>, valid: (value: T) => boolean) {
  const saveRef = useRef(save), validRef = useRef(valid);
  saveRef.current = save; validRef.current = valid;
  const pending = useRef<{ value: T; revision: number } | null>(null), version = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const [status, setStatus] = useState<"" | "Saving…" | "Saved" | "Not saved">("");
  const flush = async () => {
    clearTimeout(timer.current);
    const job = pending.current;
    if (!job || !validRef.current(job.value)) return;
    pending.current = null;
    if (mounted.current) setStatus("Saving…");
    let ok = false;
    try { ok = await saveRef.current(job.value); } catch { /* Parent displays the operation error. */ }
    if (version.current !== job.revision) return;
    if (!ok) pending.current = job;
    if (mounted.current) setStatus(ok ? "Saved" : "Not saved");
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; void flushRef.current(); }; }, []);
  const schedule = (value: T) => {
    clearTimeout(timer.current);
    pending.current = { value, revision: ++version.current };
    setStatus(validRef.current(value) ? "Saving…" : "Not saved");
    if (validRef.current(value)) timer.current = setTimeout(() => void flushRef.current(), 550);
  };
  return { schedule, flush, status };
}
