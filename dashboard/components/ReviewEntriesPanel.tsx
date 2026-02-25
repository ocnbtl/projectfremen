"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  daysUntil,
  formatLocalIsoDate,
  formatMonthDay,
  getNextFirstSunday,
  getNextSunday
} from "../lib/review-schedule";
import type { ReviewEntry, ReviewKind } from "../lib/types";

type ReviewsResponse = {
  ok: boolean;
  item?: ReviewEntry;
  items?: ReviewEntry[];
  error?: string;
};

function dayLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function ReviewEntriesPanel({
  kind,
  initialScheduledFor
}: {
  kind: ReviewKind;
  initialScheduledFor?: string;
}) {
  const router = useRouter();

  const [items, setItems] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  const title = kind === "weekly" ? "Weekly" : "Monthly";

  const nextDate = useMemo(() => {
    const now = new Date();
    return kind === "weekly" ? getNextSunday(now) : getNextFirstSunday(now);
  }, [kind]);

  const nextDateIso = useMemo(() => {
    const fromProp = initialScheduledFor?.trim() || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromProp)) {
      return fromProp;
    }
    return formatLocalIsoDate(nextDate);
  }, [initialScheduledFor, nextDate]);

  const nextDateLabel = useMemo(() => {
    const date = new Date(`${nextDateIso}T00:00:00`);
    const days = daysUntil(date, new Date());
    return `${formatMonthDay(date)} (${dayLabel(days)})`;
  }, [nextDateIso]);

  async function refresh() {
    setLoading(true);
    setError("");

    const res = await fetch(`/api/reviews?kind=${kind}`, { cache: "no-store" });
    const payload = (await res.json()) as ReviewsResponse;
    if (!res.ok || !payload.ok || !payload.items) {
      setError(payload.error || `Failed to load ${kind} reviews`);
      setLoading(false);
      return;
    }

    setItems(payload.items);
    setLoading(false);
  }

  async function createEntry() {
    setCreating(true);
    setError("");

    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, scheduledFor: nextDateIso })
    });

    const payload = (await res.json()) as ReviewsResponse;
    if (!res.ok || !payload.ok || !payload.item) {
      setError(payload.error || `Failed to create ${kind} review`);
      setCreating(false);
      return;
    }

    router.push(`/admin/reviews/${kind}/${payload.item.id}`);
  }

  async function deleteEntry(id: string) {
    const confirmed = window.confirm("Delete this review entry?");
    if (!confirmed) {
      return;
    }

    setDeletingId(id);
    setError("");

    const params = new URLSearchParams({ id, kind });
    const res = await fetch(`/api/reviews?${params.toString()}`, {
      method: "DELETE"
    });

    const payload = (await res.json()) as ReviewsResponse;
    if (!res.ok || !payload.ok || !payload.items) {
      setError(payload.error || `Failed to delete ${kind} review`);
      setDeletingId("");
      return;
    }

    setItems(payload.items);
    setDeletingId("");
  }

  useEffect(() => {
    void refresh();
  }, [kind]);

  return (
    <section className="card review-page-card" style={{ marginTop: 12 }}>
      <div className="review-page-header">
        <h2 style={{ marginBottom: 0 }}>{title} Review Entries</h2>
        <Link href="/admin" className="review-back-link">
          Back to Dashboard
        </Link>
      </div>

      <p className="muted" style={{ marginTop: 6 }}>
        Target duration: {kind === "weekly" ? "under 30 minutes" : "under 60 minutes"}.
      </p>

      {error && <p className="pill warn">{error}</p>}

      <div className="review-create-row">
        <button type="button" onClick={createEntry} disabled={creating} className="review-create-btn">
          {creating ? "Creating..." : `Create New ${title} Entry (${nextDateLabel})`}
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading entries...</p>
      ) : items.length === 0 ? (
        <p className="muted">No entries yet. Create your first {title.toLowerCase()} review entry.</p>
      ) : (
        <div className="review-history-list">
          {items.map((item) => {
            const scheduledDate = new Date(`${item.scheduledFor}T00:00:00`);
            return (
              <article className="review-history-card" key={item.id}>
                <p className="review-history-title">{title} Review</p>
                <p className="review-history-meta">
                  Scheduled: {formatMonthDay(scheduledDate)} ({item.scheduledFor})
                </p>
                <p className="review-history-meta">Updated: {new Date(item.updatedAt).toLocaleString()}</p>

                <div className="review-history-actions">
                  <Link href={`/admin/reviews/${kind}/${item.id}`} className="review-open-link">
                    Open
                  </Link>
                  <button
                    type="button"
                    className="review-delete-btn"
                    onClick={() => deleteEntry(item.id)}
                    disabled={deletingId === item.id}
                    title="Delete entry"
                  >
                    {deletingId === item.id ? "Deleting..." : "🗑 Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
