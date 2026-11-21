"use client";
import { useState, type FormEvent } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import styles from "./WorkspaceRecords.module.css";
export default function RecordNotificationForm({
  workspaceId,
  objectKey,
}: {
  workspaceId: string;
  objectKey: string;
}) {
  const [kind, setKind] = useState("mention"),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const due = String(values.get("due") || "");
      const payload = {
        key: objectKey,
        kind,
        email: values.get("email"),
        due: due ? new Date(due).toISOString() : null,
        eventId: form.dataset.request || crypto.randomUUID(),
      };
      form.dataset.request = payload.eventId;
      const response = await fetch("/api/account/workspaces/" + workspaceId + "/notifications", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the notification.");
      setFeedback(
        kind === "reminder"
          ? "Reminder scheduled."
          : kind === "assignment"
            ? "Assignment added to their inbox."
            : "Mention added to their inbox.",
      );
      form.reset();
      delete form.dataset.request;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notification unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <h2>Notify a member</h2>
      <p>The recipient needs access to this record. Their notification settings control delivery.</p>
      <form
        onSubmit={send}
        onChange={(e) => {
          delete e.currentTarget.dataset.request;
        }}
      >
        <label>
          Update
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="mention">Mention</option>
            <option value="assignment">Assignment</option>
            <option value="reminder">Reminder</option>
          </select>
        </label>
        <label>
          Member email
          <input type="email" name="email" required maxLength={254} />
        </label>
        {kind === "reminder" && (
          <label>
            Remind at (your local time)
            <input name="due" type="datetime-local" required />
          </label>
        )}
        <button type="submit" disabled={busy}>
          {kind === "reminder" ? "Schedule reminder" : "Notify member"}
        </button>
      </form>
      {feedback && <p role="status">{feedback}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
