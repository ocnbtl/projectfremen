"use client";

import { useEffect, useState } from "react";
import styles from "./ServiceWorkerRegistration.module.css";

const UPDATE_EVENT = "unigentamos:update-ready";

export default function ServiceWorkerRegistration() {
  const [updateReady, setUpdateReady] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    let registration: ServiceWorkerRegistration | null = null;
    let hadController = Boolean(navigator.serviceWorker.controller);
    const showUpdate = () => setUpdateReady(true);
    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate();
      });
    };
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => undefined);
    };
    const handleControllerChange = () => {
      if (hadController) showUpdate();
      hadController = true;
    };

    window.addEventListener(UPDATE_EVENT, showUpdate);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((next) => {
      registration = next;
      if (next.waiting && navigator.serviceWorker.controller) showUpdate();
      watchInstallingWorker(next.installing);
      next.addEventListener("updatefound", () => watchInstallingWorker(next.installing));
      return next.update();
    }).catch(() => undefined);

    const timer = window.setInterval(checkForUpdate, 5 * 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(UPDATE_EVENT, showUpdate);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  async function applyUpdate() {
    setReloading(true);
    const registration = await navigator.serviceWorker.getRegistration("/");
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(() => window.location.reload(), registration?.waiting ? 800 : 0);
  }

  if (!updateReady) return null;
  return (
    <aside className={styles.updateNotice} role="status" aria-live="polite">
      <div><strong>A newer version is ready.</strong><span>Reload to use it now.</span></div>
      <button type="button" disabled={reloading} onClick={applyUpdate}>{reloading ? "Updating..." : "Update now"}</button>
    </aside>
  );
}
