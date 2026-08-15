"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  VaultMediaCacheRetentionDays,
  VaultObjectKind,
  VaultObjectSnapshot,
  VaultRecoveryPackage
} from "../lib/local-first/types";
import { readCanonicalMetadata, type VaultEditableField } from "../lib/local-first/canonical-record";
import {
  findVaultRelationshipTargets,
  buildVaultSearchIndex,
  searchVaultRecords,
  vaultRecordLabel,
  vaultRecordOption,
  vaultRelationshipsFor
} from "../lib/local-first/vault-record-tools";
import styles from "./VaultWorkspace.module.css";

type VaultStatus = Awaited<ReturnType<typeof browserVault.status>>;
type BootstrapObject = { canonicalId: string; objectKind: VaultObjectKind; fields: Record<string, VaultFieldValue> };
type SetupTarget = "windows" | "apple";
type EditorDraftValue = string | boolean;
type SavedVaultSearch = { id: string; label: string; query: string; kind: VaultObjectKind | "all" };
type MediaPreview = { url: string; mimeType: string; fileName: string };

const COMPANION_HELPER_URL = "http://127.0.0.1:43127/";
const MAX_RECOVERY_FILE_BYTES = 256 * 1024;
const VAULT_RELEASE_NOTE = "offline-command-center-v5";
const RECORD_PAGE_SIZE = 80;
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

const EDITOR_GROUPS: VaultEditableField["group"][] = ["Essentials", "Details", "Planning", "Classification"];

function draftValueForField(fields: Record<string, VaultFieldValue>, field: VaultEditableField): EditorDraftValue {
  const value = fields[field.key];
  if (field.control === "checkbox") return value === true;
  if (field.control === "tags") return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" || typeof item === "number").join(", ")
    : "";
  if (field.control === "date" && typeof value === "string") return value.slice(0, 10);
  if (field.control === "month" && typeof value === "string") return value.slice(0, 7);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function editorDraft(fields: Record<string, VaultFieldValue>, editableFields: readonly VaultEditableField[]): Record<string, EditorDraftValue> {
  return Object.fromEntries(editableFields.map((field) => [field.key, draftValueForField(fields, field)]));
}

function draftText(draft: Record<string, EditorDraftValue>, key: string): string {
  const value = draft[key];
  return typeof value === "string" ? value : "";
}

function draftValueForSave(field: VaultEditableField, draft: EditorDraftValue | undefined): VaultFieldValue {
  if (field.control === "checkbox") return draft === true;
  const value = typeof draft === "string" ? draft : "";
  if (field.control === "number") {
    const number = Number(value);
    if (!value.trim() || !Number.isFinite(number)) throw new Error(`${field.label} must be a number`);
    return number;
  }
  if (field.control === "tags") {
    return Array.from(new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)));
  }
  return value;
}

function editorIsDirty(draft: Record<string, EditorDraftValue>, baseline: Record<string, EditorDraftValue>): boolean {
  const keys = new Set([...Object.keys(draft), ...Object.keys(baseline)]);
  return Array.from(keys).some((key) => draft[key] !== baseline[key]);
}

function editorPatch(
  fields: readonly VaultEditableField[],
  draft: Record<string, EditorDraftValue>,
  baseline: Record<string, EditorDraftValue>
): Record<string, VaultFieldValue> {
  const patch: Record<string, VaultFieldValue> = {};
  for (const field of fields) {
    if (draft[field.key] === baseline[field.key]) continue;
    const value = draftValueForSave(field, draft[field.key]);
    if (field.required && typeof value === "string" && !value.trim()) throw new Error(`${field.label} is required`);
    patch[field.key] = value;
  }
  return patch;
}

function relationshipLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/Refs?$/i, "").replace(/^./, (letter) => letter.toUpperCase());
}

function readSavedSearches(snapshot: VaultObjectSnapshot | undefined): SavedVaultSearch[] {
  const value = snapshot?.fields.savedSearches;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SavedVaultSearch => Boolean(
    item && typeof item === "object" && !Array.isArray(item)
    && typeof item.id === "string"
    && typeof item.label === "string"
    && typeof item.query === "string"
    && typeof item.kind === "string"
    && RECORD_TABS.some((tab) => tab.value === item.kind)
  )).slice(0, 24);
}

