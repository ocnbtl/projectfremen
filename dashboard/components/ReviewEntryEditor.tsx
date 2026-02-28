"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildCsrfHeaders, buildJsonHeadersWithCsrf } from "../lib/client-csrf";
import { getReviewFields } from "../lib/review-templates";
import { formatMonthDay } from "../lib/review-schedule";
import type { ReviewEntry, ReviewKind } from "../lib/types";

type ReviewsResponse = {
  ok: boolean;
  item?: ReviewEntry;
  error?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ReviewEntryEditor({
  kind,
  entryId
}: {
  kind: ReviewKind;
  entryId: string;
}) {
  const router = useRouter();
  const fields = useMemo(() => getReviewFields(kind), [kind]);

  const [loaded, setLoaded] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const lastSavedPayloadRef = useRef("");

  const title = kind === "weekly" ? "Weekly" : "Monthly";

  const payloadJson = useMemo(
    () => JSON.stringify({ scheduledFor, values }),
    [scheduledFor, values]
  );

  async function refresh() {
    setError("");
    const params = new URLSearchParams({ id: entryId, kind });
    const res = await fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" });
    const payload = (await res.json()) as ReviewsResponse;

    if (!res.ok || !payload.ok || !payload.item) {
      setError(payload.error || "Failed to load review entry");
      setLoaded(true);
      return;
    }

    setScheduledFor(payload.item.scheduledFor);
    setValues(payload.item.values || {});
    lastSavedPayloadRef.current = JSON.stringify({
      scheduledFor: payload.item.scheduledFor,
      values: payload.item.values || {}
    });
    setLoaded(true);
  }

  async function persistNow(nextPayload: string) {
    setSaveState("saving");
    setError("");

    const parsed = JSON.parse(nextPayload) as {
      scheduledFor: string;
      values: Record<string, string>;
    };

    const res = await fetch("/api/reviews", {
      method: "PATCH",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({
        id: entryId,
        kind,
        scheduledFor: parsed.scheduledFor,
        values: parsed.values
      })
    });

    const payload = (await res.json()) as ReviewsResponse;
    if (!res.ok || !payload.ok || !payload.item) {
      setSaveState("error");
      setError(payload.error || "Failed to save review entry");
      return;
    }

    lastSavedPayloadRef.current = JSON.stringify({
      scheduledFor: payload.item.scheduledFor,
      values: payload.item.values || {}
    });
    setSaveState("saved");
  }

  async function saveNowIfDirty() {
    if (!loaded || !scheduledFor) {
      return;
    }
    const nextPayload = JSON.stringify({ scheduledFor, values });
    if (nextPayload === lastSavedPayloadRef.current) {
      return;
    }
    await persistNow(nextPayload);
  }

  async function deleteEntry() {
    const confirmed = window.confirm("Delete this review entry?");
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");

    const params = new URLSearchParams({ id: entryId, kind });
    const res = await fetch(`/api/reviews?${params.toString()}`, {
      method: "DELETE",
      headers: buildCsrfHeaders()
    });

    const payload = (await res.json()) as ReviewsResponse;
    if (!res.ok || !payload.ok) {
      setDeleting(false);
      setError(payload.error || "Failed to delete review entry");
      return;
    }

    router.push(`/admin/reviews/${kind}`);
  }

  useEffect(() => {
    void refresh();
  }, [entryId, kind]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    if (!scheduledFor) {
      return;
    }
    if (payloadJson === lastSavedPayloadRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      void persistNow(payloadJson);
    }, 550);

    return () => clearTimeout(timer);
  }, [loaded, payloadJson, scheduledFor]);

  const dateLabel = scheduledFor
    ? formatMonthDay(new Date(`${scheduledFor}T00:00:00`))
    : "";

  return (
    <section className="card review-page-card" style={{ marginTop: 12 }}>
      <div className="review-page-header">
        <h2 style={{ marginBottom: 0 }}>{title} Review Entry</h2>
        <Link href={`/admin/reviews/${kind}`} className="review-back-link">
          Back to {title} Entries
        </Link>
      </div>

      {error && <p className="pill warn">{error}</p>}

      {!loaded ? (
        <p className="muted">Loading entry...</p>
      ) : (
        <>
          <div className="review-editor-meta">
            <label className="review-date-field">
              Scheduled Date
              <input
                type="date"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                onBlur={() => {
                  void saveNowIfDirty();
                }}
              />
            </label>

            <p className="muted" style={{ margin: 0 }}>
              {dateLabel ? `${dateLabel} (${scheduledFor})` : ""}
            </p>

            <div className="review-editor-actions">
              <span className="pill">{saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Auto-save on"}</span>
              <button
                type="button"
                className="review-delete-btn"
                onClick={deleteEntry}
                disabled={deleting}
                title="Delete entry"
              >
                {deleting ? "Deleting..." : "🗑 Delete"}
              </button>
            </div>
          </div>

          <div className="review-form-grid">
            {fields.map((field) => (
              <label key={field.id} className="review-field">
                <span>{field.label}</span>
                <p className="review-field-help muted">{field.description}</p>
                {(field.rows || 4) <= 1 ? (
                  <input
                    type="text"
                    value={values[field.id] || ""}
                    placeholder={field.placeholder || ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setValues((current) => ({
                        ...current,
                        [field.id]: nextValue
                      }));
                    }}
                    onBlur={() => {
                      void saveNowIfDirty();
                    }}
                  />
                ) : (
                  <textarea
                    rows={field.rows || 4}
                    value={values[field.id] || ""}
                    placeholder={field.placeholder || ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setValues((current) => ({
                        ...current,
                        [field.id]: nextValue
                      }));
                    }}
                    onBlur={() => {
                      void saveNowIfDirty();
                    }}
                  />
                )}
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
