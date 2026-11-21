"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { browserVault } from "../../lib/local-first/browser-engine";
import type { VaultMediaCacheRetentionDays } from "../../lib/local-first/types";
import { useUploadLocation } from "../../lib/modules/media/upload-privacy";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import SettingsSwitch from "../writing/SettingsSwitch";
import {offlineModules,type OfflineModule} from "../../lib/local-first/offline-modules";
import styles from "../writing/WritingSettings.module.css";

type Status = Awaited<ReturnType<typeof browserVault.status>>;
export default function DeviceDataSettings() {
  const [includeLocation, setIncludeLocation] = useUploadLocation();
  const [status, setStatus] = useState<Status | null>(null),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setStatus(await browserVault.status());
    } catch {
      setStatus(null);
      setNotice("Device storage status is unavailable.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => {
      void refresh();
    };
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("unigentamos-vault-locked", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("unigentamos-vault-locked", update);
    };
  }, [refresh]);
  async function requestProtection() {
    setBusy(true);
    try {
      const allowed = await browserVault.protectLocalStorage();
      setNotice(
        allowed ? "Offline storage protection is active." : "The browser declined persistent storage.",
      );
      await refresh();
    } catch {
      setNotice("Unlock Vault on this device to change protection.");
    } finally {
      setBusy(false);
    }
  }
  async function saveRetention(value: string) {
    setBusy(true);
    try {
      await browserVault.setMediaCacheRetention(
        value === "keep" ? null : (Number(value) as VaultMediaCacheRetentionDays),
      );
      await refresh();
      setNotice("Offline retention updated.");
    } catch {
      setNotice("Unlock Vault on this device to change retention.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className={styles.panel}>
        <h2>Photo imports</h2>
        <SettingsSwitch
          label="Include photo locations"
          detail="Read embedded coordinates when adding photos in Media and use them to match saved places. Anyone with access to an original photo can still read its embedded metadata."
          checked={includeLocation}
          onChange={setIncludeLocation}
        />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Offline Vault on this device</h2>
          <Button disabled={busy} onClick={() => void refresh()}>
            Refresh status
          </Button>
        </div>
        {status ? (
          status.configured ? (
            <>
              <p>
                Vault {status.unlocked ? "unlocked" : "locked"} · Sync {status.sync.state} ·{" "}
                {status.diagnostics.outbox} pending changes · {status.diagnostics.conflicts} saved conflicts
              </p>
              {status.sync.lastSyncedAt && (
                <p>Last sync {new Date(status.sync.lastSyncedAt).toLocaleString()}</p>
              )}
              {status.unlocked&&<details><summary>Modules to add for offline use</summary>
                <p>Choose which new workspace records this device adds to Vault. Existing copies and encrypted changes from your other devices continue to sync.</p>
                {Object.entries(offlineModules).map(([key,title])=>{
                  const module=key as OfflineModule;
                  const excluded=status.metadata?.excludedOfflineModules??[];
                  return <label key={module} style={{display:"inline-flex",gap:6,alignItems:"center",margin:"6px 12px 6px 0"}}><input type="checkbox"
                    checked={!excluded.includes(module)} disabled={busy} onChange={async e=>{
                      const next=e.target.checked?excluded.filter(x=>x!==module):[...excluded,module];
                      setBusy(true);
                      try {await browserVault.setOfflineModules(next);await refresh();}
                      catch{setNotice("Unlock Vault to change offline modules.");}finally{setBusy(false);}
                    }}/>{title}</label>;
                })}</details>}
              {status.mediaCache && (
                <>
                  <p>
                    {(status.mediaCache.cachedBytes / 1048576).toFixed(1)} MiB cached ·{" "}
                    {status.mediaCache.pendingUploadChunks} file parts awaiting upload
                  </p>
                  <label>
                    Download cache limit{" "}
                    <select
                      disabled={busy}
                      value={status.metadata?.mediaCacheLimitBytes ?? "unlimited"}
                      onChange={async (e) => {
                        const limit = e.target.value === "unlimited" ? null : Number(e.target.value);
                        setBusy(true);
                        try {
                          await browserVault.setDownloadLimit(limit);
                          await refresh();
                          setNotice("Download cache limit updated.");
                        } catch {
                          setNotice("Unlock Vault on this device to change the cache limit.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <option value="unlimited">Device capacity</option>
                      <option value="0">Open online only</option>
                      <option value="67108864">64 MiB</option>
                      <option value="268435456">256 MiB</option>
                      <option value="1073741824">1 GiB</option>
                    </select>
                  </label>
                  <p>
                    The limit applies to future downloads. Existing offline copies and pending uploads stay on
                    this device. Open a Vault file and choose “Keep on this device” to pin it.
                  </p>
                  <label>
                    Keep unused encrypted downloads{" "}
                    <select
                      disabled={busy}
                      value={status.mediaCache.retentionDays ?? "keep"}
                      onChange={(e) => void saveRetention(e.target.value)}
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="keep">Until I clean up</option>
                    </select>
                  </label>
                </>
              )}
              <p>
                {status.storage.persisted
                  ? "The browser protects this device’s offline Vault storage."
                  : "The browser manages offline storage on this device."}
              </p>
              {status.unlocked && !status.storage.persisted && status.storage.persistenceSupported && (
                <Button disabled={busy} onClick={() => void requestProtection()}>
                  Request offline storage protection
                </Button>
              )}
            </>
          ) : (
            <p>Set up Vault on this device to keep encrypted files offline.</p>
          )
        ) : (
          <p>Checking device storage…</p>
        )}
        <Link href="/vault">Open Vault and review sync issues</Link>
        {notice && <p role="status">{notice}</p>}
      </section>
    </>
  );
}
