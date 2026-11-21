"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ADMIN_NAV_ITEMS } from "../../lib/admin-navigation";
import {
  dailyDefaults,
  formattedDay,
  reminderOptions,
  searchKinds,
  taskKinds,
  type DailyPreferences,
} from "../../lib/settings/preferences";
import { useDailyPreferences, useHighContrast, useReadingSize } from "../../lib/settings/hooks";
import { changeDeviceDaily } from "../../lib/settings/device";
import { planningRequest, type PlanningSnapshot } from "../../lib/modules/planning/repository";
import { destinations } from "./AccountNav";
import SettingsSwitch from "../writing/SettingsSwitch";
import styles from "../writing/WritingSettings.module.css";

export function ReadingSettings() {
  const [size, setSize] = useReadingSize(),
    [contrast, setContrast] = useHighContrast();
  return (
    <section className={styles.panel}>
      <h2>Reading on this device</h2>
      <Choice
        label="Reading text size"
        value={size}
        onChange={(v) => setSize(v as typeof size)}
        options={[
          ["standard", "Standard"],
          ["large", "Large"],
          ["larger", "Larger"],
        ]}
      />
      <SettingsSwitch
        label="Increase contrast"
        detail="Strengthen secondary text, labels, and status messages."
        checked={contrast}
        onChange={setContrast}
      />
    </section>
  );
}
type Option = readonly [string, string];
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly Option[];
}) {
  return (
    <label className={styles.preferenceRow}>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
const leadChoices = reminderOptions.map(
  (n) =>
    [
      String(n),
      n === -1 ? "Off" : n === 0 ? "At the start" : n === 1440 ? "1 day before" : n + " minutes before",
    ] as const,
);
const modules = ADMIN_NAV_ITEMS.flatMap((item) => (item.href ? [[item.href, item.label] as const] : []));
const kindLabels: Record<string, string> = {
  note: "Notes",
  contact: "People",
  project: "Projects",
  resource: "Resources",
  media: "Media",
  review: "Reviews",
  finance: "Finance",
  personal_ops: "Personal",
  other: "Other records",
  follow_up: "Follow-up",
};
const title = (key: string) => kindLabels[key] || key[0].toUpperCase() + key.slice(1);
export type DailyGroup = "regional" | "notifications" | "planning" | "navigation" | "search";

export function PreferenceFields({
  section,
  prefs,
  save,
  account = false,
}: {
  section: DailyGroup;
  prefs: DailyPreferences;
  save: (patch: Partial<DailyPreferences>) => Promise<void>;
  account?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<PlanningSnapshot>(),
    [calendarError, setCalendarError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (section !== "planning" || account) return;
    let active = true;
    planningRequest<PlanningSnapshot>()
      .then((s) => {
        if (active) {
          setSnapshot(s);
          setCalendarError("");
        }
      })
      .catch(() => {
        if (active) setCalendarError("Calendars could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [section, account, retry]);
  async function change<K extends keyof DailyPreferences>(key: K, value: DailyPreferences[K]) {
    setError("");
    setBusy(true);
    try {
      await save({ [key]: value });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this preference.");
    } finally {
      setBusy(false);
    }
  }
  function select<K extends keyof DailyPreferences>(label: string, key: K, options: readonly Option[]) {
    return (
      <Choice
        label={label}
        value={String(prefs[key])}
        options={options}
        onChange={(v) =>
          void change(key, (typeof dailyDefaults[key] === "number" ? Number(v) : v) as DailyPreferences[K])
        }
      />
    );
  }
  function toggle(label: string, key: keyof DailyPreferences, detail?: string) {
    return (
      <SettingsSwitch
        label={label}
        detail={detail}
        checked={Boolean(prefs[key])}
        onChange={(v) => void change(key, v)}
      />
    );
  }
  function time(label: string, key: "quietStart" | "quietEnd" | "digestAt") {
    return (
      <label className={styles.preferenceRow}>
        <span>{label}</span>
        <input
          type="time"
          required
          value={prefs[key]}
          onChange={(e) => {
            if (e.target.value) void change(key, e.target.value);
          }}
        />
      </label>
    );
  }
  function multiselect(
    key: "desktopPins" | "mobilePins" | "searchKinds" | "recordKinds" | "accountPins" | "accountMobilePins",
    options: readonly Option[],
  ) {
    return options.map(([value, label]) => (
      <SettingsSwitch
        key={value}
        label={label}
        checked={prefs[key].includes(value)}
        onChange={(enabled) =>
          void change(key, enabled ? [...prefs[key], value] : prefs[key].filter((path) => path !== value))
        }
      />
    ));
  }
  return (
    <fieldset className={styles.preferences} disabled={busy}>
      {section === "regional" && (
        <>
          <Panel title="Date and time">
            {select("Date order", "dateOrder", [
              ["mdy", "Month / day / year"],
              ["dmy", "Day / month / year"],
              ["ymd", "Year – month – day"],
            ])}
            {select("Clock", "clock", [
              ["12", "12-hour"],
              ["24", "24-hour"],
            ])}
            {!account &&
              select("First day of the week", "weekStart", [
                ["sunday", "Sunday"],
                ["monday", "Monday"],
              ])}
            {!account &&
              select(
                "Currency for bank balance subtotals",
                "balanceCurrency",
                Intl.supportedValuesOf("currency").map((code) => [code, code]),
              )}
            {!account &&
              select("Currency labels in Finance totals", "currencyDisplay", [
                ["symbol", "Symbol ($25)"],
                ["code", "Currency code (USD 25)"],
              ])}
            <p>Example date · {formattedDay("2026-11-21", prefs.dateOrder)}</p>
          </Panel>
          <Panel title="Time zone">
            {select("Home time zone", "homeZone", [
              ["device", "Use this device’s zone"],
              ...Array.from(new Set(["UTC", ...Intl.supportedValuesOf("timeZone")])).map(
                (zone) => [zone, zone.replaceAll("_", " ")] as const,
              ),
            ])}
            {!account &&
              select("When a new routine repeats", "routineZone", [
                ["home", "Keep its original time zone"],
                ["device", "Follow the device’s time zone"],
              ])}
          </Panel>
        </>
      )}
      {section === "notifications" && (
        <>
          <Panel title="Delivery">
            {account ? (
              toggle(
                "Show shared records in my inbox",
                "shareInbox",
                "See records a workspace member shared directly with you.",
              )
            ) : (
              <>
                {toggle("In-app reminder badge", "reminderBell", "The bell always opens your reminders.")}
                <SettingsSwitch
                  label="Desktop reminder alerts"
                  detail="Show a browser notification when a reminder comes due while the workspace is open."
                  checked={prefs.desktopReminders}
                  onChange={async (enabled) => {
                    if (enabled) {
                      try {
                        if (
                          !("Notification" in window) ||
                          (await Notification.requestPermission()) !== "granted"
                        ) {
                          setError("Allow notifications for this site to enable desktop alerts.");
                          return;
                        }
                      } catch {
                        setError("This browser does not support desktop alerts.");
                        return;
                      }
                    }
                    await change("desktopReminders", enabled);
                  }}
                />
              </>
            )}
          </Panel>
          <Panel title="Quiet hours">
            {toggle(
              "Enable quiet hours",
              "quiet",
              account
                ? "Hold shared updates until the window ends."
                : "Pause the reminder badge and desktop alerts during this window.",
            )}
            {prefs.quiet && (
              <>
                {time("From", "quietStart")}
                {time("Until", "quietEnd")}
              </>
            )}
          </Panel>
          {account && (
            <Panel title="Shared updates">
              {select("Inbox schedule", "digest", [
                ["live", "As they arrive"],
                ["daily", "Daily digest for shares and mentions"],
              ])}
              {prefs.digest === "daily" && time("Digest time", "digestAt")}
            </Panel>
          )}
        </>
      )}
      {section === "planning" && (
        <>
          <Panel title="New events and tasks">
            {select(
              "Task kind",
              "taskKind",
              taskKinds.map((k) => [k, title(k)]),
            )}
            {toggle(
              "Start new tasks on the selected day",
              "scheduleTask",
              "Turn off to capture an unscheduled task.",
            )}
            {snapshot &&
              select("Destination calendar", "calendarId", [
                ["", "First available native calendar"],
                ...snapshot.state.calendars
                  .filter((c) => !c.connectionId && !c.archivedAt)
                  .map((c) => [c.id, c.name] as const),
              ])}
            {calendarError && (
              <p role="alert">
                {calendarError}{" "}
                <button type="button" onClick={() => setRetry((v) => v + 1)}>
                  Retry
                </button>
              </p>
            )}
          </Panel>
          <Panel title="Reminder lead times">
            {select("Appointments", "eventLead", leadChoices)}
            {select("All-day events", "deadlineLead", leadChoices)}
            {select("Scheduled tasks", "taskLead", leadChoices)}
          </Panel>
          <Panel title="Calendar connections">
            {snapshot &&
              (snapshot.state.connections.filter((c) => !c.archivedAt).length ? (
                <ul>
                  {snapshot.state.connections
                    .filter((c) => !c.archivedAt)
                    .map((c) => (
                      <li key={c.id}>
                        <strong>{c.name}</strong> ·{" "}
                        {c.kind === "ics_file" ? "One-time import" : "Inbound subscription"}
                      </li>
                    ))}
                </ul>
              ) : (
                <p>No calendars connected.</p>
              ))}
            <Link href="/admin/calendar?panel=connections">Manage calendars and subscriptions</Link>
          </Panel>
        </>
      )}
      {section === "navigation" && (
        <>
          <Panel title="Home">
            {account
              ? select("When I open this workspace", "accountLanding", destinations)
              : select("After sign-in and from the home logo", "landing", [
                  ["/admin", "Command Center"],
                  ...modules,
                ])}
          </Panel>
          <Panel title="Desktop pins">
            <p>Pinned modules appear first in the navigation, in the order you select them.</p>
            {account ? multiselect("accountPins", destinations) : multiselect("desktopPins", modules)}
          </Panel>
          <Panel title="Mobile pins">
            {account ? multiselect("accountMobilePins", destinations) : multiselect("mobilePins", modules)}
          </Panel>
        </>
      )}
      {section === "search" && (
        <>
          <Panel title={account ? "Workspace search" : "Vault search"}>
            {!account && toggle("Include archived records", "archived")}
            {toggle(
              "Keep recent searches during this visit",
              "recentSearches",
              "Press Enter in search to remember a query until you leave the page.",
            )}
          </Panel>
          <Panel title="Default record types">
            <p>Choose types to include when searching All. An empty selection searches every type.</p>
            {account
              ? multiselect(
                  "recordKinds",
                  ["note", "task", "board", "project", "person", "finance", "health"].map((k) => [
                    k,
                    title(k),
                  ]),
                )
              : multiselect(
                  "searchKinds",
                  searchKinds.map((k) => [k, title(k)]),
                )}
          </Panel>
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
export default function DailySettings({ section }: { section: DailyGroup }) {
  const prefs = useDailyPreferences();
  return <PreferenceFields section={section} prefs={prefs} save={changeDeviceDaily} />;
}
