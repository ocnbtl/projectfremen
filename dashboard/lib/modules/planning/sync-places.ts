"use client";
import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { PlaceReconciliation } from "./place-reconciliation";

let running: Promise<PlaceReconciliation> | undefined;
/** One shared, bounded background reconciliation per invocation; no private data in storage. */
export function syncSavedPlaces(): Promise<PlaceReconciliation> {
  if (running) return running;
  running = (async () => {
    const preview = await fetch("/api/planning/places", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ operation: "reconcile", dryRun: true }) });
    if (!preview.ok) throw new Error("Saved addresses could not be checked.");
    let result: PlaceReconciliation;
    for (let batch = 0; batch < 20; batch++) {
      const response = await fetch("/api/planning/places", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ operation: "reconcile" }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Saved addresses could not be connected.");
      result = body.result;
      if (!result.remaining) return result;
    }
    return result!;
  })().finally(() => { running = undefined; });
  return running;
}
