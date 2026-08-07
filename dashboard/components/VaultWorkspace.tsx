"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserVault, deterministicVaultObjectId } from "../lib/local-first/browser-engine";
import type { VaultFieldValue, VaultObjectKind, VaultObjectSnapshot, VaultRecoveryPackage } from "../lib/local-first/types";
import styles from "./VaultWorkspace.module.css";

type VaultStatus = Awaited<ReturnType<typeof browserVault.status>>;
type BootstrapObject = { canonicalId: string; objectKind: VaultObjectKind; fields: Record<string, VaultFieldValue> };

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function VaultWorkspace() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("Windows desktop");
  const [setupCode, setSetupCode] = useState("");
  const [recoveryText, setRecoveryText] = useState("");
  const [message, setMessage] = useState("Checking this device…");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [journal, setJournal] = useState("");
  const [journalId, setJournalId] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [objects, setObjects] = useState<VaultObjectSnapshot[]>([]);
  const [activeKind, setActiveKind] = useState<"note" | "contact" | "resource">("note");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [objectDraft, setObjectDraft] = useState<Record<string, string>>({ title: "", body: "" });
  const [objectHistory, setObjectHistory] = useState<VaultObjectSnapshot[]>([]);

  const refresh = useCallback(async () => {
    const next = await browserVault.status();
    setStatus(next);
    return next;
  }, []);

  const loadObjects = useCallback(async () => {
    const next = await browserVault.listObjects(["note", "contact", "resource"]);
    setObjects(next);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh().then(() => setMessage("")).catch((error) => setMessage(error instanceof Error ? error.message : "Vault status failed"));
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

  useEffect(() => {
    if (status?.unlocked) void loadObjects().catch(() => undefined);
  }, [loadObjects, status?.unlocked]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault action failed");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  async function setupDesktop() {
    await run(async () => {
      if (!status?.localCompanion.available) throw new Error("Start the Windows Vault Companion first");
      await browserVault.initializeDesktopMaster(password, deviceName, setupCode);
      browserVault.startSync();
      await loadObjects();
      setMessage("Desktop master vault created and unlocked.");
    });
  }

  async function connectDesktop() {
    await run(async () => {
      await browserVault.joinDesktopMaster(password, deviceName);
      browserVault.startSync();
      await loadObjects();
      setMessage("This browser is connected to the configured desktop master vault.");
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
      setMessage("Vault unlocked. Local saves are active; relay sync retries automatically when available.");
    });
  }

  async function joinDevice() {
    await run(async () => {
      const recovery = JSON.parse(recoveryText) as VaultRecoveryPackage;
      await browserVault.join(password, deviceName, recovery);
      browserVault.startSync();
      await loadObjects();
      setRecoveryText("");
      setMessage("This device joined the encrypted vault.");
    });
  }

  async function exportRecovery() {
    await run(async () => {
      const recovery = await browserVault.exportRecoveryPackage();
      downloadJson(`unigentamos-vault-recovery-${recovery.vaultId}.json`, recovery);
      setMessage("Password-wrapped recovery package downloaded. Store it separately from the password.");
    });
  }

  async function importWorkspace() {
    await run(async () => {
      const response = await fetch("/api/vault/bootstrap", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; objects?: BootstrapObject[]; error?: string };
      if (!response.ok || !payload.ok || !payload.objects) throw new Error(payload.error || "Workspace import failed");
      let changed = 0;
      for (const item of payload.objects) {
        const objectId = await deterministicVaultObjectId(item.canonicalId);
        const mirrored = await browserVault.mirrorCanonicalObject({
          objectId,
          objectKind: item.objectKind,
          fields: item.fields
        });
        if (mirrored.changed) changed += 1;
        if (changed % 10 === 0) setMessage(`Encrypted ${changed} workspace objects…`);
      }
      await browserVault.syncOnce();
      await loadObjects();
      setMessage(changed ? `Encrypted ${changed} new or changed workspace objects.` : "Encrypted vault is already current with the server-backed workspace.");
    });
  }

  async function saveJournal() {
    await run(async () => {
      const objectId = journalId || await deterministicVaultObjectId("vault:journal");
      await browserVault.saveObject({ objectId, objectKind: "note", fields: { title: "Vault journal", body: journal } });
      setJournalId(objectId);
      const history = await browserVault.history(objectId);
      setHistoryCount(history.length);
      setMessage(`Journal saved locally with ${history.length} encrypted version${history.length === 1 ? "" : "s"}.`);
    });
  }

  async function createBackup() {
    await run(async () => {
      const result = await browserVault.createDesktopBackup();
      setMessage(`Created backup ${result.backupId} in the ${result.location}.`);
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
    setObjectHistory(await browserVault.history(snapshot.objectId));
  }

  function newObject() {
    setSelectedObjectId(null);
    setObjectDraft({ title: "", body: "", email: "", phone: "", location: "", url: "" });
    setObjectHistory([]);
  }

  async function saveLocalObject() {
    await run(async () => {
      if (!objectDraft.title.trim()) throw new Error("Title or name is required");
      const fields: Record<string, VaultFieldValue> = {
        title: objectDraft.title.trim(),
        body: objectDraft.body || "",
        sourceModule: "vault"
      };
      if (activeKind === "contact") {
        fields["profile.primaryEmail"] = objectDraft.email || "";
        fields["profile.primaryPhone"] = objectDraft.phone || "";
        fields["profile.livesIn"] = objectDraft.location || "";
      }
      if (activeKind === "resource") fields.url = objectDraft.url || "";
      const saved = await browserVault.saveObject({
        ...(selectedObjectId ? { objectId: selectedObjectId } : {}),
        objectKind: activeKind,
        fields
      });
      setSelectedObjectId(saved.objectId);
      setObjectHistory(await browserVault.history(saved.objectId));
      await loadObjects();
      setMessage(`${activeKind === "contact" ? "Contact" : activeKind[0].toUpperCase() + activeKind.slice(1)} saved locally and queued for encrypted sync.`);
    });
  }

  const clock = status?.metadata?.clockHealth;
  const companionLabel = status?.localCompanion.available
    ? `Desktop companion ${status.localCompanion.configured ? "configured" : "ready for setup"}`
    : "Desktop companion not detected";
  const stateLabel = !status?.configured ? "Not configured" : status.unlocked ? "Unlocked" : "Locked";
  const clockLabel = clock ? `${clock.state} · ${Math.round(Math.abs(clock.skewMs) / 1000)}s skew` : "Awaiting server-time check";
  const networkLabel = status?.sync.state === "synced" ? "Relay synchronized"
    : status?.sync.state === "retrying" ? "Relay retrying · local saves safe"
      : status?.sync.state === "offline" ? "Offline · local saves safe" : online ? "Online · sync pending" : "Offline · local saves safe";
  const cards = useMemo(() => [
    ["Vault", stateLabel],
    ["Network", networkLabel],
    ["Clock", clockLabel],
    ["Desktop", companionLabel]
  ], [clockLabel, companionLabel, networkLabel, stateLabel]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin" className={styles.brand}><span>U</span> Unigentamos</Link>
        <div><p>Encrypted local-first workspace</p><h1>Vault & sync</h1></div>
      </header>

      <section className={styles.statusGrid} aria-label="Vault status">
        {cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>

      {message && <p className={styles.notice} role="status">{message}</p>}

      {!status?.configured ? (
        <section className={styles.grid}>
          <article className={styles.panel}>
            <p className={styles.eyebrow}>Windows master</p>
            <h2>Create the desktop vault</h2>
            <p>The companion generates the only data key, wraps it with your password, and stores encrypted SQLite and media files on this PC.</p>
            <label>Device name<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label>
            {!status?.localCompanion.configured && <label>Desktop pairing code<input value={setupCode} onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></label>}
            <label>Vault password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {status?.localCompanion.configured
              ? <button disabled={busy || password.length < 14} onClick={connectDesktop}>Connect configured desktop vault</button>
              : <button disabled={busy || !status?.localCompanion.available || setupCode.length !== 6 || password.length < 14} onClick={setupDesktop}>Create desktop master vault</button>}
            {!status?.localCompanion.available && <small>Run the checked-in Vault Companion on the Windows desktop, then reload this page.</small>}
            {status?.localCompanion.available && !status.localCompanion.configured && <small>Enter the six-digit one-time code shown when the companion starts. This prevents another website from claiming an unconfigured vault.</small>}
            {status?.localCompanion.configured && <small>The desktop already owns a vault. Enter its password to attach this browser without replacing anything.</small>}
          </article>
          <article className={styles.panel}>
            <p className={styles.eyebrow}>iPhone, iPad, or MacBook</p>
            <h2>Join the existing vault</h2>
            <p>Paste the password-wrapped recovery package exported by the master device. The unwrapped key never enters cloud storage.</p>
            <label>Device name<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label>
            <label>Recovery package<textarea value={recoveryText} onChange={(event) => setRecoveryText(event.target.value)} rows={7} spellCheck={false} /></label>
            <label>Vault password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <button disabled={busy || !recoveryText.trim() || password.length < 14} onClick={joinDevice}>Join encrypted vault</button>
          </article>
        </section>
      ) : !status.unlocked ? (
        <section className={`${styles.panel} ${styles.unlock}`}>
          <p className={styles.eyebrow}>Local key required</p>
          <h2>Unlock this device</h2>
          <p>Your password unwraps the vault key locally. It is not retained after this session locks.</p>
          <label>Vault password<input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && password.length >= 14) void unlock(); }} /></label>
          <button disabled={busy || password.length < 14} onClick={unlock}>Unlock vault</button>
        </section>
      ) : (
        <>
          <section className={styles.grid}>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>Migration</p>
              <h2>Encrypt the current workspace</h2>
              <p>Copies Notes, People, Resources, Media metadata, Projects, Personal Ops, Reviews, and Finance into per-object encrypted history. It does not delete or rewrite the current records.</p>
              <button disabled={busy || !online} onClick={importWorkspace}>Import current workspace</button>
              <small>Transient Finance CSV previews are excluded. Raw CSV is never retained.</small>
            </article>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>Recovery & backup</p>
              <h2>Protect the vault</h2>
              <div className={styles.buttonRow}>
                <button disabled={busy} onClick={exportRecovery}>Export recovery package</button>
                <button disabled={busy || !status.localCompanion.available} onClick={createBackup}>Create desktop backup</button>
              </div>
              <small>The recovery file is still encrypted, but it should be kept separately from the password. A later SSD/server target can receive the same encrypted backup set.</small>
            </article>
          </section>

          <section className={styles.panel}>
            <p className={styles.eyebrow}>Version-history proof</p>
            <h2>Local vault journal</h2>
            <p>Each save is a separate encrypted version. Non-overlapping field edits merge automatically; overlapping edits use the checked hybrid clock and preserve the losing value as conflict history.</p>
            <textarea value={journal} onChange={(event) => setJournal(event.target.value)} rows={8} placeholder="Write here, save, then keep editing to create history…" />
            <div className={styles.buttonRow}><button disabled={busy} onClick={saveJournal}>Save encrypted version</button><span>{historyCount ? `${historyCount} versions in this session` : "No journal version saved this session"}</span></div>
          </section>

          <section className={`${styles.panel} ${styles.objectWorkspace}`}>
            <div className={styles.workspaceHeader}>
              <div><p className={styles.eyebrow}>Offline-first records</p><h2>Notes, contacts & resources</h2></div>
              <button onClick={newObject}>New {activeKind}</button>
            </div>
            <div className={styles.kindTabs} role="tablist" aria-label="Vault object kinds">
              {(["note", "contact", "resource"] as const).map((kind) => (
                <button key={kind} role="tab" aria-selected={activeKind === kind} onClick={() => { setActiveKind(kind); newObject(); }}>{kind === "contact" ? "Contacts" : `${kind[0].toUpperCase()}${kind.slice(1)}s`}</button>
              ))}
            </div>
            <div className={styles.objectGrid}>
              <aside className={styles.objectList} aria-label={`${activeKind} list`}>
                {objects.filter((item) => item.objectKind === activeKind).map((item) => (
                  <button key={item.objectId} data-selected={selectedObjectId === item.objectId} onClick={() => void selectObject(item)}>
                    <strong>{stringField(item, "title") || stringField(item, "name") || "Untitled"}</strong>
                    <span>{new Date(item.updatedAt).toLocaleString()}</span>
                  </button>
                ))}
                {!objects.some((item) => item.objectKind === activeKind) && <p>No encrypted {activeKind}s on this device yet.</p>}
              </aside>
              <div className={styles.objectEditor}>
                <label>{activeKind === "contact" ? "Name" : "Title"}<input value={objectDraft.title || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                {activeKind === "contact" && <div className={styles.fieldGrid}>
                  <label>Email<input type="email" value={objectDraft.email || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>Phone<input value={objectDraft.phone || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                  <label>Location<input value={objectDraft.location || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, location: event.target.value }))} /></label>
                </div>}
                {activeKind === "resource" && <label>URL<input type="url" value={objectDraft.url || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, url: event.target.value }))} /></label>}
                <label>{activeKind === "note" ? "Note" : "Context"}<textarea rows={10} value={objectDraft.body || ""} onChange={(event) => setObjectDraft((current) => ({ ...current, body: event.target.value }))} /></label>
                <div className={styles.buttonRow}><button disabled={busy} onClick={saveLocalObject}>Save encrypted version</button><span>{status.sync.state === "synced" ? "Relay synchronized" : "Saved locally · sync will retry"}</span></div>
              </div>
              <aside className={styles.historyList} aria-label="Version history">
                <h3>Version history</h3>
                {objectHistory.slice(0, 20).map((version) => <div key={version.versionId}><strong>{new Date(version.updatedAt).toLocaleString()}</strong><span>{String(version.fields.body || version.fields.title || "Version saved").slice(0, 100)}</span></div>)}
                {!objectHistory.length && <p>Select an item to see its encrypted history.</p>}
              </aside>
            </div>
          </section>

          <section className={styles.metrics}>
            <div><strong>{status.diagnostics.objects}</strong><span>encrypted objects</span></div>
            <div><strong>{status.diagnostics.versions}</strong><span>versions</span></div>
            <div><strong>{status.diagnostics.outbox}</strong><span>queued changes</span></div>
            <div><strong>{status.diagnostics.conflicts}</strong><span>preserved conflicts</span></div>
          </section>
          <button className={styles.lock} onClick={() => { browserVault.lock(); void refresh(); }}>Lock vault</button>
        </>
      )}
    </main>
  );
}
