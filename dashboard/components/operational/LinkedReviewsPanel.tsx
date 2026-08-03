"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createReviewsRepository } from "../../lib/modules/reviews/repository";
import {
  buildReviewSourceHandoffRoute,
  getLinkedReviewContexts,
  reviewContextOwnerRoute
} from "../../lib/modules/reviews/source-context";
import type { ReviewRunView } from "../../lib/modules/reviews/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./LinkedReviewsPanel.module.css";

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sourceKey(source: NativeObjectRef) {
  return [source.module, source.objectType, source.containerObjectId || "root", source.objectId].join(":");
}

export default function LinkedReviewsPanel({
  source,
  initialReviewViews,
  initialError = "",
  title = "ReviewRun context",
  className = "",
  wide = true
}: {
  source: NativeObjectRef;
  initialReviewViews: ReviewRunView[];
  initialError?: string;
  title?: string;
  className?: string;
  wide?: boolean;
}) {
  const repository = useMemo(() => createReviewsRepository(), []);
  const [reviewViews, setReviewViews] = useState(initialReviewViews);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const contexts = useMemo(
    () => getLinkedReviewContexts(reviewViews, source),
    [reviewViews, source]
  );

  useEffect(() => {
    setReviewViews(initialReviewViews);
    setError(initialError);
  }, [initialError, initialReviewViews]);

  async function refresh() {
    if (loading) return;
    setLoading(true);
    const result = await repository.readState({ includeArchived: true });
    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    setReviewViews(result.data.items);
    setError("");
    setLoading(false);
  }

  return (
    <section
      className={`${styles.panel} ${className}`.trim()}
      data-linked-review-contexts={sourceKey(source)}
      data-source-module={source.module}
      data-source-object-id={source.objectId}
      data-wide={wide || undefined}
      aria-live="polite"
      aria-busy={loading || undefined}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <span>Reviews owner</span>
          <strong>{title}</strong>
          <small>Exact source references only; the source object stays unchanged.</small>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => void refresh()}
            disabled={loading}
            aria-label={`Refresh linked ReviewRuns for ${source.label}`}
          >
            {loading ? "Refreshingâ€¦" : "Refresh status"}
          </button>
          <Link className={styles.primaryAction} href={buildReviewSourceHandoffRoute(source)}>
            Link in Reviews
          </Link>
        </div>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error} Last-known Review context remains visible; retry before assuming none exists.
        </p>
      )}

      {contexts.length ? (
        <ul className={styles.list}>
          {contexts.map((context) => (
            <li key={context.reviewRef.objectId}>
              <Link
                href={reviewContextOwnerRoute(context)}
                className={styles.row}
                aria-label={context.evidenceUses.some((item) => item.needsReview) ? "Repair exact evidence in Reviews" : context.evidenceUses.length ? "Open exact evidence use in Reviews" : "Open exact context in Reviews"}
                data-review-run-id={context.reviewRef.objectId}
                data-review-link-state={context.linkState}
                data-review-evidence-use-count={context.evidenceUses.length}
                data-review-evidence-state={context.evidenceUses[0]?.state}
                data-review-evidence-needs-review={context.evidenceUses.some((item) => item.needsReview) || undefined}
              >
                <span className={styles.rowBody}>
                  <strong>{context.title}</strong>
                  <small>
                    {labelize(context.cadence)} Â· {labelize(context.lifecycle)} Â· {context.blockerCount} completion blocker{context.blockerCount === 1 ? "" : "s"}
                  </small>
                  {context.evidenceUses.length > 0 && (
                    <small data-review-evidence-id={context.evidenceUses[0].id}>
                      Evidence use · {context.evidenceUses.map((item) => `${item.title} (${labelize(item.state)}${item.blocksCompletion ? ", blocks completion" : ""})`).join(" · ")}
                    </small>
                  )}
                </span>
                <span className={styles.state}>{context.evidenceUses.some((item) => item.needsReview) ? "Needs review" : labelize(context.linkState)}</span>
                <small className={styles.ownerLink}>
                  {context.evidenceUses.some((item) => item.needsReview) ? "Repair exact evidence in Reviews" : context.evidenceUses.length ? "Open exact evidence use in Reviews" : "Open exact context in Reviews"}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {error
            ? "Current ReviewRun ownership could not be confirmed."
            : "No ReviewRun uses this exact source. Link it only after selecting the owning run in Reviews."}
        </p>
      )}

      <p className={styles.boundary}>
        Reviews owns run lifecycle, checklist, evidence use, completion blockers, and audit. This module owns its local readiness state.
      </p>
    </section>
  );
}
