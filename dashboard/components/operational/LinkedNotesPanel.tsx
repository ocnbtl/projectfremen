"use client";

import Link from "next/link";
import { noteLinkOwnerRoute, sameNoteLinkTarget, type NoteLinksState } from "../../lib/modules/notes/links-types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./LinkedNotesPanel.module.css";

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sourceKey(source: NativeObjectRef) {
  return [source.module, source.objectType, source.containerObjectId || "root", source.objectId].join(":");
}

export default function LinkedNotesPanel({
  source,
  state,
  loading,
  error,
  onRefresh,
  limit = 5,
  title = "Notes using this object",
  compact = false
}: {
  source: NativeObjectRef;
  state: NoteLinksState;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  limit?: number;
  title?: string;
  compact?: boolean;
}) {
  const links = state.links
    .filter((link) => sameNoteLinkTarget(link.targetRef, source))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const visible = links.slice(0, limit);
  const attention = links.filter((link) => link.state === "stale" || link.state === "broken").length;

  return (
    <section
      className={styles.panel}
      data-compact={compact ? "true" : undefined}
      data-linked-notes={sourceKey(source)}
      data-source-module={source.module}
      data-source-object-id={source.objectId}
      aria-live="polite"
    >
      {!compact ? <header className={styles.header}>
        <div>
          <span>Notes owner</span>
          <strong>{title}</strong>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh links"}
        </button>
      </header> : null}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {visible.length ? (
        <ul className={styles.list}>
          {visible.map((link) => (
            <li key={link.id} data-note-link-id={link.id} data-note-link-state={link.state}>
              <Link href={noteLinkOwnerRoute(link)} className={styles.row}>
                <span className={styles.rowBody}>
                  <strong>{link.noteRef.label}</strong>
                  <small>{label(link.relationship)}{link.contextNote ? ` - ${link.contextNote}` : ""}</small>
                </span>
                <span className={styles.state} data-state={link.state}>{label(link.state)}</span>
                <small className={styles.ownerLink}>Manage in Notes</small>
              </Link>
              {link.state === "removed" && link.removalReason && (
                <p className={styles.reason}>Removed: {link.removalReason}</p>
              )}
              {(link.state === "stale" || link.state === "broken") && link.healthNote && (
                <p className={styles.reason}>{label(link.state)}: {link.healthNote}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {error
            ? "Current NoteLink state is unavailable. Refresh before assuming this object is unlinked."
            : compact ? "None yet" : "No Notes-owned link targets this exact object."}
        </p>
      )}

      {!compact ? <div className={styles.summary}>
        <span>{error ? "Last loaded: " : ""}{links.length} total - {attention} need attention</span>
        {links.length > visible.length && <span>{links.length - visible.length} more in Notes</span>}
      </div> : null}
      {!compact ? <p className={styles.boundary}>
        Notes owns these relationships. This {source.module === "resources" ? "Resource" : "Media object"} keeps its native lifecycle and content.
      </p> : null}
    </section>
  );
}
