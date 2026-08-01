"use client";

import Link from "next/link";
import {
  decisionOwnerRoute,
  getLinkedDecisions,
  isUnresolvedDecision
} from "../../lib/modules/personal-ops/decision-links";
import type { PersonalOpsDecision } from "../../lib/modules/personal-ops/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./LinkedDecisionsPanel.module.css";

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sourceKey(source: NativeObjectRef) {
  return [
    source.module,
    source.objectType,
    source.containerObjectId || "root",
    source.objectId
  ].join(":");
}

export default function LinkedDecisionsPanel({
  source,
  decisions,
  loading,
  error,
  onRefresh,
  createHref,
  limit = 3,
  compact = false,
  showHeader = true,
  showBoundary = true,
  hideWhenEmpty = false,
  className = "",
  wide = false,
  title = "Personal Ops decisions"
}: {
  source: NativeObjectRef;
  decisions: PersonalOpsDecision[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  createHref?: string;
  limit?: number;
  compact?: boolean;
  showHeader?: boolean;
  showBoundary?: boolean;
  hideWhenEmpty?: boolean;
  className?: string;
  wide?: boolean;
  title?: string;
}) {
  const linked = getLinkedDecisions(decisions, source);
  const visible = linked.slice(0, limit);
  const unresolvedCount = linked.filter(isUnresolvedDecision).length;

  if (hideWhenEmpty && linked.length === 0 && !error) return null;

  return (
    <section
      className={`${styles.panel} ${className}`.trim()}
      data-linked-decisions={sourceKey(source)}
      data-compact={compact || undefined}
      data-wide={wide || undefined}
      aria-live="polite"
    >
      {showHeader && (
        <header className={styles.header}>
          <div className={styles.heading}>
            <span>Personal Ops owner</span>
            <strong>{title}</strong>
          </div>
          <button
            type="button"
            className={styles.refresh}
            onClick={onRefresh}
            disabled={loading}
            aria-label={`Refresh linked Decisions for ${source.label}`}
          >
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        </header>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      {visible.length ? (
        <ul className={styles.list}>
          {visible.map((decision) => (
            <li key={decision.id}>
              <Link
                href={decisionOwnerRoute(decision)}
                className={styles.row}
                data-decision-id={decision.id}
                data-decision-state={decision.decisionState}
              >
                <span className={styles.rowBody}>
                  <strong>{decision.title}</strong>
                  <small>
                    {decision.question || "No decision question recorded"} · {labelize(decision.risk)} risk
                  </small>
                </span>
                <span className={styles.state}>{labelize(decision.decisionState)}</span>
                <small className={styles.ownerLink}>Open in Personal Ops</small>
              </Link>
            </li>
          ))}
          {linked.length > visible.length && (
            <li className={styles.more}>
              {linked.length - visible.length} more linked Decision
              {linked.length - visible.length === 1 ? "" : "s"} in Personal Ops
            </li>
          )}
        </ul>
      ) : (
        <p className={styles.empty}>
          No Personal Ops Decision uses this exact source.
        </p>
      )}

      <div className={styles.summary}>
        <span>
          {unresolvedCount} unresolved · {linked.length} total
        </span>
        {createHref && linked.length === 0 && (
          <Link className={styles.create} href={createHref}>
            File in Personal Ops
          </Link>
        )}
      </div>

      {showBoundary && (
        <p className={styles.boundary}>
          Decision state is read from Personal Ops. The source module remains unchanged.
        </p>
      )}
    </section>
  );
}
