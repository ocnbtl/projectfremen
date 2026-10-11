"use client";
import { useEffect, useState } from "react";
import type { Calendar } from "../../lib/modules/planning/types";
import type { BookingLinkView } from "../../lib/modules/planning/booking-types";
import { addDays, localDate } from "../../lib/modules/planning/calendar-model";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import shared from "./CalendarSharing.module.css";
import styles from "./CalendarBookings.module.css";
type Draft = Omit<BookingLinkView, "id" | "path" | "createdAt" | "updatedAt" | "bookingCount"> & { id?: string; expectedUpdatedAt?: string };
export default function CalendarBookings({ calendars }: { calendars: Calendar[] }) {
  const active = calendars.filter(calendar => !calendar.archivedAt);
  const [links, setLinks] = useState<BookingLinkView[]>([]), [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [origin, setOrigin] = useState(""), [manual, setManual] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; operation: "revoke" | "regenerate" } | null>(null);
  async function load() {
    setLoading(true);
    try { const response = await fetch("/api/planning/bookings", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setLinks(body.links); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Booking links could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { setOrigin(window.location.origin); void load(); }, []);
  function create() {
    const calendar = active.find(calendar => calendar.name.toLowerCase() === "ocean") || active[0];
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, from = localDate(new Date(), timeZone);
    setDraft({ name: "Meet with me", description: "", location: "", calendarId: calendar?.id || "", conflictCalendarIds: calendar ? [calendar.id] : [], timeZone, durationMinutes: 30, bufferMinutes: 0, noticeHours: 2, mode: "automatic", from, through: addDays(from, 14), weekdays: [1,2,3,4,5], dayStart: "09:00", dayEnd: "17:00", manualStarts: [] }); setManual(""); setConfirm(null); setNotice("");
  }
  async function save(input: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/planning/bookings", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify(input) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "The booking link could not be saved.");
      setLinks(current => [...current.filter(link => link.id !== body.link.id), body.link]); setDraft(null); setConfirm(null);
      setNotice(input.operation === "revoke" ? "Booking link closed. Existing appointments stay on your calendar." : input.operation === "regenerate" ? "New booking link ready. The old URL no longer accepts bookings." : "Booking link saved. Preview it, then copy the URL to share.");
    } catch (error) { setError(error instanceof Error ? error.message : "The booking link could not be saved."); }
    finally { setBusy(false); }
  }
  async function copy(link: BookingLinkView) {
    try { await navigator.clipboard.writeText(origin + link.path); setNotice("Booking link copied."); }
    catch { setNotice("Select and copy the booking URL from the field."); }
  }
  return <section className={shared.panel} aria-label="Booking links">
    <div className={shared.heading}><div><h3><UnigentamosIcon role="calendar" size={18} />Take bookings</h3><p>Let people choose a time and book directly into your calendar.</p></div><Button icon="plus" disabled={loading || busy || !active.length} onClick={create}>Create booking link</Button></div>
    <p className={shared.note}>Choose specific times or automatically offer free time. Bookings confirm immediately; guests provide a name, email, and optional note. Your other events stay private.</p>
    {error && <div role="alert" className={shared.feedback}>{error} <Button disabled={busy} onClick={() => void load()}>Refresh booking links</Button></div>}
    {notice && <p role="status" className={shared.feedback}>{notice}</p>}{loading && <p role="status">Loading booking links…</p>}
    {draft && <form className={`${shared.form} ${styles.form}`} onSubmit={event => { event.preventDefault(); void save({ ...draft, operation: draft.id ? "update" : "create" }); }}>
      <h4>{draft.id ? "Edit booking link" : "New booking link"}</h4>
      <fieldset><legend>How should people choose a time?</legend><div className={styles.modes}>{(["automatic", "manual"] as const).map(mode => <label key={mode}><input type="radio" name="booking-mode" value={mode} checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })} /><span><strong>{mode === "automatic" ? "Use my open time" : "Choose specific times"}</strong><small>{mode === "automatic" ? "Offer free appointments within your schedule." : "Add the exact starts you want to offer."}</small></span></label>)}</div></fieldset>
      <div className={styles.grid}><label>Booking title<input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>Add bookings to<select aria-label="Add bookings to" value={draft.calendarId} onChange={event => setDraft({ ...draft, calendarId: event.target.value, conflictCalendarIds: [...new Set([...draft.conflictCalendarIds, event.target.value])] })}>{active.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label></div>
      <label>Description for guests <span>(optional)</span><textarea rows={2} maxLength={1500} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Location or meeting link <span>(optional)</span><input maxLength={500} value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} /></label>
      <div className={styles.grid}><label>Appointment length<select aria-label="Appointment length" value={draft.durationMinutes} onChange={event => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}>{[15,20,30,45,60,90,120].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><label>Schedule time zone<select aria-label="Schedule time zone" value={draft.timeZone} onChange={event => setDraft({ ...draft, timeZone: event.target.value })}>{[...new Set(["UTC", draft.timeZone, ...Intl.supportedValuesOf("timeZone")])].sort().map(zone => <option key={zone}>{zone}</option>)}</select></label></div>
      <div className={styles.grid}><label>First date<input required type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label><label>Last date<input required type="date" min={draft.from} max={draft.from ? addDays(draft.from,90) : undefined} value={draft.through} onChange={event => setDraft({ ...draft, through: event.target.value })} /></label></div>
      {draft.mode === "automatic" ? <><fieldset><legend>Days to offer</legend><div className={styles.weekdays}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day,index) => <label key={day}><input type="checkbox" checked={draft.weekdays.includes(index+1)} onChange={event => setDraft({ ...draft, weekdays: event.target.checked ? [...draft.weekdays,index+1] : draft.weekdays.filter(day => day !== index+1) })} />{day}</label>)}</div></fieldset><div className={styles.grid}><label>Available from<input required type="time" value={draft.dayStart} onChange={event => setDraft({ ...draft, dayStart: event.target.value })} /></label><label>Available until<input required type="time" value={draft.dayEnd} onChange={event => setDraft({ ...draft, dayEnd: event.target.value })} /></label></div><p className={shared.note}>Times are spaced by the appointment length and buffer. Busy times are removed automatically as your calendar changes.</p></> : <div className={styles.manual}><label>Available start time<input type="datetime-local" min={draft.from+"T00:00"} max={draft.through+"T23:59"} value={manual} onChange={event => setManual(event.target.value)} /></label><Button disabled={!manual || draft.manualStarts.length >= 200} onClick={() => { setDraft({ ...draft, manualStarts: [...new Set([...draft.manualStarts, manual])].sort() }); setManual(""); }}>Add time</Button><ul>{draft.manualStarts.map(start => <li key={start}><span>{start.replace("T", " · ")}</span><Button aria-label={`Remove ${start}`} icon="close" onClick={() => setDraft({ ...draft, manualStarts: draft.manualStarts.filter(value => value !== start) })}>Remove</Button></li>)}</ul><p className={shared.note}>Each time lasts {draft.durationMinutes} minutes. Times that conflict with your calendar will not be offered.</p></div>}
      <fieldset><legend>Check these calendars for conflicts</legend><div className={shared.choices}>{active.map(calendar => <label className={shared.choice} key={calendar.id}><input type="checkbox" disabled={calendar.id === draft.calendarId} checked={calendar.id === draft.calendarId || draft.conflictCalendarIds.includes(calendar.id)} onChange={event => setDraft({ ...draft, conflictCalendarIds: event.target.checked ? [...draft.conflictCalendarIds, calendar.id] : draft.conflictCalendarIds.filter(id => id !== calendar.id) })} /><span className={shared.dot} style={{ backgroundColor: calendar.color }} />{calendar.name}</label>)}</div><p className={shared.note}>The destination calendar is always checked, including hidden and all-day events. Imported calendars use their latest saved data; keep them refreshed.</p></fieldset>
      <div className={styles.grid}><label>Buffer between appointments<select aria-label="Buffer between appointments" value={draft.bufferMinutes} onChange={event => setDraft({ ...draft, bufferMinutes: Number(event.target.value) })}>{[0,5,10,15,30,60].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><label>Minimum advance notice<select aria-label="Minimum advance notice" value={draft.noticeHours} onChange={event => setDraft({ ...draft, noticeHours: Number(event.target.value) })}>{[0,1,2,4,12,24,48,72].map(hours => <option key={hours} value={hours}>{hours} hours</option>)}</select></label></div>
      <p className={shared.note}>Guests see confirmation on the booking page. No emails are sent. You can edit or remove appointments in Calendar.</p>
      <div className={shared.actions}><Button intent="primary" type="submit" busy={busy} disabled={draft.mode === "manual" && !draft.manualStarts.length}>{draft.id ? "Save booking link" : "Create link"}</Button><Button disabled={busy} onClick={() => setDraft(null)}>Cancel</Button></div>
    </form>}
    <div className={shared.links}>{links.map(link => <article className={shared.card} key={link.id} aria-label={`${link.name} booking link`}>
      <div className={shared.cardHeading}><strong>{link.name}</strong><span className={shared.badge}>{link.revokedAt ? "Closed" : "Active"}</span></div><p className={shared.note}>{link.mode === "manual" ? "Specific times" : "Open time"} · {link.durationMinutes} min · {calendars.find(calendar => calendar.id === link.calendarId)?.name || "Removed calendar"}<br />{link.from} – {link.through} · {link.timeZone}<br />{link.bookingCount} booking{link.bookingCount === 1 ? "" : "s"} received</p>
      {link.path && <><div className={shared.url}><input aria-label={`${link.name} booking URL`} readOnly value={origin+link.path} onFocus={event => event.target.select()} /><Button icon="copy" onClick={() => void copy(link)}>Copy link</Button></div><a className={styles.preview} href={link.path} target="_blank" rel="noreferrer">Preview booking page ↗</a></>}
      <div className={shared.actions}><Button disabled={busy} onClick={() => { setDraft({ ...link, expectedUpdatedAt: link.updatedAt, conflictCalendarIds: link.conflictCalendarIds.filter(id => active.some(calendar => calendar.id === id)) }); setConfirm(null); }}>Edit availability</Button><Button disabled={busy} onClick={() => setConfirm({ id: link.id, operation: "regenerate" })}>Replace link</Button>{!link.revokedAt && <Button disabled={busy} onClick={() => setConfirm({ id: link.id, operation: "revoke" })}>Close bookings</Button>}</div>
      {confirm?.id === link.id && <div className={shared.confirm}><p>{confirm.operation === "revoke" ? "Close this booking link?" : "Replace this booking URL?"} The old URL will stop accepting bookings. Existing appointments will stay on your calendar.</p><div className={shared.actions}><Button busy={busy} onClick={() => void save({ ...confirm, expectedUpdatedAt: link.updatedAt })}>Confirm</Button><Button disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button></div></div>}
    </article>)}</div>
  </section>;
}
