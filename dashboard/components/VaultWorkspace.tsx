"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  browserVault,
  deterministicVaultObjectId,
  isVaultOnlineAuthorizationError,
  VAULT_ONLINE_SIGN_IN_MESSAGE
} from "../lib/local-first/browser-engine";
import type {
  VaultDeviceStatus,
  VaultBackupRestorePreview,
  VaultBackupSummary,
  VaultFieldValue,
  VaultObjectKind,
  VaultObjectSnapshot,
  VaultRecoveryPackage
} from "../lib/local-first/types";
import styles from "./VaultWorkspace.module.css";

type VaultStatus = Awaited<ReturnType<typeof browserVault.status>>;
type BootstrapObject = { canonicalId: string; objectKind: VaultObjectKind; fields: Record<string, VaultFieldValue> };
type SetupTarget = "windows" | "apple";

const COMPANION_HELPER_URL = "http://127.0.0.1:43127/";
const MAX_RECOVERY_FILE_BYTES = 256 * 1024;
const VAULT_RELEASE_NOTE = "history-media-backup-v1";
const RECORD_TABS: Array<{ value: VaultObjectKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "note", label: "Notes" },
  { value: "contact", label: "Contacts" },
  { value: "resource", label: "Resources" },
  { value: "project", label: "Projects" },
  { value: "personal_ops", label: "Personal" },
  { value: "review", label: "Reviews" },
  { value: "finance", label: "Finance" },
  { value: "media", label: "Media" },
  { value: "other", label: "Other" }
];

function recordKindLabel(kind: VaultObjectKind): string {
  return {
    note: "Note",
    contact: "Contact",
    resource: "Resource",
    media: "Media",
    project: "Project",
    personal_ops: "Personal record",
    review: "Review",
    finance: "Finance record",
    settings: "Setting",
    other: "Record"
  }[kind];
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function humanFieldName(value: string): string {
  const last = value.split(".").at(-1) || value;
  return last.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function humanFieldValue(value: VaultFieldValue): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const simple = value.filter((item) => typeof item === "string" || typeof item === "number").map(String);
    return simple.length === value.length ? simple.join(", ") : `${value.length} saved item${value.length === 1 ? "" : "s"}`;
  }
  const simple = Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
  return simple.length ? simple.slice(0, 8).map(([key, item]) => `${humanFieldName(key)}: ${String(item)}`).join(" · ") : "Saved details";
}

function humanFields(fields: Record<string, VaultFieldValue>): Array<[string, string]> {
  return Object.entries(fields)
    .filter(([field, value]) => !field.startsWith("__unigentamos") && !["mediaManifest", "mediaState", "sourceModule"].includes(field) && value !== "")
    .slice(0, 24)
    .map(([field, value]) => [humanFieldName(field), humanFieldValue(value)]);
}

function suggestedDevice(): { target: SetupTarget; name: string } {
  if (typeof navigator === "undefined") return { target: "windows", name: "Windows desktop" };
  const userAgent = navigator.userAgent;
  if (/iPhone/i.test(userAgent)) return { target: "apple", name: "iPhone" };
  if (/iPad/i.test(userAgent) || /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1) return { target: "apple", name: "iPad" };
  if (/Macintosh/i.test(userAgent)) return { target: "apple", name: "MacBook" };
  return { target: "windows", name: "Windows desktop" };
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function relativeTime(value: string | null): string {
  if (!value) return "Never";
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  if (elapsed < 15_000) return "Just now";
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)} seconds ago`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} minutes ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hours ago`;
  return `${Math.floor(elapsed / 86_400_000)} days ago`;
}

function deviceKindLabel(device: VaultDeviceStatus): string {
  return {
    windows: "Windows",
    iphone: "iPhone",
    ipad: "iPad",
    macbook: "MacBook",
    browser: "Browser"
  }[device.descriptor.deviceKind];
}

function deviceSyncState(device: VaultDeviceStatus, relayHeadSequence: number): {
  label: string;
  detail: string;
  tone: "current" | "pending" | "attention" | "inactive";
  current: boolean;
} {
  const active = Date.now() - Date.parse(device.lastSeenAt) < 90_000;
  if (device.blockedChanges > 0) {
    return { label: "Needs attention", detail: `${device.blockedChanges} change${device.blockedChanges === 1 ? " could" : "s could"} not be applied. The earlier version is still saved.`, tone: "attention", current: false };
  }
  if (device.pendingChanges > 0) {
    return { label: active ? "Syncing" : "Open to sync", detail: `${device.pendingChanges} change${device.pendingChanges === 1 ? " is" : "s are"} waiting to sync`, tone: "pending", current: false };
  }
  if (device.acknowledgedSequence < relayHeadSequence) {
    const behind = relayHeadSequence - device.acknowledgedSequence;
    return { label: active ? "Syncing" : "Open to sync", detail: `${behind} change${behind === 1 ? " is" : "s are"} waiting to download`, tone: active ? "pending" : "inactive", current: false };
  }
  return {
    label: active ? "Up to date" : "Up to date · offline",
    detail: active ? "Everything saved in the Vault is on this device" : `Last connected ${relativeTime(device.lastSeenAt)}`,
    tone: active ? "current" : "inactive",
    current: true
  };
}

