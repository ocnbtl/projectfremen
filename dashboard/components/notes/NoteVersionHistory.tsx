"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { browserVault, deterministicVaultObjectId } from "../../lib/local-first/browser-engine";
import type { VaultFieldValue, VaultObjectSnapshot } from "../../lib/local-first/types";
import styles from "./NoteVersionHistory.module.css";

type NoteVersionHistoryState = {
  status: "locked" | "loading" | "ready" | "missing" | "error";
  versions: VaultObjectSnapshot[];
  error?: string;
};

function textField(fields: Record<string, VaultFieldValue>, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value : "";
}

function versionSummary(version: VaultObjectSnapshot): string {
  const body = textField(version.fields, "body").trim();
  if (body) return body.replace(/\s+/g, " ").slice(0, 180);
  const title = textField(version.fields, "title").trim();
  return title || "Saved Note version";
}

function formatVersionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export default function NoteVersionHistory({ noteId, noteTitle }: { noteId: string; noteTitle: string }) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<NoteVersionHistoryState>({ status: "locked", versions: [] });
  const vaultHref = useMemo(
    () => `/vault?kind=note&search=${encodeURIComponent(noteTitle)}&focus=search`,
    [noteTitle]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!browserVault.isUnlocked()) {
        setState({ status: "locked", versions: [] });
        return;
      }

      setState((current) => ({ status: "loading", versions: current.versions }));
      try {
        const objectId = await deterministicVaultObjectId(`personal-records:note:${noteId}`);
        const current = await browserVault.readObject(objectId);
        if (!current) {
          if (!cancelled) setState({ status: "missing", versions: [] });
          return;
        }
        const versions = await browserVault.history(objectId);
        if (!cancelled) setState({ status: "ready", versions });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            versions: [],
            error: error instanceof Error ? error.message : "Encrypted Note history could not be read"
          });
        }
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [noteId, reloadToken]);

  return (
    <section
      className={styles.historyPanel}
      data-note-version-history={noteId}
      data-note-history-state={state.status}
      aria-labelledby={`note-version-history-${noteId}`}
    >
      <header className={styles.header}>
        <div>
          <span>Same canonical Note</span>
          <h2 id={`note-version-history-${noteId}`}>Encrypted version history</h2>
          <p>Read-only history from this browser&apos;s local Vault. The Personal Records API remains the Note writer.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)}>Refresh</button>
          <Link href={vaultHref}>Open in Vault</Link>
        </div>
      </header>

      {state.status === "locked" && (
        <div className={styles.state} role="status">
          <strong>Unlock Vault to read encrypted history</strong>
          <span>History stays encrypted and is not loaded into the Notes page until this browser&apos;s Vault is unlocked.</span>
        </div>
      )}

      {state.status === "loading" && (
        <div className={styles.state} role="status">
          <strong>Reading local versions…</strong>
          <span>Decrypting the saved history on this device.</span>
        </div>
      )}

      {state.status === "missing" && (
        <div className={styles.state} role="status">
          <strong>No encrypted versions are stored on this device yet</strong>
          <span>Save this Note while Vault is unlocked, or import current module records from Vault. No owner record was created here.</span>
        </div>
      )}

      {state.status === "error" && (
        <div className={styles.state} data-tone="error" role="alert">
          <strong>Encrypted history is unavailable</strong>
          <span>{state.error}</span>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className={styles.summary} role="status">
            <strong>{state.versions.length}</strong>
            <span>meaningful version{state.versions.length === 1 ? "" : "s"} saved on this device</span>
          </div>
          {state.versions.length ? (
            <ol className={styles.versionList} aria-label={`Saved versions of ${noteTitle}`}>
              {state.versions.map((version, index) => (
                <li key={version.versionId} data-current={index === 0 ? "true" : undefined}>
                  <div className={styles.versionHeading}>
                    <strong>{index === 0 ? "Current" : `Version ${state.versions.length - index}`}</strong>
                    {version.restoredFromVersionId && <span>Restored copy</span>}
                    <time dateTime={version.updatedAt}>{formatVersionTime(version.updatedAt)}</time>
                  </div>
                  <p>{versionSummary(version)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.state} role="status">
              <strong>No meaningful versions to show</strong>
              <span>The local object exists, but its encrypted history does not yet contain a distinct saved version.</span>
            </div>
          )}
          <p className={styles.restoreBoundary}>Restore remains in Vault so it can create a new encrypted version, retain later history, and reconcile through the canonical Note command path.</p>
        </>
      )}
    </section>
  );
}
