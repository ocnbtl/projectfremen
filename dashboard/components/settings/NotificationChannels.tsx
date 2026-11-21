"use client";
import { useEffect, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { DailyPreferences } from "../../lib/settings/preferences";
import SettingsSwitch from "../writing/SettingsSwitch";
import styles from "../writing/WritingSettings.module.css";
const channels = [
  ["inboxKinds", "In-app"],
  ["emailKinds", "Email"],
  ["pushKinds", "Push"],
] as const;
const kinds = [
  ["assignment", "Assignments"],
  ["mention", "Mentions"],
  ["reminder", "Scheduled reminders"],
] as const;
export default function NotificationChannels({
  workspaceId,
  prefs,
  transports,
  save,
}: {
  workspaceId: string;
  prefs: DailyPreferences;
  transports: { email: boolean; pushKey: string };
  save: (patch: Partial<DailyPreferences>) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pushReady, setPushReady] = useState(false);
  useEffect(() => {
    setPushReady(false);
  }, [workspaceId]);
  async function registerDevice() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
      throw new Error("This browser does not support background push.");
    if ((await Notification.requestPermission()) !== "granted")
      throw new Error("Allow site notifications to connect this browser.");
    const reg = await navigator.serviceWorker.register("/account/push.js", { scope: "/account/" });
    const worker = reg.installing || reg.waiting;
    if (worker && worker.state !== "activated")
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.removeEventListener("statechange", changed);
          reject(new Error("The notification worker could not start."));
        }, 10000);
        function changed() {
          if (worker?.state === "activated" || worker?.state === "redundant") {
            clearTimeout(timer);
            worker.removeEventListener("statechange", changed);
            if (worker.state === "activated") resolve();
            else reject(new Error("The notification worker could not start."));
          }
        }
        worker.addEventListener("statechange", changed);
        changed();
      });
    const appKey = Uint8Array.from(atob(transports.pushKey.replaceAll("-", "+").replaceAll("_", "/")), (v) =>
      v.charCodeAt(0),
    );
    const subscription =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }));
    const result = await fetch("/api/account/workspaces/" + workspaceId + "/notifications", {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ action: "subscribe", endpoint: subscription.endpoint }),
    });
    if (!result.ok) throw new Error("Could not connect push for this sign-in.");
    setPushReady(true);
  }
  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update delivery.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className={styles.preferences} disabled={busy}>
      {channels.map(([key, label]) => (
        <section className={styles.panel} key={key}>
          <h2>{label}</h2>
          {key === "emailKinds" && !transports.email ? (
            <p>Email delivery needs a configured sender.</p>
          ) : key === "pushKinds" && !transports.pushKey ? (
            <p>Background push needs a configured push service.</p>
          ) : (
            <>
              {key === "pushKinds" && (
                <p>
                  <button type="button" onClick={() => void run(registerDevice)}>
                    {pushReady ? "Reconnect this browser" : "Connect this browser"}
                  </button>
                </p>
              )}
              {kinds.map(([kind, title]) => (
                <SettingsSwitch
                  key={kind}
                  label={title}
                  checked={prefs[key].includes(kind)}
                  onChange={(enabled) =>
                    void run(async () => {
                      if (key === "pushKinds" && enabled && !pushReady) await registerDevice();
                      await save({
                        [key]: enabled ? [...prefs[key], kind] : prefs[key].filter((x) => x !== kind),
                      });
                    })
                  }
                />
              ))}
            </>
          )}
        </section>
      ))}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