export default function VaultWorkspace() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("Windows desktop");
  const [setupTarget, setSetupTarget] = useState<SetupTarget>("windows");
  const [setupCode, setSetupCode] = useState("");
  const [recoveryText, setRecoveryText] = useState("");
  const [recoveryFileName, setRecoveryFileName] = useState("");
  const [message, setMessage] = useState("Checking this device…");
  const [busy, setBusy] = useState(false);
  const [checkingCompanion, setCheckingCompanion] = useState(false);
  const [online, setOnline] = useState(true);
  const [journal, setJournal] = useState("");
  const [journalId, setJournalId] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [objects, setObjects] = useState<VaultObjectSnapshot[]>([]);
  const [activeKind, setActiveKind] = useState<VaultObjectKind | "all">("all");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [objectDraft, setObjectDraft] = useState<Record<string, string>>({ title: "", body: "" });
  const [objectHistory, setObjectHistory] = useState<VaultObjectSnapshot[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreArmed, setRestoreArmed] = useState(false);
  const [recordQuery, setRecordQuery] = useState("");
  const [backups, setBackups] = useState<VaultBackupSummary[]>([]);
  const [restorePreview, setRestorePreview] = useState<VaultBackupRestorePreview | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [showReleaseNote, setShowReleaseNote] = useState(false);

  const refresh = useCallback(async () => {
    const next = await browserVault.status();
    setStatus(next);
    return next;
  }, []);

  const loadObjects = useCallback(async () => {
    const next = await browserVault.listObjects();
    setObjects(next);
  }, []);

  useEffect(() => {
    const suggested = suggestedDevice();
    setSetupTarget(suggested.target);
    setDeviceName(suggested.name);
    setOnline(navigator.onLine);
    refresh().then(() => setMessage("")).catch(() => setMessage("We could not check this device. Try again."));
    const handleOnline = () => { setOnline(navigator.onLine); void browserVault.syncOnce().finally(refresh); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
    };
  }, [refresh]);

  function chooseSetupTarget(target: SetupTarget) {
    setSetupTarget(target);
    const suggested = suggestedDevice();
    setDeviceName(target === "windows" ? "Windows desktop" : suggested.target === "apple" ? suggested.name : "My Apple device");
    setMessage("");
  }

  async function checkCompanion() {
    setCheckingCompanion(true);
    setMessage("Checking the Windows helper…");
    try {
      const next = await refresh();
      setMessage(next.localCompanion.available
        ? "Windows helper found. Continue to the next step."
        : "This browser could not reach the Windows helper. Open the pairing code, return here, and choose Check connection again. Allow local network access if your browser asks.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not check the Windows helper.");
    } finally {
      setCheckingCompanion(false);
    }
  }

  async function loadRecoveryFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_RECOVERY_FILE_BYTES) {
      setMessage("That recovery file is too large. Choose the JSON file downloaded from the Vault.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<VaultRecoveryPackage>;
      if (parsed.format !== "unigentamos-vault-recovery-v1" || !parsed.vaultId || !parsed.keyEnvelope) {
        throw new Error("That is not a Unigentamos recovery file.");
      }
      setRecoveryText(text);
      setRecoveryFileName(file.name);
      setMessage("Recovery file ready. Enter your vault password.");
    } catch (error) {
      setRecoveryText("");
      setRecoveryFileName("");
      setMessage(error instanceof Error ? error.message : "We could not read that recovery file.");
    }
  }

  useEffect(() => {
    if (status?.unlocked) void loadObjects().catch(() => undefined);
  }, [loadObjects, status?.diagnostics.objects, status?.unlocked]);

  useEffect(() => {
    if (status?.unlocked && status.localCompanion.unlocked) void loadBackups();
  }, [status?.localCompanion.unlocked, status?.unlocked]);

  useEffect(() => {
    if (!status?.configured) return;
    setShowReleaseNote(window.localStorage.getItem("unigentamos-vault-release-note") !== VAULT_RELEASE_NOTE);
  }, [status?.configured]);

  function dismissReleaseNote() {
    window.localStorage.setItem("unigentamos-vault-release-note", VAULT_RELEASE_NOTE);
    setShowReleaseNote(false);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      await refresh().catch(() => undefined);
      setMessage(isVaultOnlineAuthorizationError(error)
        ? VAULT_ONLINE_SIGN_IN_MESSAGE
        : error instanceof Error ? error.message : "That did not work. Try again.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  async function setupDesktop() {
    await run(async () => {
      if (!status?.localCompanion.available) throw new Error("Open the Windows helper first.");
      await browserVault.initializeDesktopMaster(password, deviceName, setupCode);
      browserVault.startSync();
      await loadObjects();
      setMessage("Your Windows vault is ready.");
    });
  }

  async function connectDesktop() {
    await run(async () => {
      await browserVault.joinDesktopMaster(password, deviceName);
      browserVault.startSync();
      await loadObjects();
      setMessage("This browser is connected.");
    });
  }

  async function unlock() {
    await run(async () => {
      if (status?.localCompanion.available && status.localCompanion.configured) {
        await browserVault.unlockDesktopMaster(password);
      } else {
        await browserVault.unlock(password);
      }
      browserVault.startSync();
      await loadObjects();
      setMessage("Vault unlocked. Your work will sync automatically.");
    });
  }

  async function joinDevice() {
    await run(async () => {
      const recovery = JSON.parse(recoveryText) as VaultRecoveryPackage;
      await browserVault.join(password, deviceName, recovery);
      browserVault.startSync();
      await loadObjects();
      setRecoveryText("");
      setRecoveryFileName("");
      setMessage("This device is connected.");
    });
  }

  async function exportRecovery() {
    await run(async () => {
      const recovery = await browserVault.exportRecoveryPackage();
      downloadJson(`unigentamos-vault-recovery-${recovery.vaultId}.json`, recovery);
      setMessage("Recovery file downloaded. Keep it somewhere separate from your password.");
    });
  }

  async function importWorkspace() {
    await run(async () => {
      const response = await fetch("/api/vault/bootstrap", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; objects?: BootstrapObject[]; error?: string };
      if (!response.ok || !payload.ok || !payload.objects) throw new Error(payload.error || "We could not add your workspace. Try again.");
      let changed = 0;
      for (const item of payload.objects) {
        const objectId = await deterministicVaultObjectId(item.canonicalId);
        const mirrored = await browserVault.mirrorCanonicalObject({
          objectId,
          objectKind: item.objectKind,
          fields: item.fields
        });
        if (mirrored.changed) changed += 1;
        if (changed % 10 === 0) setMessage(`Adding ${changed} items to the Vault…`);
      }
      await browserVault.syncOnce();
      await loadObjects();
      setMessage(changed ? `Added ${changed} new or changed items to the Vault.` : "Your Vault already has the latest workspace data.");
    });
  }

  async function createBackup() {
    await run(async () => {
      const created = await browserVault.createDesktopBackup();
      await browserVault.verifyDesktopBackup(created.backupId);
      setBackups(await browserVault.listDesktopBackups());
      setMessage("Backup created and checked. It is ready if you ever need it.");
    });
  }

  async function saveJournal() {
    await run(async () => {
      const objectId = journalId || await deterministicVaultObjectId("vault:journal");
      await browserVault.saveObject({ objectId, objectKind: "note", fields: { title: "Vault journal", body: journal } });
      setJournalId(objectId);
      const history = await browserVault.history(objectId);
      setHistoryCount(history.length);
      await loadObjects();
      setMessage(`Saved. ${history.length} version${history.length === 1 ? " is" : "s are"} available.`);
    });
  }

  async function loadBackups() {
    try {
      setBackups(await browserVault.listDesktopBackups());
    } catch {
      setBackups([]);
    }
  }

  async function verifyBackup(backupId: string) {
    await run(async () => {
      await browserVault.verifyDesktopBackup(backupId);
      setBackups(await browserVault.listDesktopBackups());
      setMessage("Backup checked. Every encrypted file matches.");
    });
  }

  async function previewBackup(backupId: string) {
    await run(async () => {
      setRestorePreview(await browserVault.previewDesktopRestore(backupId));
      setRestoreConfirmation("");
      setMessage("Restore preview is ready. Nothing has been changed.");
    });
  }

  async function restoreBackup() {
    if (!restorePreview) return;
    await run(async () => {
      const result = await browserVault.restoreDesktopBackup(restorePreview.backupId, restoreConfirmation);
      await loadObjects();
      setBackups(await browserVault.listDesktopBackups());
      setRestorePreview(null);
      setRestoreConfirmation("");
      setMessage(`Recovery complete. ${result.restoredVersions} missing version${result.restoredVersions === 1 ? " was" : "s were"} added back.`);
    });
  }

  async function addMedia(file: File | undefined) {
    if (!file) return;
    await run(async () => {
      const result = await browserVault.addMedia(file, (phase, completed, total) => {
        const label = phase === "reading" ? "Checking" : phase === "encrypting" ? "Encrypting" : phase === "uploading" ? "Syncing" : "Saving";
        setMessage(`${label} ${file.name} — ${completed} of ${total}`);
      });
      await loadObjects();
      setActiveKind("media");
      await selectObject(result.snapshot);
      setMessage(result.cloudCached
        ? `${file.name} is encrypted and ready on your devices.`
        : result.desktopStored
          ? `${file.name} is encrypted on Windows. Other devices will receive it when encrypted sync finishes.`
          : `${file.name} is encrypted on this device. Sync will retry when storage is available.`);
    });
  }

  async function openMedia(snapshot: VaultObjectSnapshot) {
    await run(async () => {
      const opened = await browserVault.openMedia(snapshot, (completed, total) => setMessage(`Opening ${completed} of ${total} encrypted pieces…`));
      const url = URL.createObjectURL(opened.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = opened.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage(`${opened.fileName} is ready.`);
    });
  }

  async function refreshDevices() {
    await run(async () => {
      await browserVault.syncOnce();
      await browserVault.refreshDeviceStatuses();
      setMessage("Device status updated.");
    });
  }

  function stringField(snapshot: VaultObjectSnapshot, field: string): string {
    const value = snapshot.fields[field];
    return typeof value === "string" ? value : "";
  }

  async function selectObject(snapshot: VaultObjectSnapshot) {
    setSelectedObjectId(snapshot.objectId);
    setObjectDraft({
      title: stringField(snapshot, "title") || stringField(snapshot, "name") || stringField(snapshot, "fullName") || "Untitled",
      body: stringField(snapshot, "body") || stringField(snapshot, "description"),
      email: stringField(snapshot, "profile.email") || stringField(snapshot, "profile.primaryEmail"),
      phone: stringField(snapshot, "profile.phone") || stringField(snapshot, "profile.primaryPhone"),
      location: stringField(snapshot, "profile.livesIn"),
      url: stringField(snapshot, "url")
    });
    const history = await browserVault.history(snapshot.objectId);
    setObjectHistory(history);
    setSelectedVersionId(history[0]?.versionId || null);
    setRestoreArmed(false);
  }

  function newObject() {
    setSelectedObjectId(null);
    setObjectDraft({ title: "", body: "", email: "", phone: "", location: "", url: "" });
    setObjectHistory([]);
    setSelectedVersionId(null);
    setRestoreArmed(false);
  }

  async function saveLocalObject() {
    await run(async () => {
      const editingKind = selectedObjectId ? objects.find((item) => item.objectId === selectedObjectId)?.objectKind : activeKind;
      if (editingKind !== "note" && editingKind !== "contact" && editingKind !== "resource") throw new Error("Notes, contacts, and resources can be edited here. Other records are read-only in the Vault.");
      if (!objectDraft.title.trim()) throw new Error("Title or name is required");
      const fields: Record<string, VaultFieldValue> = {
        title: objectDraft.title.trim(),
        body: objectDraft.body || "",
        sourceModule: "vault"
      };
      if (editingKind === "contact") {
        fields["profile.primaryEmail"] = objectDraft.email || "";
        fields["profile.primaryPhone"] = objectDraft.phone || "";
        fields["profile.livesIn"] = objectDraft.location || "";
      }
      if (editingKind === "resource") fields.url = objectDraft.url || "";
      const saved = await browserVault.saveObject({
        ...(selectedObjectId ? { objectId: selectedObjectId } : {}),
        objectKind: editingKind,
        fields
      });
      setSelectedObjectId(saved.objectId);
      setObjectHistory(await browserVault.history(saved.objectId));
      await loadObjects();
      setMessage(`${recordKindLabel(editingKind)} saved. It will sync automatically.`);
    });
  }

  async function restoreSelectedVersion() {
    if (!selectedObjectId || !selectedVersionId) return;
    await run(async () => {
      const restored = await browserVault.restoreVersion(selectedObjectId, selectedVersionId);
      await loadObjects();
      await selectObject(restored);
      setRestoreArmed(false);
      setMessage("That saved version is now the latest. Every later version is still in history.");
    });
  }

  const deviceSnapshot = status?.devices.snapshot;
  const registeredDevices = deviceSnapshot?.devices || [];
  const currentDevices = deviceSnapshot
    ? registeredDevices.filter((device) => deviceSyncState(device, deviceSnapshot.relayHeadSequence).current).length
    : 0;
  const allDevicesCurrent = registeredDevices.length > 0 && currentDevices === registeredDevices.length;
  const onlineAuthorizationRequired = Boolean(status?.sync.authorizationRequired);
  const clock = status?.metadata?.clockHealth;
  const filteredObjects = useMemo(() => objects.filter((item) => {
    if (activeKind !== "all" && item.objectKind !== activeKind) return false;
    if (!recordQuery.trim()) return true;
    const haystack = JSON.stringify(item.fields).toLocaleLowerCase();
    return haystack.includes(recordQuery.trim().toLocaleLowerCase());
  }), [activeKind, objects, recordQuery]);
  const selectedObject = objects.find((item) => item.objectId === selectedObjectId) || null;
  const editorKind = selectedObject?.objectKind || activeKind;
  const canEditRecord = editorKind === "note" || editorKind === "contact" || editorKind === "resource";
  const selectedVersion = objectHistory.find((item) => item.versionId === selectedVersionId) || null;
  const selectedVersionFields = selectedVersion
    ? Object.fromEntries(Object.entries(selectedVersion.fields).filter(([field]) => !field.startsWith("__unigentamos")))
    : null;
  const selectedMediaManifest = selectedObject?.objectKind === "media" && selectedObject.fields.mediaManifest && typeof selectedObject.fields.mediaManifest === "object" && !Array.isArray(selectedObject.fields.mediaManifest)
    ? selectedObject.fields.mediaManifest as Record<string, VaultFieldValue>
    : null;
  const changedFields = selectedVersion && selectedObject
    ? Array.from(new Set([...Object.keys(selectedObject.fields), ...Object.keys(selectedVersion.fields)]))
      .filter((field) => !field.startsWith("__unigentamos") && JSON.stringify(selectedObject.fields[field]) !== JSON.stringify(selectedVersion.fields[field]))
    : [];
  const stateLabel = !status?.configured ? "Set up needed" : status.unlocked ? "Open" : "Locked";
  const networkLabel = onlineAuthorizationRequired ? "Sign in to sync"
    : status?.sync.state === "synced" ? "Up to date"
    : status?.sync.state === "retrying" ? "Trying again · your work is safe"
      : status?.sync.state === "offline" ? "Offline · your work is safe" : online ? "Checking for changes" : "Offline · your work is safe";
  const deviceCountLabel = !status?.unlocked ? "Unlock to check"
    : onlineAuthorizationRequired ? "Sign in to connect"
      : deviceSnapshot ? `${registeredDevices.length} connected` : "Checking";
  const clockLabel = clock?.state === "healthy" ? "Checked" : clock ? "Needs attention" : "Checking";
  const cards = useMemo(() => [
    ["Vault", stateLabel],
    ["Sync", networkLabel],
    ["Devices", deviceCountLabel],
    ["Time", clockLabel]
  ], [clockLabel, deviceCountLabel, networkLabel, stateLabel]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin" className={styles.brand}><span>U</span> Unigentamos</Link>
        <div><p>Private workspace</p><h1>Your vault</h1></div>
      </header>

      {status?.configured && <section className={styles.statusGrid} aria-label="Vault status">
        {cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>}

      {message && <p className={styles.notice} role="status">{message}</p>}

      {status?.configured && showReleaseNote && <aside className={styles.releaseNote} aria-label="What is new">
        <div><strong>Your history, files, and backups are ready.</strong><span>Open any record to browse or restore an older version. Media stays encrypted and downloads only when you open it.</span></div>
        <button type="button" onClick={dismissReleaseNote}>Got it</button>
      </aside>}

      {!status?.configured ? (
        <section className={styles.setupShell} aria-labelledby="setup-title">
          <div className={styles.setupIntro}>
            <p className={styles.eyebrow}>Set up this device</p>
            <h2 id="setup-title">Connect to your vault</h2>
            <p>Choose what you are using and follow the steps below.</p>
          </div>

          <div className={styles.devicePicker} role="tablist" aria-label="Device to set up">
            <button type="button" role="tab" aria-selected={setupTarget === "windows"} onClick={() => chooseSetupTarget("windows")}>
              <span className={styles.deviceIcon} aria-hidden="true">▦</span>
              <span><strong>Windows PC</strong><small>Set up or reconnect your main computer</small></span>
              <span className={styles.recommended}>Main</span>
            </button>
            <button type="button" role="tab" aria-selected={setupTarget === "apple"} onClick={() => chooseSetupTarget("apple")}>
              <span className={styles.deviceIcon} aria-hidden="true">◇</span>
              <span><strong>iPhone, iPad, or MacBook</strong><small>Connect to the vault from Windows</small></span>
            </button>
          </div>

          <div className={styles.syncNote}>
            <span aria-hidden="true">↻</span>
            <div><strong>Stay signed in to sync</strong><small>Your work stays on this device when you are offline and syncs when you are back online.</small></div>
            <Link href="/admin/login?next=%2Fvault">Sign in to sync</Link>
          </div>

          {setupTarget === "windows" ? (
            <article className={styles.setupCard} aria-labelledby="windows-setup-title">
              <div className={styles.deviceTrail} aria-label="Windows stores the main vault and syncs it to your other devices">
                <strong>Windows PC</strong><span>→</span><span>Your private vault</span><span>→</span><span>Other devices</span>
              </div>
              <div className={styles.setupHeading}>
                <div><p className={styles.eyebrow}>Main computer</p><h2 id="windows-setup-title">Set up this Windows PC</h2></div>
                <span className={`${styles.statusPill} ${status?.localCompanion.available ? styles.statusReady : styles.statusWaiting}`}>
                  {status?.localCompanion.available ? "Windows helper ready" : "Check Windows helper"}
                </span>
              </div>

              <div className={styles.setupStep}>
                <span className={styles.stepNumber}>1</span>
                <div>
                  <h3>Check the Windows helper</h3>
                  <p>This small app keeps your Vault and media files on this PC.</p>
                  <div className={styles.actionRow}>
                    <button type="button" className={styles.secondaryButton} disabled={checkingCompanion} onClick={checkCompanion}>{checkingCompanion ? "Checking…" : "Check connection"}</button>
                    <a className={styles.textButton} href={COMPANION_HELPER_URL} target="_blank" rel="noreferrer">Open pairing code ↗</a>
                  </div>
                  {!status?.localCompanion.available && <small>If your browser asks for local network access, choose Allow.</small>}
                </div>
              </div>

              {!status?.localCompanion.configured && <div className={styles.setupStep}>
                <span className={styles.stepNumber}>2</span>
                <div>
                  <h3>Enter the pairing code</h3>
                  <p>Open the pairing code above and enter the six digits shown there.</p>
                  <label>Six-digit code<input value={setupCode} onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="Enter the code" /></label>
                </div>
              </div>}

              <div className={styles.setupStep}>
                <span className={styles.stepNumber}>{status?.localCompanion.configured ? "2" : "3"}</span>
                <div>
                  <h3>{status?.localCompanion.configured ? "Connect this browser" : "Create your vault password"}</h3>
                  <p>{status?.localCompanion.configured ? "Your Vault is already on this PC. Enter its password to reconnect this browser." : "Use one memorable password with at least 14 characters. You will use it on every device."}</p>
                  <div className={styles.fieldPair}>
                    <label>Device name<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} autoComplete="off" /></label>
                    <label>Vault password<input type="password" autoComplete={status?.localCompanion.configured ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                  </div>
                  {status?.localCompanion.configured
                    ? <button className={styles.primaryButton} disabled={busy || password.length < 14} onClick={connectDesktop}>Connect this PC</button>
                    : <button className={styles.primaryButton} disabled={busy || !status?.localCompanion.available || setupCode.length !== 6 || password.length < 14} onClick={setupDesktop}>Create my vault</button>}
                </div>
              </div>
            </article>
          ) : (
            <article className={styles.setupCard} aria-labelledby="apple-setup-title">
              <div className={styles.deviceTrail} aria-label="Windows sends a recovery file to this device">
                <strong>Windows PC</strong><span>→</span><span>Recovery file</span><span>→</span><span>This device</span>
              </div>
              <div className={styles.setupHeading}>
                <div><p className={styles.eyebrow}>iPhone, iPad, or MacBook</p><h2 id="apple-setup-title">Connect this Apple device</h2></div>
                <span className={`${styles.statusPill} ${styles.statusReady}`}>No extra app needed</span>
              </div>

              <div className={styles.setupStep}>
                <span className={styles.stepNumber}>1</span>
                <div><h3>Get your recovery file</h3><p>On Windows, unlock the Vault and choose <strong>Download recovery file</strong> under Backup. Then send that file to this device.</p></div>
              </div>
              <div className={styles.setupStep}>
                <span className={styles.stepNumber}>2</span>
                <div>
                  <h3>Choose the file</h3>
                  <p>Find it in AirDrop, iCloud Drive, or the Files app.</p>
                  <label className={styles.filePicker}>
                    <input className={styles.fileInput} type="file" accept=".json,application/json" onChange={(event) => void loadRecoveryFile(event.currentTarget.files?.[0])} />
                    <span aria-hidden="true">⇧</span>
                    <strong>{recoveryFileName || "Choose recovery file"}</strong>
                    <small>{recoveryFileName ? "File ready" : "unigentamos-vault-recovery-….json"}</small>
                  </label>
                  <details className={styles.pasteFallback}>
                    <summary>Paste the file contents instead</summary>
                    <label>Recovery file contents<textarea value={recoveryText} onChange={(event) => { setRecoveryText(event.target.value); setRecoveryFileName(""); }} rows={6} spellCheck={false} /></label>
                  </details>
                </div>
              </div>
              <div className={styles.setupStep}>
                <span className={styles.stepNumber}>3</span>
                <div>
                  <h3>Enter your vault password</h3>
                  <p>Use the same password as Windows.</p>
                  <div className={styles.fieldPair}>
                    <label>Device name<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} autoComplete="off" /></label>
                    <label>Vault password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                  </div>
                  <button className={styles.primaryButton} disabled={busy || !recoveryText.trim() || password.length < 14} onClick={joinDevice}>Connect this device</button>
                </div>
              </div>

              <aside className={styles.appleNote}>
                <strong>Add it to your Home Screen</strong>
                <span>On iPhone or iPad, open Share and choose Add to Home Screen. Open the new icon and connect it with the same recovery file. Your text stays available offline; large media stays on Windows until you need it.</span>
              </aside>
            </article>
          )}

          <aside className={styles.privacyNote}>
            <strong>What stays private</strong>
            <span>Your password stays on your device. Your data is encrypted before it leaves.</span>
          </aside>
        </section>
      ) : !status.unlocked ? (
        <section className={`${styles.panel} ${styles.unlock}`}>
          <p className={styles.eyebrow}>Welcome back</p>
          <h2>Unlock your vault</h2>
          <p>Enter your vault password to open this device. It is not saved after you lock the Vault.</p>
          <label>Vault password<input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && password.length >= 14) void unlock(); }} /></label>
          <button disabled={busy || password.length < 14} onClick={unlock}>Unlock vault</button>
          <aside className={styles.unlockDeviceHint}><strong>Your connected devices</strong><span>Unlock to check Windows, iPhone, iPad, and MacBook.</span></aside>
        </section>
      ) : (
        <>
          {onlineAuthorizationRequired && <section className={styles.syncSignIn} role="status" aria-labelledby="vault-sync-sign-in-title">
            <div>
              <p className={styles.eyebrow}>Online sync is paused</p>
              <h2 id="vault-sync-sign-in-title">Sign in to connect this browser</h2>
              <p>Your Vault is open and your local work is safe. Use your normal Unigentamos sign-in password, then return here and unlock the Vault once more.</p>
              <small>Brave, Dia, Safari, and Home Screen apps each keep their own sign-in. Sign in once in every browser or app you want to sync.</small>
            </div>
            <Link className={styles.signInButton} href="/admin/login?next=%2Fvault">Sign in to sync</Link>
          </section>}

          {!onlineAuthorizationRequired && <section className={`${styles.panel} ${styles.devicesPanel}`} aria-labelledby="devices-sync-title">
            <div className={styles.devicesHeader}>
              <div>
                <p className={styles.eyebrow}>Your devices</p>
                <h2 id="devices-sync-title">{allDevicesCurrent ? "Everything is up to date" : deviceSnapshot ? `${currentDevices} of ${registeredDevices.length} devices are up to date` : "Checking your devices…"}</h2>
                <p>Open the Vault on any device that needs to catch up.</p>
              </div>
              <button disabled={busy || !online} onClick={refreshDevices}>Check now</button>
            </div>
            {status.devices.lastError && <p className={styles.deviceError} role="status">We could not check your devices. Your saved work is safe. Try again.</p>}
            {deviceSnapshot && registeredDevices.length > 0 ? (
              <div className={styles.deviceList} role="list" aria-label="Connected vault devices">
                {registeredDevices.map((device) => {
                  const deviceState = deviceSyncState(device, deviceSnapshot.relayHeadSequence);
                  const isThisDevice = device.deviceId === status.metadata?.deviceId;
                  const deviceToneClass = {
                    current: styles.deviceBadgeCurrent,
                    pending: styles.deviceBadgePending,
                    attention: styles.deviceBadgeAttention,
                    inactive: styles.deviceBadgeInactive
                  }[deviceState.tone];
                  return (
                    <article className={styles.deviceCard} role="listitem" key={device.deviceId}>
                      <div className={styles.deviceCardTop}>
                        <div>
                          <strong>{device.descriptor.deviceName}</strong>
                          <span>{deviceKindLabel(device)}{isThisDevice ? " · This device" : ""}</span>
                        </div>
                        <span className={`${styles.deviceBadge} ${deviceToneClass}`}>{deviceState.label}</span>
                      </div>
                      <p>{deviceState.detail}</p>
                      <dl>
                        <div><dt>Last connected</dt><dd>{relativeTime(device.lastSeenAt)}</dd></div>
                        <div><dt>Last up to date</dt><dd>{relativeTime(device.lastSyncedAt)}</dd></div>
                        <div><dt>Changes received</dt><dd>{device.acknowledgedSequence.toLocaleString()} of {deviceSnapshot.relayHeadSequence.toLocaleString()}</dd></div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.deviceEmpty}>
                <strong>{online ? "Waiting for your devices" : "Go online to check your devices"}</strong>
                <span>Open the Vault once on each device. It will appear here when it syncs.</span>
              </div>
            )}
            <small>Each browser or Home Screen app counts as its own device.</small>
          </section>}

          <section className={styles.grid}>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>Bring in your current data</p>
              <h2>Add your Unigentamos workspace</h2>
              <p>Copy your existing notes, people, resources, projects, and other records into the Vault. Nothing in your current workspace is changed or deleted.</p>
              <button disabled={busy || !online} onClick={importWorkspace}>Add current workspace</button>
              <small>Finance CSV previews are skipped. Raw CSV files are never saved.</small>
            </article>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>Backup</p>
              <h2>Keep a checked recovery copy</h2>
              <div className={styles.buttonRow}>
                <button disabled={busy} onClick={exportRecovery}>Download recovery file</button>
                <button disabled={busy || !status.localCompanion.available} onClick={createBackup}>Back up this PC</button>
              </div>
              <small>The recovery file connects a device. A PC backup contains your encrypted history and media. Keep both somewhere separate from your password.</small>
              {backups.length > 0 && <div className={styles.backupList}>
                {backups.map((backup) => <div key={backup.backupId}>
                  <span><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{backup.verified ? "Checked" : "Needs checking"} · {backup.mediaFiles} file{backup.mediaFiles === 1 ? "" : "s"} · {formatBytes(backup.databaseBytes + backup.mediaBytes)}</small></span>
                  <span className={styles.inlineActions}>
                    <button disabled={busy} onClick={() => void verifyBackup(backup.backupId)}>Check</button>
                    <button disabled={busy} onClick={() => void previewBackup(backup.backupId)}>Restore</button>
                  </span>
                </div>)}
              </div>}
            </article>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>Encrypted media</p>
              <h2>Add a file</h2>
              <p>Photos, videos, audio, and documents are encrypted here first. Windows keeps the main copy. Other devices download an encrypted copy only when you open it.</p>
              <label className={styles.filePicker}>
                <input className={styles.fileInput} type="file" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void addMedia(file); }} />
                <span aria-hidden="true">+</span>
                <strong>Choose a file</strong>
                <small>Up to 256 MB per file</small>
              </label>
            </article>
          </section>

          <section className={styles.panel}>
            <p className={styles.eyebrow}>Version history</p>
            <h2>Try a note</h2>
            <p>Every save creates a version you can return to. Changes to different fields merge automatically. If the same field changes on two devices, the newest one wins and the other stays in history.</p>
            <textarea value={journal} onChange={(event) => setJournal(event.target.value)} rows={8} placeholder="Write here, save, then keep editing to create history…" />
            <div className={styles.buttonRow}><button disabled={busy} onClick={saveJournal}>Save version</button><span>{historyCount ? `${historyCount} saved version${historyCount === 1 ? "" : "s"}` : "No versions saved yet"}</span></div>
          </section>

          {restorePreview && <section className={`${styles.panel} ${styles.restorePanel}`} aria-labelledby="restore-preview-title">
            <div>
              <p className={styles.eyebrow}>Restore preview</p>
              <h2 id="restore-preview-title">Add missing data from this backup</h2>
              <p>This adds back missing encrypted versions and files. It does not replace newer work.</p>
            </div>
            <dl>
              <div><dt>Versions to add back</dt><dd>{restorePreview.restorableVersions.toLocaleString()}</dd></div>
              <div><dt>Files to add back</dt><dd>{restorePreview.restorableMediaFiles.toLocaleString()}</dd></div>
              <div><dt>Backup size</dt><dd>{formatBytes(restorePreview.databaseBytes + restorePreview.mediaBytes)}</dd></div>
            </dl>
            <label>Type <strong>{`RESTORE ${restorePreview.backupId.slice(-8).toUpperCase()}`}</strong> to continue<input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} autoComplete="off" /></label>
            <div className={styles.buttonRow}>
              <button disabled={busy || restoreConfirmation !== `RESTORE ${restorePreview.backupId.slice(-8).toUpperCase()}`} onClick={restoreBackup}>Restore missing data</button>
              <button className={styles.quietButton} onClick={() => { setRestorePreview(null); setRestoreConfirmation(""); }}>Cancel</button>
            </div>
          </section>}

          <section className={`${styles.panel} ${styles.objectWorkspace}`}>
            <div className={styles.workspaceHeader}>
              <div><p className={styles.eyebrow}>Saved on this device</p><h2>All records and version history</h2><p>Browse every saved record. Restoring an older version makes a new latest copy; nothing in history is removed.</p></div>
              {(activeKind === "note" || activeKind === "contact" || activeKind === "resource") && <button onClick={newObject}>New {recordKindLabel(activeKind).toLowerCase()}</button>}
            </div>
            <label className={styles.recordSearch}>Search records<input type="search" value={recordQuery} onChange={(event) => setRecordQuery(event.target.value)} placeholder="Search titles, names, and saved details" /></label>
            <div className={styles.kindTabs} role="tablist" aria-label="Vault object kinds">
              {RECORD_TABS.map((tab) => (
                <button key={tab.value} role="tab" aria-selected={activeKind === tab.value} onClick={() => { setActiveKind(tab.value); newObject(); }}>{tab.label}</button>
              ))}
            </div>
            <div className={styles.objectGrid}>
              <aside className={styles.objectList} aria-label="Saved records">
                {filteredObjects.map((item) => (
                  <button key={item.objectId} data-selected={selectedObjectId === item.objectId} onClick={() => void selectObject(item)}>
                    <strong>{stringField(item, "title") || stringField(item, "name") || "Untitled"}</strong>
                    <span>{recordKindLabel(item.objectKind)} · {new Date(item.updatedAt).toLocaleString()}</span>
                  </button>
                ))}
                {!filteredObjects.length && <p>No matching records on this device yet.</p>}
              </aside>
              <div className={styles.objectEditor}>
                {canEditRecord ? <>
                <label>{editorKind === "contact" ? "Name" : "Title"}<input value={objectDraft.title || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                {editorKind === "contact" && <div className={styles.fieldGrid}>
                  <label>Email<input type="email" value={objectDraft.email || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>Phone<input value={objectDraft.phone || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                  <label>Location<input value={objectDraft.location || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, location: event.target.value }))} /></label>
                </div>}
                {editorKind === "resource" && <label>URL<input type="url" value={objectDraft.url || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, url: event.target.value }))} /></label>}
                <label>{editorKind === "note" ? "Note" : "Context"}<textarea rows={10} value={objectDraft.body || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, body: event.target.value }))} /></label>
                <div className={styles.buttonRow}><button disabled={busy} onClick={saveLocalObject}>Save version</button><span>{status.sync.state === "synced" ? "Up to date" : "Saved here · will sync when connected"}</span></div>
                </> : selectedObject ? <div className={styles.readOnlyRecord}>
                  <span className={styles.recordType}>{recordKindLabel(selectedObject.objectKind)}</span>
                  <h3>{stringField(selectedObject, "title") || stringField(selectedObject, "name") || "Untitled"}</h3>
                  <p>This record is read-only here. You can still browse and restore every saved version.</p>
                  {selectedObject.objectKind === "media" && <button disabled={busy} onClick={() => void openMedia(selectedObject)}>Open file</button>}
                  {selectedMediaManifest ? <dl className={styles.recordFields}>
                    <div><dt>File size</dt><dd>{formatBytes(Number(selectedMediaManifest.byteLength || 0))}</dd></div>
                    <div><dt>Added</dt><dd>{new Date(String(selectedMediaManifest.createdAt)).toLocaleString()}</dd></div>
                    <div><dt>Availability</dt><dd>Encrypted · downloads when opened</dd></div>
                  </dl> : <dl className={styles.recordFields}>
                    {humanFields(selectedObject.fields).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}
                  </dl>}
                </div> : <div className={styles.editorEmpty}><strong>Choose a record</strong><span>Select an item to see its details and full history.</span></div>}
              </div>
              <aside className={styles.historyList} aria-label="Version history">
                <div className={styles.historyHeading}><h3>Version history</h3>{objectHistory.length > 0 && <span>{objectHistory.length} saved</span>}</div>
                {objectHistory.map((version, index) => <button type="button" key={version.versionId} data-selected={selectedVersionId === version.versionId} onClick={() => { setSelectedVersionId(version.versionId); setRestoreArmed(false); }}>
                  <strong>{index === 0 ? "Current · " : ""}{new Date(version.updatedAt).toLocaleString()}</strong>
                  <span>{version.restoredFromVersionId ? "Restored copy" : String(version.fields.body || version.fields.title || "Version saved").slice(0, 100)}</span>
                </button>)}
                {!objectHistory.length && <p>Select an item to see its saved history.</p>}
                {selectedVersion && <div className={styles.versionPreview}>
                  <div><strong>{new Date(selectedVersion.updatedAt).toLocaleString()}</strong><span>{changedFields.length ? `${changedFields.length} field${changedFields.length === 1 ? "" : "s"} differ from today` : "Same as today"}</span></div>
                  {changedFields.length > 0 && <p>{changedFields.slice(0, 8).join(", ")}{changedFields.length > 8 ? "…" : ""}</p>}
                  {selectedVersionFields && <dl className={styles.recordFields}>
                    {humanFields(selectedVersionFields).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}
                  </dl>}
                  {selectedObject && selectedVersion.versionId !== selectedObject.versionId && (restoreArmed ? <div className={styles.restoreConfirm}>
                    <strong>Make this the latest version?</strong>
                    <span>The current version will stay in history.</span>
                    <div className={styles.inlineActions}><button disabled={busy} onClick={restoreSelectedVersion}>Yes, restore it</button><button className={styles.quietButton} onClick={() => setRestoreArmed(false)}>Cancel</button></div>
                  </div> : <button disabled={busy} onClick={() => setRestoreArmed(true)}>Restore this version</button>)}
                </div>}
              </aside>
            </div>
          </section>

          <section className={styles.metrics}>
            <div><strong>{status.diagnostics.objects}</strong><span>items on this device</span></div>
            <div><strong>{status.diagnostics.versions}</strong><span>saved versions</span></div>
            <div><strong>{status.diagnostics.outbox}</strong><span>waiting to sync</span></div>
            <div><strong>{status.diagnostics.conflicts}</strong><span>saved conflicts</span></div>
          </section>
          <button className={styles.lock} onClick={() => { browserVault.lock(); void refresh(); }}>Lock vault</button>
        </>
      )}
    </main>
  );
}
