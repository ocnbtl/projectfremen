"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import {
  dailyDefaults,
  formattedDay,
  preferenceZone,
  readyForDigest,
  silenced,
  validateDaily,
  type DailyPreferences,
} from "../../lib/settings/preferences";
import { validateWriting, writingDefaults, type WritingPreferences } from "../../lib/writing/model";
import { settingsPages } from "../../lib/settings/sections";
import { PreferenceFields, ReadingSettings } from "./DailySettings";
import WritingSettings from "../writing/WritingSettings";
import AccountSettings from "./AccountSettings";
import SharingSettings from "./SharingSettings";
import RecoverySettings from "./RecoverySettings";
import WorkspaceMedia from "./WorkspaceMedia";
import NotificationChannels from "./NotificationChannels";

import styles from "../writing/WritingSettings.module.css";
type InboxItem = {
  id: string;
  created_at: string;
  object_key: string;
  title: string;
  kind: string;
  category: string;
};
type Data = {
  revision: number;
  daily: DailyPreferences;
  writing: WritingPreferences;
  inbox: InboxItem[];
  transports: { email: boolean; pushKey: string };
};
const sections = [
  "account",
  "sharing",
  "writing",
  "regional",
  "notifications",
  "appearance",
  "navigation",
  "search",
  "backup",
  "device-data",
] as const;
type Section = "home" | (typeof sections)[number];
function parse(raw: Data): Data {
  return {
    ...raw,
    daily: validateDaily(raw.daily || dailyDefaults),
    writing: raw.writing?.skills ? validateWriting(raw.writing) : writingDefaults,
  };
}
export default function AccountPreferences({
  workspaceId,
  section,
}: {
  workspaceId: string;
  section: Section;
}) {
  const url = "/api/account/workspaces/" + encodeURIComponent(workspaceId) + "/preferences";
  const home = "/account/workspaces/" + encodeURIComponent(workspaceId);
  const link = (section: Section) =>
    "/account/preferences/" + section + "?workspace=" + encodeURIComponent(workspaceId);
  const [data, setData] = useState<Data>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [now, setNow] = useState(Date.now());
  const current = useRef<Data | undefined>(undefined);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const start = current.current;
      try {
        const response = await fetch(url, { cache: "no-store", signal });
        const raw = await response.json();
        if (!response.ok) throw new Error(raw.error || "Sign in to view workspace preferences.");
        if (signal.aborted || current.current !== start) return;
        const next = parse(raw);
        current.current = next;
        setData(next);
        setError("");
      } catch (e) {
        if (!signal.aborted) {
          current.current = undefined;
          setData(undefined);
          setError(e instanceof Error ? e.message : "Settings are unavailable.");
        }
      }
    },
    [url],
  );
  useEffect(() => {
    const request = new AbortController();
    void load(request.signal);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(request.signal);
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      if (section === "notifications") refresh();
    }, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      request.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [section, retry, load]);
  async function save(group: "daily" | "writing", value: DailyPreferences | WritingPreferences) {
    if (!current.current) throw new Error("Reload settings before saving.");
    const result = await fetch(url, {
      method: "PATCH",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ group, value, revision: data?.revision }),
    });
    const raw = await result.json();
    if (!result.ok) {
      if (result.status === 409) setRetry((n) => n + 1);
      if (result.status === 401 || result.status === 403) {
        current.current = undefined;
        setData(undefined);
        setError(raw.error);
      }
      throw new Error(raw.error || "Could not save account preferences.");
    }
    const next = parse(raw);
    current.current = next;
    setData(next);
  }
  const prefs = data?.daily || dailyDefaults;
  const inbox = !silenced(prefs, now)
    ? (data?.inbox || []).filter((item) =>
        item.category === "share"
          ? prefs.shareInbox && readyForDigest(Date.parse(item.created_at), now, prefs)
          : prefs.inboxKinds.includes(item.category) &&
            (item.category !== "mention" || readyForDigest(Date.parse(item.created_at), now, prefs)),
      )
    : [];
  return (
    <main className={styles.content} aria-label="Account preferences">
      <header className={styles.heading}>
        <Link className={styles.back} href={section === "home" ? home + "?tab=records" : link("home")}>
          {section === "home" ? "Workspace" : "Settings"}
        </Link>
        <h1>{section === "home" ? "Workspace preferences" : settingsPages[section].title}</h1>
        <p>
          {section === "appearance"
            ? "Reading preferences on this device."
            : "These settings follow your account in this workspace."}
        </p>
      </header>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>{" "}
          <Link href="/account">Account</Link>
        </p>
      )}
      {!error && !data && <p role="status">Loading settings…</p>}
      {data && (
        <>
          {section === "home" && (
            <nav className={styles.directoryList}>
              {sections.map((key) => (
                <Link key={key} href={link(key)}>
                  {settingsPages[key].title}
                </Link>
              ))}
            </nav>
          )}
          {section === "writing" && (
            <WritingSettings
              account={{
                workspaceId,
                preferences: data.writing,
                save: (update) => save("writing", validateWriting(update(data.writing))),
              }}
            />
          )}
          {section === "appearance" && <ReadingSettings />}
          {section === "sharing" && <SharingSettings />}
          {section === "backup" && <RecoverySettings />}
          {section === "device-data" && <WorkspaceMedia workspaceId={workspaceId} />}
          {section === "account" && <AccountSettings />}
          {(section === "regional" ||
            section === "notifications" ||
            section === "navigation" ||
            section === "search") && (
            <PreferenceFields
              section={section}
              account
              prefs={prefs}
              save={(patch) =>
                save(
                  "daily",
                  validateDaily({
                    ...prefs,
                    ...patch,
                    deliveryZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  }),
                )
              }
            />
          )}
          {section === "notifications" && (
            <NotificationChannels
              workspaceId={workspaceId}
              prefs={prefs}
              transports={data.transports}
              save={(patch) =>
                save(
                  "daily",
                  validateDaily({
                    ...prefs,
                    ...patch,
                    deliveryZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  }),
                )
              }
            />
          )}
          {section === "notifications" && (
            <section className={styles.panel}>
              <h2>{prefs.digest === "daily" ? "Workspace digest" : "Workspace inbox"}</h2>
              {inbox.length ? (
                <ul>
                  {inbox.map((item) => {
                    const date = new Date(item.created_at),
                      zone = preferenceZone(prefs);
                    const localDate = new Intl.DateTimeFormat("sv-SE", {
                      timeZone: zone,
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(date);
                    return (
                      <li key={item.id}>
                        <Link href={home + "?item=" + encodeURIComponent(item.object_key)}>{item.title}</Link>{" "}
                        <small>
                          {item.category} · {item.kind} · {formattedDay(localDate, prefs.dateOrder)} ·{" "}
                          {date.toLocaleTimeString("en-GB", {
                            timeZone: zone,
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: prefs.clock === "12",
                          })}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>{silenced(prefs, now) ? "Quiet hours are active." : "No shared updates to show."}</p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
