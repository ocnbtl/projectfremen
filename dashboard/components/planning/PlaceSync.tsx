"use client";
import { useEffect, useRef, useState } from "react";
import { syncSavedPlaces } from "../../lib/modules/planning/sync-places";
import styles from "./ProfilePlaceField.module.css";

/** Background address reconciliation never replaces an open profile draft. */
export default function PlaceSync({ enabled = true, onComplete }: { enabled?: boolean; onComplete: () => void | Promise<void> }) {
  const callback = useRef(onComplete), active = useRef(enabled);
  callback.current = onComplete; active.current = enabled;
  const [retry, setRetry] = useState(0), [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    void syncSavedPlaces().then(async result => {
      if (!mounted || !active.current) return;
      await callback.current();
      if (mounted) setMessage(result.conflicts ? "Some addresses need review. Choose a saved place in the profile or event." : result.remaining ? "More addresses are waiting to connect." : "");
    }).catch(() => { if (mounted) setMessage("Saved addresses will connect when you’re online. You can keep working."); });
    return () => { mounted = false; };
  }, [enabled, retry]);
  return message ? <div role="status" className={styles.sync}>{message}<button type="button" onClick={() => { setMessage(""); setRetry(value => value + 1); }}>Retry place sync</button></div> : null;
}
