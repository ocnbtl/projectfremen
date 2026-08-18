"use client";

import Link from "next/link";
import {
  followUpOwnerRoute,
  getLinkedFollowUps,
  isActiveFollowUp
} from "../../lib/modules/personal-ops/follow-up-links";
import type { PersonalOpsFollowUp } from "../../lib/modules/personal-ops/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./LinkedFollowUpsPanel.module.css";

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "No due date";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function sourceKey(source: NativeObjectRef) {
  return [
    source.module,
    source.objectType,
    source.containerObjectId || "root",
    source.objectId
  ].join(":");
}

export default function LinkedFollowUpsPanel({
  source,
  followUps,
  loading,
  error,
  onRefresh,
  createHref,
  limit = 3,
  compact = false,
  presentation = "default",
  showHeader = true,
  showBoundary = true,
  hideWhenEmpty = false,
  className = "",
  wide = false,
  title = "Personal Ops follow-through"
}: {
  source: NativeObjectRef;
  followUps: PersonalOpsFollowUp[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  createHref?: string;
  limit?: number;
  compact?: boolean;
  presentation?: "default" | "rail";
  showHeader?: boolean;
  showBoundary?: boolean;
  hideWhenEmpty?: boolean;
  className?: string;
  wide?: boolean;
  title?: string;
}) {
  const linked = getLinkedFollowUps(followUps, source);
  const visible = linked.slice(0, limit);
  const activeCount = linked.filter(isActiveFollowUp).length;

  if (hideWhenEmpty && linked.length === 0 && !error) return null;

  return (
    <section
      className={`${styles.panel} ${className}`.trim()}
      data-linked-follow-ups={sourceKey(source)}
      data-source-module={source.module}
      data-source-object-id={source.objectId}
      data-people-follow-up-bridge={source.module === "people" ? source.objectId : undefined}
      data-compact={compact || undefined}
      data-presentation={presentation}
      data-wide={wide || undefined}
      aria-live="polite"
    >
      {showHeader && (
        <header className={styles.header}>
          <div className={styles.heading}>
            <span>{presentation === "rail" ? "Linked to this person" : "Personal Ops owner"}</span>
            <strong>{title}</strong>
          </div>
          <button
            type="button"
            className={styles.refresh}
            onClick={onRefresh}
            disabled={loading}
            aria-label={`Refresh linked Follow-ups for ${source.label}`}
          >
            {loading ? "Checking…" : presentation === "rail" ? "Check" : "Refresh status"}
          </button>
        </header>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      {visible.length ? (
        <ul className={styles.list}>
          {visible.map((followUp) => (
            <li key={followUp.id}>
              <Link
                href={followUpOwnerRoute(followUp)}
                className={styles.row}
                data-follow-up-id={followUp.id}
                data-people-follow-up-id={source.module === "people" ? followUp.id : undefined}
                data-follow-up-state={followUp.followUpState}
              >
                <span className={styles.rowBody}>
                  <strong>{followUp.title}</strong>
                  <small>
                    {formatDate(followUp.dueAt)} · {labelize(followUp.followUpType)}
                    {followUp.owner ? ` · ${followUp.owner}` : ""}
                  </small>
                </span>
                <span className={styles.state}>{labelize(followUp.followUpState)}</span>
                <small className={styles.ownerLink}>Open in Personal Ops</small>
              </Link>
            </li>
          ))}
          {linked.length > visible.length && (
            <li className={styles.more}>
              {linked.length - visible.length} more linked Follow-up
              {linked.length - visible.length === 1 ? "" : "s"} in Personal Ops
            </li>
          )}
        </ul>
      ) : (
        <p className={styles.empty}>
          {error
            ? "Current linked Follow-up status is unavailable. Retry before creating new work."
            : presentation === "rail"
              ? "No follow-ups for this person."
              : "No Personal Ops Follow-up uses this exact source."}
        </p>
      )}

      <div className={styles.summary}>
        <span>
          {error ? "Last loaded: " : ""}
          {activeCount} active · {linked.length} total
        </span>
        {createHref && linked.length === 0 && !error && (
          <Link className={styles.create} href={createHref}>
            Create in Personal Ops
          </Link>
        )}
      </div>

      {showBoundary && (
        <p className={styles.boundary}>
          Status is read from Personal Ops. The source module keeps its own native state.
        </p>
      )}
    </section>
  );
}