function canPreviewMedia(mimeType: string): boolean {
  return /^(image|audio|video|text)\//.test(mimeType) || mimeType === "application/pdf";
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
    return {
      label: "Needs a safe merge",
      detail: `${device.blockedChanges} saved change${device.blockedChanges === 1 ? " is" : "s are"} waiting to be merged. Open and unlock the Vault on this device; nothing was deleted.`,
      tone: "attention",
      current: false
    };
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

export default function VaultWorkspace({
  initialSearch = "",
  initialKind = "all",
  focusSearch = false
}: {
  initialSearch?: string;
  initialKind?: VaultObjectKind | "all";
  focusSearch?: boolean;
}) {
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
  const [activeKind, setActiveKind] = useState<VaultObjectKind | "all">(initialKind);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [objectDraft, setObjectDraft] = useState<Record<string, EditorDraftValue>>({ title: "", body: "" });
  const [objectDraftBaseline, setObjectDraftBaseline] = useState<Record<string, EditorDraftValue>>({ title: "", body: "" });
  const [objectHistory, setObjectHistory] = useState<VaultObjectSnapshot[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreArmed, setRestoreArmed] = useState(false);
  const [recordQuery, setRecordQuery] = useState(initialSearch);
  const deferredRecordQuery = useDeferredValue(recordQuery);
  const [recordResultLimit, setRecordResultLimit] = useState(RECORD_PAGE_SIZE);
  const [backups, setBackups] = useState<VaultBackupSummary[]>([]);
  const [restorePreview, setRestorePreview] = useState<VaultBackupRestorePreview | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [showReleaseNote, setShowReleaseNote] = useState(false);
  const [retireArmedDeviceId, setRetireArmedDeviceId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [relationshipTargetId, setRelationshipTargetId] = useState("");
  const [relationshipQuery, setRelationshipQuery] = useState("");
  const [relationshipKind, setRelationshipKind] = useState("reference");
  const [connectionEditId, setConnectionEditId] = useState<string | null>(null);
  const [connectionEditKind, setConnectionEditKind] = useState("reference");
  const [connectionEditReason, setConnectionEditReason] = useState("");
  const [actionArmed, setActionArmed] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const workspaceRefreshStarted = useRef(false);
  const recordSearchRef = useRef<HTMLInputElement>(null);
  const hasUnsavedRecordChanges = editorIsDirty(objectDraft, objectDraftBaseline);

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
    refresh().then(() => setMessage((current) => current === "Checking this device…" ? "" : current)).catch(() => setMessage("We could not check this device. Try again."));
    const handleOnline = () => { setOnline(navigator.onLine); void browserVault.syncOnce().finally(refresh); };
    const handleVaultDataChanged = () => { void Promise.all([loadObjects(), refresh()]); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    window.addEventListener("unigentamos-vault-data-changed", handleVaultDataChanged);
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
      window.removeEventListener("unigentamos-vault-data-changed", handleVaultDataChanged);
    };
  }, [loadObjects, refresh]);

  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedRecordChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasUnsavedRecordChanges]);

  useEffect(() => {
    setRecordResultLimit(RECORD_PAGE_SIZE);
  }, [activeKind, deferredRecordQuery]);

  useEffect(() => {
    if (!focusSearch) return;
    window.requestAnimationFrame(() => recordSearchRef.current?.focus());
  }, [focusSearch]);

  useEffect(() => () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.url);
  }, [mediaPreview]);

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

  async function run(action: () => Promise<void>, options: { clearMessage?: boolean } = {}) {
    setBusy(true);
    if (options.clearMessage !== false) setMessage("");
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

  async function importWorkspace(quiet = false) {
    await run(async () => {
      const response = await fetch("/api/vault/bootstrap", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; objects?: BootstrapObject[]; error?: string };
      if (response.status === 401) throw new Error(VAULT_ONLINE_SIGN_IN_MESSAGE);
      if (!response.ok || !payload.ok || !payload.objects) throw new Error(payload.error || "We could not refresh your workspace. Try again.");
      let changed = 0;
      for (const item of payload.objects) {
        const objectId = await deterministicVaultObjectId(item.canonicalId);
        const mirrored = await browserVault.mirrorCanonicalObject({
          objectId,
          objectKind: item.objectKind,
          fields: item.fields
        });
        if (mirrored.changed) changed += 1;
        if (!quiet && changed > 0 && changed % 10 === 0) setMessage(`Adding ${changed} items to the Vault…`);
      }
      await browserVault.syncUntilSettled();
      await loadObjects();
      if (!quiet) setMessage(changed ? `Updated ${changed} item${changed === 1 ? "" : "s"} from your workspace.` : "Your Vault already has the latest workspace data.");
    }, { clearMessage: !quiet });
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

  async function previewMedia(snapshot: VaultObjectSnapshot) {
    await run(async () => {
      const opened = await browserVault.openMedia(snapshot, (completed, total) => setMessage(`Preparing preview ${completed} of ${total}â€¦`));
      const url = URL.createObjectURL(opened.blob);
      setMediaPreview({ url, mimeType: opened.blob.type || "application/octet-stream", fileName: opened.fileName });
      setMessage(`${opened.fileName} is open locally. Its decrypted preview was not uploaded.`);
    });
  }

  async function persistSavedSearches(searches: SavedVaultSearch[]) {
    await run(async () => {
      const objectId = savedSearchObject?.objectId || await deterministicVaultObjectId("vault:saved-searches:v1");
      await browserVault.saveObject({
        objectId,
        objectKind: "settings",
        fields: {
          title: "Saved searches",
          settingsKind: "saved-searches",
          savedSearches: searches as unknown as VaultFieldValue
        }
      });
      await loadObjects();
      setMessage("Saved searches updated across your Vault devices.");
    });
  }

  async function saveCurrentSearch() {
    const query = recordQuery.trim();
    if (!query) {
      setMessage("Type something to search before saving it.");
      recordSearchRef.current?.focus();
      return;
    }
    if (savedSearches.some((item) => item.query.toLocaleLowerCase() === query.toLocaleLowerCase() && item.kind === activeKind)) {
      setMessage("That search is already saved.");
      return;
    }
    const kindLabel = RECORD_TABS.find((tab) => tab.value === activeKind)?.label || "All";
    await persistSavedSearches([...savedSearches, {
      id: crypto.randomUUID(),
      label: `${query} · ${kindLabel}`,
      query,
      kind: activeKind
    }].slice(-24));
  }

  async function refreshDevices() {
    await run(async () => {
      await browserVault.syncUntilSettled();
      await browserVault.refreshDeviceStatuses();
      setMessage("Device status updated.");
    });
  }

  async function protectStorage() {
    await run(async () => {
      const persisted = await browserVault.protectLocalStorage();
      setMessage(persisted
        ? "This browser will keep your Vault data available offline."
        : "This browser manages offline storage automatically. Keep some free space on this device.");
    });
  }

  async function setMediaRetention(retentionDays: VaultMediaCacheRetentionDays) {
    await run(async () => {
      await browserVault.setMediaCacheRetention(retentionDays);
      setMessage(retentionDays === null
        ? "Downloaded files will stay on this device until you clean them up."
        : "Downloaded files unused for " + retentionDays + " days can be cleaned up automatically.");
    });
  }

  async function cleanupMedia() {
    await run(async () => {
      const result = await browserVault.cleanupMediaCache();
      setMessage(result.deletedChunks
        ? "Freed " + formatBytes(result.reclaimedBytes) + " from this device. Original encrypted files are still safe on Windows."
        : "Downloaded media is already tidy. Nothing was removed.");
    });
  }

  async function cleanupRelay() {
    await run(async () => {
      const result = await browserVault.cleanupRelayNow();
      await browserVault.refreshDeviceStatuses();
      setMessage(result.outcome === "compacted"
        ? `Encrypted sync storage cleaned up. ${result.deletedChanges.toLocaleString()} redundant update${result.deletedChanges === 1 ? " was" : "s were"} removed; your meaningful history is still available.`
        : result.outcome === "devices_not_caught_up"
          ? "Cleanup is waiting until every active device is caught up. Nothing was removed."
          : "Sync storage is already tidy. Nothing needed to be removed.");
    });
  }

  async function retireDevice(deviceId: string) {
    if (retireArmedDeviceId !== deviceId) {
      setRetireArmedDeviceId(deviceId);
      return;
    }
    await run(async () => {
      await browserVault.retireDevice(deviceId);
      setRetireArmedDeviceId(null);
      setMessage("Old device removed from sync. Its local copy was not erased.");
    });
  }
  async function repairSyncIssues() {
    await run(async () => {
      const result = await browserVault.repairSyncIssues();
      await loadObjects();
      setMessage(result.remaining === 0
        ? "Sync fixed. Both versions are saved in history and your devices can catch up."
        : "That change is still protected. Nothing was overwritten; keep this device open while the Vault checks it again.");
    });
  }

  useEffect(() => {
    if (!status?.unlocked || !online || workspaceRefreshStarted.current) return;
    workspaceRefreshStarted.current = true;
    void importWorkspace(true).catch(() => { workspaceRefreshStarted.current = false; });
    // The workspace refresh intentionally runs once per unlocked page session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, status?.unlocked]);

  function stringField(snapshot: VaultObjectSnapshot, field: string): string {
    const value = snapshot.fields[field];
    return typeof value === "string" ? value : "";
  }

  async function selectObject(snapshot: VaultObjectSnapshot, skipDiscardCheck = false): Promise<boolean> {
    if (
      !skipDiscardCheck
      && snapshot.objectId !== selectedObjectId
      && hasUnsavedRecordChanges
      && !window.confirm("Discard the unsaved changes to this record?")
    ) return false;
    setMediaPreview(null);
    setSelectedObjectId(snapshot.objectId);
    const metadata = readCanonicalMetadata(snapshot.fields);
    const nextDraft = metadata?.editableFields.length
      ? editorDraft(snapshot.fields, metadata.editableFields)
      : {
          title: stringField(snapshot, "title") || stringField(snapshot, "name") || stringField(snapshot, "fullName") || "Untitled",
          body: stringField(snapshot, "body") || stringField(snapshot, "description"),
          email: stringField(snapshot, "profile.primaryEmail"),
          phone: stringField(snapshot, "profile.phoneNumber"),
          location: stringField(snapshot, "profile.livesIn"),
          url: stringField(snapshot, "url")
        };
    setObjectDraft(nextDraft);
    setObjectDraftBaseline(nextDraft);
    const history = await browserVault.history(snapshot.objectId);
    setObjectHistory(history);
    setSelectedVersionId(history[0]?.versionId || null);
    setRestoreArmed(false);
    setActionReason("");
    setRelationshipTargetId("");
    setRelationshipQuery("");
    setRelationshipKind("reference");
    setConnectionEditId(null);
    setConnectionEditKind("reference");
    setConnectionEditReason("");
    setActionArmed(null);
    return true;
  }

  function newObject(): boolean {
    if (hasUnsavedRecordChanges && !window.confirm("Discard the unsaved changes to this record?")) return false;
    setMediaPreview(null);
    setSelectedObjectId(null);
    const nextDraft = { title: "", body: "", email: "", phone: "", location: "", url: "" };
    setObjectDraft(nextDraft);
    setObjectDraftBaseline(nextDraft);
    setObjectHistory([]);
    setSelectedVersionId(null);
    setRestoreArmed(false);
    setActionReason("");
    setRelationshipTargetId("");
    setRelationshipQuery("");
    setRelationshipKind("reference");
    setConnectionEditId(null);
    setConnectionEditKind("reference");
    setConnectionEditReason("");
    setActionArmed(null);
    return true;
  }

  async function queueOwnerAction(ownerAction: Parameters<typeof browserVault.queueCanonicalOwnerAction>[1], success: string) {
    if (!selectedObject) return;
    await run(async () => {
      const queued = await browserVault.queueCanonicalOwnerAction(selectedObject, ownerAction);
      if (online) await browserVault.syncUntilSettled();
      const next = (await browserVault.listObjects()).find((item) => item.objectId === queued.objectId) || queued;
      setObjects(await browserVault.listObjects());
      await selectObject(next);
      setActionArmed(null);
      setMessage(online ? success : success + " It will reach the full module when you reconnect.");
    });
  }

  async function queueLifecycleAction(action: "archive" | "restore") {
    if (action === "archive" && !actionReason.trim()) {
      setMessage("Add a short reason before archiving this record.");
      return;
    }
    if (actionArmed !== action) {
      setActionArmed(action);
      return;
    }
    await queueOwnerAction(action === "archive" ? { name: "archive", reason: actionReason.trim() } : { name: "restore" }, action === "archive" ? "Archived safely." : "Restored safely.");
  }

  async function queueRelationship() {
    if (!relationshipTarget) {
      setMessage("Choose a record to connect first.");
      return;
    }
    await queueOwnerAction({ name: "link", target: { canonicalId: relationshipTargetId, label: relationshipTarget.label }, relationship: relationshipKind }, "Connected to " + relationshipTarget.label + ".");
  }

  async function queueLinkManagement(action: "unlink" | "relabel" | "repair", linkId: string) {
    const target = action === "repair" ? relationshipTarget : null;
    if (action === "repair" && !target) {
      setMessage("Choose the replacement record in Search and connect first.");
      return;
    }
    if ((action === "unlink" || action === "repair") && !connectionEditReason.trim()) {
      setMessage(`Add a short ${action === "unlink" ? "unlink" : "repair"} reason first.`);
      return;
    }
    await queueOwnerAction({
      name: "manage_link",
      linkId,
      action,
      ...(action === "relabel" ? { relationship: connectionEditKind } : {}),
      ...(target ? { target: { canonicalId: target.canonicalId, label: target.label } } : {}),
      ...(connectionEditReason.trim() ? { reason: connectionEditReason.trim() } : {})
    }, action === "unlink" ? "Link removed without deleting either record." : action === "repair" ? "Link repaired." : "Link label updated.");
    setConnectionEditId(null);
    setConnectionEditReason("");
  }

  async function queueFinanceAction(action: string, input: Record<string, VaultFieldValue>, success: string) {
    await queueOwnerAction({ name: "finance_action", action, input }, success);
  }

  async function saveLocalObject() {
    await run(async () => {
      const selected = selectedObjectId ? objects.find((item) => item.objectId === selectedObjectId) : null;
      const editingKind = selected?.objectKind || activeKind;
      let saved: VaultObjectSnapshot;
      if (selected) {
        const metadata = readCanonicalMetadata(selected.fields);
        if (metadata?.editableFields.length) {
          const patch = editorPatch(metadata.editableFields, objectDraft, objectDraftBaseline);
          if (!Object.keys(patch).length) {
            setMessage("No changes to save.");
            return;
          }
          saved = await browserVault.saveCanonicalFields(selected, patch);
        } else {
          if (editingKind !== "note" && editingKind !== "contact" && editingKind !== "resource") throw new Error("Open the full module view to change this item.");
          if (!draftText(objectDraft, "title").trim()) throw new Error("Title or name is required");
          saved = await browserVault.saveObject({
            objectId: selected.objectId,
            objectKind: editingKind,
            fields: { title: draftText(objectDraft, "title").trim(), body: draftText(objectDraft, "body") }
          });
        }
      } else {
        if (editingKind !== "note" && editingKind !== "contact" && editingKind !== "resource") throw new Error("Choose Notes, Contacts, or Resources to add a record here.");
        if (!draftText(objectDraft, "title").trim()) throw new Error("Title or name is required");
        const fields: Record<string, VaultFieldValue> = {
          title: draftText(objectDraft, "title").trim(),
          body: draftText(objectDraft, "body")
        };
        if (editingKind === "contact") {
          fields["profile.primaryEmail"] = draftText(objectDraft, "email");
          fields["profile.phoneNumber"] = draftText(objectDraft, "phone");
          fields["profile.livesIn"] = draftText(objectDraft, "location");
        }
        if (editingKind === "resource") fields.url = draftText(objectDraft, "url");
        saved = await browserVault.createCanonicalPersonalRecord(
          editingKind === "contact" ? "person" : editingKind, editingKind, fields
        );
      }
      const savedMetadata = readCanonicalMetadata(saved.fields);
      const nextDraft = savedMetadata?.editableFields.length
        ? editorDraft(saved.fields, savedMetadata.editableFields)
        : objectDraft;
      setObjectDraft(nextDraft);
      setObjectDraftBaseline(nextDraft);
      setSelectedObjectId(saved.objectId);
      setObjectHistory(await browserVault.history(saved.objectId));
      await loadObjects();
      setMessage(online ? "Saved. The full module will update automatically." : "Saved on this device. It will update the full module when you reconnect.");
    });
  }

  async function restoreSelectedVersion() {
    if (!selectedObjectId || !selectedVersionId) return;
    await run(async () => {
      const restored = await browserVault.restoreVersion(selectedObjectId, selectedVersionId);
      await loadObjects();
      await selectObject(restored, true);
      setRestoreArmed(false);
      setMessage("That saved version is now the latest. Every later version is still in history.");
    });
  }

  const deviceSnapshot = status?.devices.snapshot;
  const registeredDevices = deviceSnapshot?.devices || [];
  const activeDevices = registeredDevices.filter((device) => device.lifecycle === "active");
  const currentDevices = deviceSnapshot
    ? activeDevices.filter((device) => deviceSyncState(device, deviceSnapshot.relayHeadSequence).current).length
    : 0;
  const allDevicesCurrent = activeDevices.length > 0 && currentDevices === activeDevices.length;
  const relayHealth = deviceSnapshot?.relayHealth;
  const storageHealth = status?.storage;
  const mediaCache = status?.mediaCache;
  const backupHealth = status?.localCompanion.backup;
  const backupDestinationLabel = backupHealth?.destination === "separate-drive" ? "Separate drive"
    : backupHealth?.destination === "custom-folder" ? "Another folder on this PC"
      : "Same PC as the Vault";
  const onlineAuthorizationRequired = Boolean(status?.sync.authorizationRequired);
  const syncIssues = status?.sync.issues || [];
  const clock = status?.metadata?.clockHealth;
  const savedSearchObject = objects.find((item) => item.objectKind === "settings" && item.fields.settingsKind === "saved-searches");
  const savedSearches = readSavedSearches(savedSearchObject);
  const recordSearchIndex = useMemo(() => buildVaultSearchIndex(objects), [objects]);
  const filteredObjects = useMemo(
    () => searchVaultRecords(recordSearchIndex, deferredRecordQuery, activeKind),
    [activeKind, deferredRecordQuery, recordSearchIndex]
  );
  const visibleObjects = filteredObjects.slice(0, recordResultLimit);
  const selectedObject = objects.find((item) => item.objectId === selectedObjectId) || null;
  const editorKind = selectedObject?.objectKind || activeKind;
  const selectedCanonical = selectedObject ? readCanonicalMetadata(selectedObject.fields) : null;
  const editorFields = selectedCanonical?.editableFields || [];
  const selectedArchived = Boolean(selectedObject?.fields.archivedAt)
    || selectedObject?.fields.lifecycle === "archived"
    || selectedObject?.fields.state === "archived"
    || selectedObject?.fields.linkState === "removed";
  const supportsLifecycle = Boolean(selectedCanonical && (
    selectedCanonical.module === "projects"
    || selectedCanonical.module === "personal-ops"
    || selectedCanonical.module === "reviews"
    || selectedCanonical.module === "finance" && !["transfers", "savingsMovements"].includes(selectedCanonical.collection)
  ));
  const supportsRelationship = Boolean(selectedCanonical && (
    selectedCanonical.module === "personal-ops"
    || selectedCanonical.module === "reviews"
    || selectedCanonical.module === "projects" && selectedCanonical.collection !== "links"
    || selectedCanonical.module === "personal-records" && selectedCanonical.collection === "note"
  ));
  const eligibleRelationshipObjects = objects.filter((item) => {
    const metadata = readCanonicalMetadata(item.fields);
    if (!metadata || item.objectId === selectedObjectId || metadata.module === "finance") return false;
    if (Boolean(item.fields.archivedAt) || item.fields.lifecycle === "archived" || item.fields.state === "archived" || item.fields.linkState === "removed") return false;
    if (selectedCanonical?.module === "personal-records" && selectedCanonical.collection === "note" && !["resource", "media"].includes(item.objectKind)) return false;
    return true;
  });
  const allRelationshipTargets = findVaultRelationshipTargets(selectedObject, eligibleRelationshipObjects, "", Math.max(eligibleRelationshipObjects.length, 1));
  const relationshipTargets = findVaultRelationshipTargets(selectedObject, eligibleRelationshipObjects, relationshipQuery, 16);
  const relationshipTarget = allRelationshipTargets.find((item) => item.canonicalId === relationshipTargetId) || null;
  const relatedRecords = selectedObject ? vaultRelationshipsFor(selectedObject, objects) : [];
  const editorGroups = EDITOR_GROUPS
    .map((group) => ({ group, fields: editorFields.filter((field) => (field.group || "Details") === group) }))
    .filter((group) => group.fields.length);
  const selectedRecordOption = selectedObject ? vaultRecordOption(selectedObject) : null;
  const relationshipKindOptions = selectedCanonical?.module === "personal-records" && selectedCanonical.collection === "note"
    ? ["reference", "source", "supporting_media", "attachment", "context"]
    : selectedCanonical?.module === "reviews" ? ["context", "evidence", "decision_support", "follow_up"] : ["reference"];
  const showRecordPicker = Boolean(supportsRelationship || selectedCanonical?.module === "finance" && ["bills", "closePeriods"].includes(selectedCanonical.collection));
  const closeChecks = selectedCanonical?.module === "finance" && selectedCanonical.collection === "closePeriods" && Array.isArray(selectedObject?.fields.checks)
    ? selectedObject.fields.checks.filter((item): item is Record<string, VaultFieldValue> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  const nextOpenCloseCheck = closeChecks.find((item) => item.required === true && item.resolution === "open") || null;
  const canEditRecord = Boolean(editorFields.length) || editorKind === "note" || editorKind === "contact" || editorKind === "resource";
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
    : syncIssues.length ? `${syncIssues.length} saved change${syncIssues.length === 1 ? " needs" : "s need"} help`
    : status?.sync.state === "synced" ? "Up to date"
    : status?.sync.state === "retrying" ? "Trying again · your work is safe"
      : status?.sync.state === "offline" ? "Offline · your work is safe" : online ? "Checking for changes" : "Offline · your work is safe";
  const deviceCountLabel = !status?.unlocked ? "Unlock to check"
    : onlineAuthorizationRequired ? "Sign in to connect"
      : deviceSnapshot ? `${activeDevices.length} connected` : "Checking";
  const clockLabel = clock?.state === "healthy" ? "Checked" : clock?.orderingSafe ? "Corrected" : clock ? "Check needed" : "Checking";
  const queuedChanges = (status?.diagnostics.outbox || 0) + (status?.diagnostics.desktopOutbox || 0);
  const syncDetail = onlineAuthorizationRequired ? "Sign in before this device can exchange encrypted changes."
    : syncIssues.length ? "Your changes are safe here. Open the sync details below to retry them."
      : queuedChanges ? `${queuedChanges} encrypted change${queuedChanges === 1 ? " is" : "s are"} waiting to upload.`
        : status?.sync.lastSyncedAt ? `Last checked ${relativeTime(status.sync.lastSyncedAt)}.`
          : "Waiting for the first sync check.";
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
        <div><strong>Your records are easier to work with here.</strong><span>Edit more of each record, search across modules when connecting work, and see what is already connected—all without creating a second copy.</span></div>
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
              <small>Brave, Dia, Safari, and Home Screen apps each keep their own sign-in. Sign in in every browser or app you want to sync. The Vault will tell you if a secure session needs to be renewed.</small>
            </div>
            <Link className={styles.signInButton} href="/admin/login?next=%2Fvault">Sign in to sync</Link>
          </section>}

          {!onlineAuthorizationRequired && syncIssues.length > 0 && <section className={styles.syncRecovery} role="status" aria-labelledby="vault-sync-recovery-title">
            <div>
              <p className={styles.eyebrow}>Your work is safe</p>
              <h2 id="vault-sync-recovery-title">{syncIssues.length === 1 ? syncIssues[0].title : `${syncIssues.length} saved changes need a safe merge`}</h2>
              <p>{syncIssues.length === 1 ? syncIssues[0].detail : "The Vault kept every version separate. It can retry the merge without deleting either copy."}</p>
              <small>Automatic repair keeps both versions in history. If the same field changed twice, the newest saved value stays on top.</small>
            </div>
            <button disabled={busy || !online} onClick={repairSyncIssues}>Try safe repair</button>
          </section>}

          {!onlineAuthorizationRequired && <section className={`${styles.panel} ${styles.devicesPanel}`} aria-labelledby="devices-sync-title">
            <div className={styles.devicesHeader}>
              <div>
                <p className={styles.eyebrow}>Your devices</p>
                <h2 id="devices-sync-title">{allDevicesCurrent ? "Everything is up to date" : deviceSnapshot ? `${currentDevices} of ${activeDevices.length} devices are up to date` : "Checking your devices…"}</h2>
                <p>Keep the Vault open and unlocked on any device that needs to catch up.</p>
              </div>
              <button disabled={busy || !online} onClick={refreshDevices}>Check now</button>
            </div>
            {status.devices.lastError && <p className={styles.deviceError} role="status">We could not check your devices. Your saved work is safe. Try again.</p>}
            {deviceSnapshot && activeDevices.length > 0 ? (
              <div className={styles.deviceList} role="list" aria-label="Connected vault devices">
                {activeDevices.map((device) => {
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
                      {!isThisDevice && <div className={styles.deviceActions}>
                        {retireArmedDeviceId === device.deviceId ? <>
                          <span>Remove it from sync? Its saved local copy stays on that device.</span>
                          <button disabled={busy || !online} onClick={() => void retireDevice(device.deviceId)}>Yes, remove it</button>
                          <button className={styles.quietButton} onClick={() => setRetireArmedDeviceId(null)}>Cancel</button>
                        </> : <button className={styles.quietButton} onClick={() => void retireDevice(device.deviceId)}>Remove old device</button>}
                      </div>}
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
            <small>Each browser or Home Screen app counts as its own device. Sync runs while that Vault is open and unlocked.{relayHealth?.retiredDevices ? ` ${relayHealth.retiredDevices} old device${relayHealth.retiredDevices === 1 ? " has" : "s have"} been removed from sync.` : ""}</small>
          </section>}

          <section className={`${styles.panel} ${styles.healthPanel}`} aria-labelledby="vault-health-title">
            <div className={styles.healthHeader}>
              <div><p className={styles.eyebrow}>Vault health</p><h2 id="vault-health-title">Storage and recovery</h2><p>Simple checks that keep the Vault reliable as it grows.</p></div>
              <span className={styles.healthOverall}>{storageHealth?.persisted && (!backupHealth || backupHealth.lastVerifiedAt) ? "Looking good" : "A few setup items remain"}</span>
            </div>
            <div className={styles.healthGrid}>
              <article className={styles.healthCard}>
                <div><span className={styles.healthIcon} aria-hidden="true">1</span><strong>Offline on this device</strong></div>
                <p>{storageHealth?.persisted
                  ? "Protected. This browser should keep the Vault available when you are offline."
                  : storageHealth?.persistenceSupported
                    ? "Ask this browser to protect your offline Vault data from automatic cleanup."
                    : "This browser manages offline storage itself. Keep free space on the device."}</p>
                {storageHealth?.usageBytes !== null && storageHealth?.usageBytes !== undefined && <small>{formatBytes(storageHealth.usageBytes)} used{storageHealth.quotaBytes ? ` of ${formatBytes(storageHealth.quotaBytes)} available` : " on this device"}</small>}
                {storageHealth?.persistenceSupported && !storageHealth.persisted && <button disabled={busy} onClick={protectStorage}>Protect offline data</button>}
              </article>
              <article className={styles.healthCard}>
                <div><span className={styles.healthIcon} aria-hidden="true">2</span><strong>Encrypted sync storage</strong></div>
                <p>{relayHealth
                  ? `${relayHealth.relayRows.toLocaleString()} encrypted update${relayHealth.relayRows === 1 ? "" : "s"}. Cleanup waits until every active device is caught up.`
                  : "Unlock and sync to check the encrypted relay."}</p>
                {relayHealth && <small>{formatBytes(relayHealth.relayBytes)} used{relayHealth.lastCompactedAt ? ` · last cleaned ${relativeTime(relayHealth.lastCompactedAt)}` : " · no cleanup needed yet"}</small>}
                {status.localCompanion.unlocked && relayHealth && <button disabled={busy || !online} onClick={cleanupRelay}>Clean up now</button>}
              </article>
              <article className={styles.healthCard}>
                <div><span className={styles.healthIcon} aria-hidden="true">3</span><strong>Downloaded media</strong></div>
                <p>{mediaCache
                  ? mediaCache.capacityState === "critical" ? "This device is nearly full. Clean up downloaded copies now."
                    : mediaCache.capacityState === "warning" ? "Storage is getting tight. Older downloaded copies are ready to clean up."
                      : "Downloaded copies are healthy. Originals stay encrypted on Windows."
                  : "Unlock the Vault to check downloaded files on this device."}</p>
                {mediaCache && <small>{formatBytes(mediaCache.cachedBytes)} downloaded{mediaCache.reclaimableBytes ? " · " + formatBytes(mediaCache.reclaimableBytes) + " ready to clean" : " · nothing ready to clean"}</small>}
                {mediaCache && <div className={styles.retentionControls}>
                  <label>Keep unused downloads<select value={mediaCache.retentionDays === null ? "keep" : String(mediaCache.retentionDays)} onChange={(event) => void setMediaRetention(event.target.value === "keep" ? null : Number(event.target.value) as VaultMediaCacheRetentionDays)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="keep">Until I clean up</option></select></label>
                  <button disabled={busy || mediaCache.reclaimableChunks === 0} onClick={cleanupMedia}>Clean up downloads</button>
                </div>}
              </article>
              <article className={styles.healthCard}>
                <div><span className={styles.healthIcon} aria-hidden="true">4</span><strong>Windows backup</strong></div>
                <p>{backupHealth
                  ? `${backupDestinationLabel}. A checked encrypted backup is scheduled every ${backupHealth.automaticEveryDays} day${backupHealth.automaticEveryDays === 1 ? "" : "s"} while Windows is unlocked.`
                  : "Open and unlock the Windows Vault to check backups."}</p>
                {backupHealth && <small>{backupHealth.lastVerifiedAt ? `Last checked ${relativeTime(backupHealth.lastVerifiedAt)}` : "No checked PC backup yet"} · {backupHealth.count} of {backupHealth.limit} slots used</small>}
                {backupHealth?.lastAutomaticError && <span className={styles.healthWarning}>{backupHealth.lastAutomaticError}</span>}
                {backupHealth && backupHealth.destination !== "separate-drive" && <span className={styles.healthHint}>Using this PC for now. You can add another drive later without changing how backups work.</span>}
              </article>
            </div>
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>Bring in your current data</p>
              <h2>Add your Unigentamos workspace</h2>
              <p>Copy your existing notes, people, resources, projects, and other records into the Vault. Nothing in your current workspace is changed or deleted.</p>
              <button disabled={busy || !online} onClick={() => void importWorkspace()}>Refresh workspace</button>
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
            <p>History adds a version only when the content changes. Edits to different fields merge automatically. If the same field changes on two devices, the newest value stays on top and the other copy stays available.</p>
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
              <div><p className={styles.eyebrow}>Offline command center</p><h2>Your records, in one place</h2><p>These are the same records used by Notes, People, Resources, Projects, Reviews, Personal, and Finance. Safe fields can be changed here offline; specialized actions stay in their full module.</p></div>
              {(activeKind === "note" || activeKind === "contact" || activeKind === "resource") && <button onClick={() => { void newObject(); }}>New {recordKindLabel(activeKind).toLowerCase()}</button>}
            </div>
            <div className={styles.workspaceSync} data-attention={onlineAuthorizationRequired || syncIssues.length > 0 || undefined}>
              <div><strong>{networkLabel}</strong><span>{syncDetail}</span></div>
              <button className={styles.quietButton} disabled={busy || !online} onClick={refreshDevices}>Sync now</button>
            </div>
            <div className={styles.searchRow}>
              <label className={styles.recordSearch}>Search all records<input ref={recordSearchRef} type="search" value={recordQuery} onChange={(event) => setRecordQuery(event.target.value)} placeholder="People, notes, projects, files, finance..." /></label>
              <button className={styles.quietButton} disabled={busy || !recordQuery.trim()} onClick={() => void saveCurrentSearch()}>Save search</button>
            </div>
            {savedSearches.length > 0 && <div className={styles.savedSearches} aria-label="Saved Vault searches">
              <span>Saved searches</span>
              {savedSearches.map((search) => <span className={styles.savedSearch} key={search.id}>
                <button type="button" onClick={() => { setActiveKind(search.kind); setRecordQuery(search.query); }}>{search.label}</button>
                <button type="button" aria-label={`Delete saved search ${search.label}`} onClick={() => void persistSavedSearches(savedSearches.filter((item) => item.id !== search.id))}>×</button>
              </span>)}
            </div>}
            <div className={styles.kindTabs} role="tablist" aria-label="Vault object kinds">
              {RECORD_TABS.map((tab) => (
                <button key={tab.value} role="tab" aria-selected={activeKind === tab.value} onClick={() => { if (newObject()) setActiveKind(tab.value); }}>{tab.label}</button>
              ))}
            </div>
            <div className={styles.objectGrid}>
              <aside className={styles.objectList} aria-label="Saved records">
                {visibleObjects.map((item) => (
                  <button key={item.objectId} data-selected={selectedObjectId === item.objectId} onClick={() => void selectObject(item)}>
                    <strong>{stringField(item, "title") || stringField(item, "name") || "Untitled"}</strong>
                    <span>{recordKindLabel(item.objectKind)} · {new Date(item.updatedAt).toLocaleString()}</span>
                  </button>
                ))}
                {!filteredObjects.length && <p>No matching records on this device yet.</p>}
                {visibleObjects.length < filteredObjects.length && <button className={styles.loadMore} type="button" onClick={() => setRecordResultLimit((current) => current + RECORD_PAGE_SIZE)}>
                  Load more · {filteredObjects.length - visibleObjects.length} remaining
                </button>}
              </aside>
              <div className={styles.objectEditor}>
                {canEditRecord ? <>
                  <div className={styles.recordEditorHeader}>
                    <div>
                      <span className={styles.recordType}>{selectedRecordOption ? `${selectedRecordOption.moduleLabel} / ${recordKindLabel(selectedRecordOption.kind)}` : `New ${recordKindLabel(editorKind as VaultObjectKind)}`}</span>
                      <strong>{selectedRecordOption?.label || "Start a new record"}</strong>
                    </div>
                    {(selectedObject || hasUnsavedRecordChanges) && <span className={hasUnsavedRecordChanges ? styles.draftChanged : styles.draftCurrent}>{hasUnsavedRecordChanges ? "Unsaved changes" : "Saved"}</span>}
                  </div>

                  {editorFields.length ? <div className={styles.editorSections}>
                    {editorGroups.map(({ group, fields }) => <fieldset className={styles.editorSection} key={group}>
                      <legend>{group}</legend>
                      <div className={styles.editorFieldGrid}>
                        {fields.map((field) => {
                          const value = objectDraft[field.key];
                          if (field.control === "checkbox") return <label className={styles.checkboxField} key={field.key}>
                            <input type="checkbox" checked={value === true} onChange={(event) => setObjectDraft((current) => ({ ...current, [field.key]: event.target.checked }))} />
                            <span><strong>{field.label}</strong>{field.help && <small>{field.help}</small>}</span>
                          </label>;
                          return <label className={styles.editorField} key={field.key}>
                            <span>{field.label}{field.required && <em>Required</em>}</span>
                            {field.control === "textarea" ? <textarea
                              rows={field.key === "body" || field.key.includes("summary") ? 10 : 5}
                              value={typeof value === "string" ? value : ""}
                              onChange={(event) => setObjectDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                            /> : field.control === "select" ? <select
                              value={typeof value === "string" ? value : ""}
                              onChange={(event) => setObjectDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                            >
                              <option value="">{field.required ? "Choose one" : "Not set"}</option>
                              {(field.options || []).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                            </select> : <input
                              type={field.control === "tags" ? "text" : field.control}
                              step={field.control === "number" ? field.step : undefined}
                              value={typeof value === "string" ? value : ""}
                              placeholder={field.control === "tags" ? "Separate with commas" : undefined}
                              onChange={(event) => setObjectDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                            />}
                            {field.help && <small>{field.help}</small>}
                          </label>;
                        })}
                      </div>
                    </fieldset>)}
                  </div> : <div className={styles.editorSections}>
                    <fieldset className={styles.editorSection}>
                      <legend>Essentials</legend>
                      <div className={styles.editorFieldGrid}>
                        <label className={styles.editorField}><span>{editorKind === "contact" ? "Name" : "Title"}<em>Required</em></span><input value={draftText(objectDraft, "title")} onChange={(event) => setObjectDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                        {editorKind === "contact" && <label className={styles.editorField}><span>Email</span><input type="email" value={draftText(objectDraft, "email")} onChange={(event) => setObjectDraft((current) => ({ ...current, email: event.target.value }))} /></label>}
                        {editorKind === "resource" && <label className={styles.editorField}><span>URL</span><input type="url" value={draftText(objectDraft, "url")} onChange={(event) => setObjectDraft((current) => ({ ...current, url: event.target.value }))} /></label>}
                      </div>
                    </fieldset>
                    <fieldset className={styles.editorSection}>
                      <legend>Details</legend>
                      <label className={styles.editorField}><span>{editorKind === "note" ? "Note" : "Context"}</span><textarea rows={10} value={draftText(objectDraft, "body")} onChange={(event) => setObjectDraft((current) => ({ ...current, body: event.target.value }))} /></label>
                    </fieldset>
                  </div>}

                  <div className={styles.editorSaveBar}>
                    <div><button disabled={busy || (Boolean(selectedObject) && !hasUnsavedRecordChanges)} onClick={saveLocalObject}>{selectedObject ? "Save changes" : "Create record"}</button>{selectedObject && <button className={styles.quietButton} disabled={busy || !hasUnsavedRecordChanges} onClick={() => setObjectDraft(objectDraftBaseline)}>Reset</button>}</div>
                    <span>{online ? "Saves here, then syncs to the owner module." : "Saves here now and syncs when you reconnect."}</span>
                  </div>
                  {selectedCanonical && <Link href={selectedCanonical.route}>Open full {recordKindLabel(selectedObject!.objectKind).toLowerCase()} view &rarr;</Link>}
                </> : selectedObject ? <div className={styles.readOnlyRecord}>
                  <span className={styles.recordType}>{recordKindLabel(selectedObject.objectKind)}</span>
                  <h3>{stringField(selectedObject, "title") || stringField(selectedObject, "name") || "Untitled"}</h3>
                  <p>This record is read-only here. You can still browse and restore every saved version.</p>
                  {selectedObject.objectKind === "media" && <div className={styles.mediaActions}>
                    {selectedMediaManifest && canPreviewMedia(String(selectedMediaManifest.mimeType || "")) && <button disabled={busy} onClick={() => void previewMedia(selectedObject)}>Preview here</button>}
                    <button className={styles.quietButton} disabled={busy} onClick={() => void openMedia(selectedObject)}>Open file</button>
                  </div>}
                  {mediaPreview && selectedObject.objectKind === "media" && <div className={styles.mediaPreview}>
                    <div><strong>{mediaPreview.fileName}</strong><button className={styles.quietButton} type="button" onClick={() => setMediaPreview(null)}>Close</button></div>
                    {mediaPreview.mimeType.startsWith("image/") ? <img src={mediaPreview.url} alt={mediaPreview.fileName} />
                      : mediaPreview.mimeType.startsWith("audio/") ? <audio controls src={mediaPreview.url} />
                        : mediaPreview.mimeType.startsWith("video/") ? <video controls src={mediaPreview.url} />
                          : <iframe src={mediaPreview.url} title={`Preview of ${mediaPreview.fileName}`} />}
                  </div>}
                  {selectedMediaManifest ? <dl className={styles.recordFields}>
                    <div><dt>File name</dt><dd>{String(selectedMediaManifest.fileName || "")}</dd></div>
                    <div><dt>Type</dt><dd>{String(selectedMediaManifest.mimeType || "Unknown")}</dd></div>
                    <div><dt>File size</dt><dd>{formatBytes(Number(selectedMediaManifest.byteLength || 0))}</dd></div>
                    <div><dt>Encrypted pieces</dt><dd>{Number(selectedMediaManifest.totalChunks || 0).toLocaleString()}</dd></div>
                    <div><dt>Added</dt><dd>{new Date(String(selectedMediaManifest.createdAt)).toLocaleString()}</dd></div>
                    <div><dt>Availability</dt><dd>Encrypted · downloads when opened</dd></div>
                  </dl> : <dl className={styles.recordFields}>
                    {humanFields(selectedObject.fields).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}
                  </dl>}
                </div> : <div className={styles.editorEmpty}><strong>Choose a record</strong><span>Select an item to see its details and full history.</span></div>}

                {selectedCanonical && <section className={styles.connectionsPanel} aria-label="Connected records">
                  <div>
                    <span className={styles.recordType}>Record spine</span>
                    <h3>Connected records</h3>
                    <p>Direct links to the notes, people, projects, resources, reviews, or evidence that belong with this record. Nothing here is a duplicate.</p>
                  </div>
                  {relatedRecords.length ? <div className={styles.connectionList}>
                    {relatedRecords.map((relationship) => {
                      const canManage = selectedCanonical.module === "personal-records"
                        && selectedCanonical.collection === "note"
                        && relationship.direction === "outgoing"
                        && relationship.status === "saved";
                      const editingConnection = connectionEditId === relationship.id;
                      return <article className={styles.connectionRow} key={relationship.id}>
                        <div>
                          <strong>{relationship.target?.label || relationship.targetLabel}</strong>
                          <span>{relationship.direction === "incoming" ? "Linked from" : "Links to"} {relationship.target?.moduleLabel || "another module"} / {relationshipLabel(relationship.relationship)}{relationship.status === "waiting" ? " / Waiting to sync" : relationship.target ? "" : " / Missing on this device"}</span>
                          {editingConnection && <div className={styles.connectionEditor}>
                            <label>Link label<select value={connectionEditKind} onChange={(event) => setConnectionEditKind(event.target.value)}>{relationshipKindOptions.map((kind) => <option value={kind} key={kind}>{relationshipLabel(kind)}</option>)}</select></label>
                            <label>Reason for removal or repair<input value={connectionEditReason} onChange={(event) => setConnectionEditReason(event.target.value)} placeholder="Short audit note" /></label>
                            <div>
                              <button type="button" onClick={() => void queueLinkManagement("relabel", relationship.id)}>Save label</button>
                              <button className={styles.quietButton} type="button" onClick={() => void queueLinkManagement("unlink", relationship.id)}>Unlink</button>
                              {relationship.healthState && ["stale", "broken"].includes(relationship.healthState) && <button className={styles.quietButton} type="button" onClick={() => void queueLinkManagement("repair", relationship.id)}>Repair with selected record</button>}
                              <button className={styles.quietButton} type="button" onClick={() => setConnectionEditId(null)}>Cancel</button>
                            </div>
                          </div>}
                        </div>
                        <div className={styles.connectionActions}>
                          {relationship.target && <>
                            <button className={styles.quietButton} type="button" onClick={() => { const target = objects.find((item) => item.objectId === relationship.target?.objectId); if (target) void selectObject(target); }}>View here</button>
                            <Link href={relationship.target.route}>Open module</Link>
                          </>}
                          {canManage && <button className={styles.quietButton} type="button" onClick={() => { setConnectionEditId(editingConnection ? null : relationship.id); setConnectionEditKind(relationship.relationship); setConnectionEditReason(""); }}>Manage</button>}
                        </div>
                      </article>;
                    })}
                  </div> : <p className={styles.connectionEmpty}>No connected records yet. Use search below when this work depends on something stored elsewhere.</p>}
                </section>}

                {selectedCanonical && (showRecordPicker || supportsLifecycle || selectedCanonical.module === "finance") && <section className={styles.ownerActions} aria-label="Record actions">
                  <div><span className={styles.recordType}>Works offline</span><h3>Record actions</h3><p>These are saved here first, then applied once to the same record in its full module.</p></div>

                  {showRecordPicker && <div className={styles.actionGroup}>
                    <strong>{supportsRelationship ? "Search and connect" : "Find supporting evidence"}</strong>
                    <p>Search the records already stored on this device. Connecting them creates a pointer, not another copy.</p>
                    <label>Find a record<input type="search" value={relationshipQuery} onChange={(event) => setRelationshipQuery(event.target.value)} placeholder="Search notes, people, projects, resources..." /></label>
                    <div className={styles.relationshipResults} role="listbox" aria-label="Records you can connect">
                      {relationshipTargets.map((item) => <button
                        className={styles.relationshipResult}
                        type="button"
                        role="option"
                        aria-selected={relationshipTargetId === item.canonicalId}
                        key={item.canonicalId}
                        onClick={() => setRelationshipTargetId(item.canonicalId)}
                      ><strong>{item.label}</strong><span>{item.moduleLabel} / {recordKindLabel(item.kind)}</span></button>)}
                      {!relationshipTargets.length && <span className={styles.relationshipEmpty}>No matching records are stored on this device.</span>}
                    </div>
                    {relationshipTarget && <div className={styles.selectedRelationship}><span>Selected</span><strong>{relationshipTarget.label}</strong><button className={styles.quietButton} type="button" onClick={() => setRelationshipTargetId("")}>Clear</button></div>}
                    {supportsRelationship && relationshipKindOptions.length > 1 && <label>How are they connected?<select value={relationshipKind} onChange={(event) => setRelationshipKind(event.target.value)}>{relationshipKindOptions.map((kind) => <option value={kind} key={kind}>{relationshipLabel(kind)}</option>)}</select></label>}
                    {supportsRelationship && <button disabled={busy || !relationshipTargetId} onClick={queueRelationship}>Connect records</button>}
                  </div>}

                  {selectedCanonical.module === "finance" && <div className={styles.actionGroup}>
                    <strong>Finance action</strong>
                    {selectedCanonical.collection === "transactions" && selectedObject?.fields.reviewed !== true && <button disabled={busy} onClick={() => void queueFinanceAction("review_transaction", {}, "Transaction marked reviewed.")}>Mark reviewed</button>}
                    {selectedCanonical.collection === "bills" && selectedObject?.fields.status !== "paid" && <>
                      {relationshipTarget && <small>Evidence: {relationshipTarget.label}</small>}
                      <label>Evidence note or exception reason<textarea rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="For example: receipt filed in paper records" /></label>
                      <button disabled={busy || (!relationshipTargetId && !actionReason.trim())} onClick={() => void queueFinanceAction("mark_paid", { ...(relationshipTargetId ? { evidenceCanonicalId: relationshipTargetId } : {}), ...(actionReason.trim() ? { exceptionReason: actionReason.trim() } : {}) }, "Bill marked paid in the ledger. No payment was sent.")}>Mark paid in ledger</button>
                    </>}
                    {selectedCanonical.collection === "closePeriods" && nextOpenCloseCheck && <>
                      <label>Evidence note<textarea rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="What confirms this check is complete?" /></label>
                      <button disabled={busy || !actionReason.trim()} onClick={() => void queueFinanceAction("resolve_close_check", { checkId: String(nextOpenCloseCheck.id || ""), resolution: "complete", reason: actionReason.trim(), ...(relationshipTargetId ? { evidenceCanonicalId: relationshipTargetId } : {}) }, "Completed " + String(nextOpenCloseCheck.label || "next close check") + ".")}>Complete next check</button>
                    </>}
                    {selectedCanonical.collection === "closePeriods" && !nextOpenCloseCheck && selectedObject?.fields.status !== "closed" && <button disabled={busy} onClick={() => void queueFinanceAction("complete_close", {}, "Finance close completed.")}>Complete close</button>}
                    {selectedCanonical.collection === "closePeriods" && selectedObject?.fields.status === "closed" && <><label>Reason to reopen<textarea rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></label><button disabled={busy || !actionReason.trim()} onClick={() => void queueFinanceAction("reopen_close", { reason: actionReason.trim() }, "Finance close reopened.")}>Reopen close</button></>}
                    {selectedCanonical.collection === "rules" && <button disabled={busy} onClick={() => void queueFinanceAction("test_rule", {}, "Rule test recorded.")}>Run saved rule test</button>}
                    {["accounts", "budgets", "transfers", "savingsMovements"].includes(selectedCanonical.collection) && <small>Use the full Finance view for balance-changing or immutable ledger actions.</small>}
                  </div>}

                  {supportsLifecycle && <div className={styles.actionGroup}>
                    {!selectedArchived && <label>Archive reason<textarea rows={3} value={actionReason} onChange={(event) => { setActionReason(event.target.value); setActionArmed(null); }} placeholder="Why is this no longer active?" /></label>}
                    {actionArmed === (selectedArchived ? "restore" : "archive") ? <div className={styles.confirmAction}><span>{selectedArchived ? "Restore this record to its owner module?" : "Archive this record? You can restore it later."}</span><button disabled={busy} onClick={() => void queueLifecycleAction(selectedArchived ? "restore" : "archive")}>Yes, {selectedArchived ? "restore" : "archive"}</button><button className={styles.quietButton} onClick={() => setActionArmed(null)}>Cancel</button></div> : <button className={styles.quietButton} disabled={busy || (!selectedArchived && !actionReason.trim())} onClick={() => void queueLifecycleAction(selectedArchived ? "restore" : "archive")}>{selectedArchived ? "Restore record" : "Archive record"}</button>}
                  </div>}
                </section>}
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
