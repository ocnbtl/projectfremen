"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./LogoLoader.module.css";

type Register = (label: string) => () => void;
const LoadingContext = createContext<Register | null>(null);
export const useLoadingHost = () => useContext(LoadingContext);

/** One image and animation survive route, data and lazy-module loading handoffs. */
export default function LoadingHost({ children }: { children: ReactNode }) {
  const requests = useRef(new Map<symbol, string>());
  const timers = useRef<{ show?: ReturnType<typeof setTimeout>; hide?: ReturnType<typeof setTimeout>; finish?: ReturnType<typeof setTimeout> }>({});
  const phase = useRef<"idle" | "visible" | "leaving">("idle");
  const [display, setDisplay] = useState({ phase: phase.current, label: "Loading" });
  const register = useCallback<Register>(label => {
    const id = Symbol(); requests.current.set(id, label);
    clearTimeout(timers.current.hide); clearTimeout(timers.current.finish);
    const show = () => {
      timers.current.show = undefined;
      if (!requests.current.size) return;
      phase.current = "visible";
      setDisplay({ phase: "visible", label: [...requests.current.values()].at(-1)! });
    };
    if (phase.current !== "idle") show();
    else if (!timers.current.show) timers.current.show = setTimeout(show, 80);
    return () => {
      requests.current.delete(id);
      if (requests.current.size) return;
      clearTimeout(timers.current.show); timers.current.show = undefined;
      if (phase.current === "idle") return;
      // A short handoff window joins sequential loading boundaries without flashes.
      timers.current.hide = setTimeout(() => {
        if (requests.current.size) return;
        phase.current = "leaving";
        setDisplay(value => ({ ...value, phase: "leaving" }));
        timers.current.finish = setTimeout(() => {
          if (requests.current.size) return;
          phase.current = "idle";
          setDisplay(value => ({ ...value, phase: "idle" }));
        }, 140);
      }, 90);
    };
  }, []);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); requests.current.clear(); }, []);
  return <LoadingContext.Provider value={register}>
    {children}
    <div className={`${styles.loader} ${styles.viewport} ${styles.host}`} data-loading-phase={display.phase} data-logo-loader="persistent" aria-hidden={display.phase !== "visible"}>
      <img className={styles.logo} src="/unigentamos-logo.svg" width="64" height="64" alt="" aria-hidden="true" draggable={false} />
      <span className="sr-only" role="status" aria-live="polite">{display.phase === "visible" ? display.label : ""}</span>
    </div>
  </LoadingContext.Provider>;
}
