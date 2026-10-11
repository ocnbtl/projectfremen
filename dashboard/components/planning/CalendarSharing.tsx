"use client";
import { useEffect, useState } from "react";
import type { Calendar } from "../../lib/modules/planning/types";
import type { CalendarShareView, ShareDetails } from "../../lib/modules/planning/calendar-sharing";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./CalendarSharing.module.css";

type Draft = { id?: string; expectedUpdatedAt?: string; name: string; calendarIds: string[]; details: ShareDetails };
export default function CalendarSharing({ calendars }: { calendars: Calendar[] }) {
  const available = calendars.filter(calendar => !calendar.archivedAt);
  const [shares, setShares] = useState<CalendarShareView[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; operation: "revoke" | "regenerate" } | null>(null);
  const [origin, setOrigin] = useState("");
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/planning/shares", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sharing links could not be loaded.");
      setShares(data.shares); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Sharing links could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { setOrigin(window.location.origin); void load(); }, []);
  async function save(input: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/planning/shares", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The change could not be saved.");
      setShares(current => [...current.filter(share => share.id !== data.share.id), data.share]);
      setDraft(null); setConfirm(null);
      setNotice(input.operation === "revoke" ? "Link revoked. Future requests are blocked." : input.operation === "regenerate" ? "New link ready. Replace the old URL in your subscriptions." : "Sharing link saved. Copy it to your calendar app.");
    } catch (error) { setError(error instanceof Error ? error.message : "The change could not be saved."); }
    finally { setBusy(false); }
  }
  function create() {
    const calendar = available.find(calendar => calendar.name.toLowerCase() === "ocean") || available[0];
    setDraft({ name: calendar?.name || "Family calendar", calendarIds: calendar ? [calendar.id] : [], details: { titles: true, locations: false, descriptions: false } });
    setConfirm(null); setNotice("");
  }
  async function copy(share: CalendarShareView) {
    try { await navigator.clipboard.writeText(origin + share.path); setNotice(`${share.name} link copied.`); }
    catch { setNotice("Select the subscription URL, then copy it from your device’s menu."); }
  }
  return <section className={styles.panel} aria-label="Share calendars">
    <div className={styles.heading}><div><h3><UnigentamosIcon role="link" size={18} />Share calendars</h3><p>Subscribe in Apolosign, Apple Calendar, or another calendar app.</p></div>
      <Button icon="plus" onClick={create} disabled={loading || busy || !available.length}>Create sharing link</Button></div>
    <p className={styles.note}>Anyone with a link can read the details you select. Changes sync when the receiving app refreshes; edits there do not change Unigentamos.</p>
    {error && <div role="alert" className={styles.feedback}>{error} <Button disabled={busy} onClick={() => { setDraft(null); setConfirm(null); void load(); }}>Refresh links</Button></div>}
    {notice && <p role="status" className={styles.feedback}>{notice}</p>}
    {loading && <p role="status">Loading sharing links…</p>}
    {draft && <form className={styles.form} onSubmit={event => { event.preventDefault(); void save({ ...draft, operation: draft.id ? "update" : "create" }); }}>
      <h4>{draft.id ? "Edit sharing link" : "New sharing link"}</h4>
      <label className={styles.field}>Link name<input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <fieldset><legend>Calendars to include</legend><div className={styles.choices}>{available.map(calendar => <label key={calendar.id} className={styles.choice}><input type="checkbox" checked={draft.calendarIds.includes(calendar.id)} onChange={event => setDraft({ ...draft, calendarIds: event.target.checked ? [...draft.calendarIds, calendar.id] : draft.calendarIds.filter(id => id !== calendar.id) })} /><span className={styles.dot} style={{ backgroundColor: calendar.color }} /><span>{calendar.name}</span></label>)}</div></fieldset>
      <fieldset><legend>Event details</legend><div className={styles.choices}>
        <label className={styles.choice}><input type="checkbox" checked={draft.details.titles} onChange={event => setDraft({ ...draft, details: { ...draft.details, titles: event.target.checked, ...(!event.target.checked ? { locations: false, descriptions: false } : {}) } })} />Event titles</label>
        <label className={styles.choice}><input type="checkbox" disabled={!draft.details.titles} checked={draft.details.locations} onChange={event => setDraft({ ...draft, details: { ...draft.details, locations: event.target.checked } })} />Locations and addresses</label>
        <label className={styles.choice}><input type="checkbox" disabled={!draft.details.titles} checked={draft.details.descriptions} onChange={event => setDraft({ ...draft, details: { ...draft.details, descriptions: event.target.checked } })} />Descriptions</label>
      </div><p className={styles.note}>{draft.details.titles ? "Dates and times are always included. Linked people, objects, and reminders stay private." : "Busy only: share dates and times without event names, locations, or descriptions."}</p></fieldset>
      <div className={styles.actions}><Button type="submit" busy={busy} disabled={!draft.calendarIds.length}>{draft.id ? "Save changes" : "Create link"}</Button><Button disabled={busy} onClick={() => setDraft(null)}>Cancel</Button></div>
    </form>}
    <div className={styles.links}>{shares.map(share => <article key={share.id} className={styles.card} aria-label={`${share.name} sharing link`}>
      <div className={styles.cardHeading}><strong>{share.name}</strong><span className={styles.badge}>{share.revokedAt ? "Revoked" : "Active"}</span></div>
      <p className={styles.note}>{share.calendarIds.map(id => calendars.find(calendar => calendar.id === id)?.name || "Removed calendar").join(" · ")} · {share.details.titles ? ["Titles", share.details.locations && "locations", share.details.descriptions && "descriptions"].filter(Boolean).join(", ") : "Busy only"}</p>
      {share.path && <div className={styles.url}><input aria-label={`${share.name} subscription URL`} readOnly value={origin + share.path} onFocus={event => event.target.select()} /><Button onClick={() => void copy(share)} icon="copy">Copy link</Button></div>}
      <div className={styles.actions}><Button disabled={busy} onClick={() => { setDraft({ id: share.id, expectedUpdatedAt: share.updatedAt, name: share.name, calendarIds: share.calendarIds.filter(id => available.some(calendar => calendar.id === id)), details: share.details }); setConfirm(null); }}>Edit details</Button>
        <Button disabled={busy} onClick={() => setConfirm({ id: share.id, operation: "regenerate" })}>{share.revokedAt ? "Create replacement link" : "Regenerate link"}</Button>
        {!share.revokedAt && <Button disabled={busy} onClick={() => setConfirm({ id: share.id, operation: "revoke" })}>Revoke link</Button>}</div>
      {confirm?.id === share.id && <div className={styles.confirm}>
        <p>{confirm.operation === "revoke" ? "Stop access through this URL?" : "Replace this URL with a new one?"} Existing subscriptions using the old link will stop updating. Previously downloaded events may remain in the receiving app.</p>
        <div className={styles.actions}><Button busy={busy} onClick={() => void save({ operation: confirm.operation, id: share.id, expectedUpdatedAt: share.updatedAt })}>{confirm.operation === "revoke" ? "Confirm revoke" : "Confirm replacement"}</Button><Button disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button></div>
      </div>}
    </article>)}</div>
    <details className={styles.help}><summary>Connect to Apolosign</summary><p>In the Apolosign phone app, open the menu → My Family → + in Calendars → Subscribe via URL. Paste your link and choose the name and participants.</p><p>Feeds include the previous year and next two years, refreshed as time moves forward. Only events stored in your selected calendars are shared; the separate birthday, holiday, and custom-date overlays are not included. Imported calendars use their latest saved events in Unigentamos.</p></details>
  </section>;
}
