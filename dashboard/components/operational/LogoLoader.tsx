"use client";
import { useLayoutEffect } from "react";
import { useLoadingHost } from "./LoadingHost";
import styles from "./LogoLoader.module.css";

/** Shared loading mark. Status stays accessible without adding visible copy. */
export default function LogoLoader({ label = "Loading", viewport = false }: { label?: string; viewport?: boolean }) {
  const register = useLoadingHost();
  useLayoutEffect(() => {
    if (viewport && register) return register(label);
  }, [viewport, register, label]);
  if (viewport && register) return null;
  return (
    <div className={`${styles.loader}${viewport ? ` ${styles.viewport}` : ""}`} role="status" aria-label={label} aria-live="polite" data-logo-loader>
      <img className={styles.logo} src="/unigentamos-logo.svg" width="64" height="64" alt="" aria-hidden="true" draggable={false} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
