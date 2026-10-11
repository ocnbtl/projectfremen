"use client";
import { useEffect, useState } from "react";
import type { Calendar } from "../../lib/modules/planning/types";
import type { BookingLinkView, BookingEmailSummary } from "../../lib/modules/planning/booking-types";
import { addDays, localDate } from "../../lib/modules/planning/calendar-model";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import EventDateTimePicker from "./EventDateTimePicker";
import BookingDisclosure from "./BookingDisclosure";
import ManualBookingSlots from "./ManualBookingSlots";
import BookingEmailSettings from "./BookingEmailSettings";
import shared from "./CalendarSharing.module.css";
import styles from "./CalendarBookings.module.css";
type Draft = Omit<BookingLinkView, "id" | "path" | "createdAt" | "updatedAt" | "bookingCount"> & { id?: string; expectedUpdatedAt?: string };
export default function CalendarBookings({ calendars, onSummary }: { calendars: Calendar[]; onSummary?: (summary: {active:number;total:number}) => void }) {
  const active = calendars.filter(calendar => !calendar.archivedAt);
  const [links, setLinks] = useState<BookingLinkView[]>([]), [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [origin, setOrigin] = useState("");
  const [emails, setEmails] = useState<BookingEmailSummary | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; operation: "revoke" | "regenerate" } | null>(null);
  const status = (link: BookingLinkView) => link.revokedAt ? "Closed" : link.through < localDate(new Date(), link.timeZone) ? "Ended" : "Active";
  useEffect(() => { if (!loading && !error) onSummary?.({active:links.filter(link => !link.revokedAt && link.through >= localDate(new Date(), link.timeZone)).length,total:links.length}); }, [links, loading, error, onSummary]);
  const emailDefaults = { guestConfirmation:true, organizerNotification:true, organizerEmails:emails?.organizerEmail ? [emails.organizerEmail] : [], guestMessage:"" };
  async function load() {
    setLoading(true);
    try { const response = await fetch("/api/planning/bookings", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setLinks(body.links); setEmails(body.emails || null); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Booking links could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { setOrigin(window.location.origin); void load(); }, []);
  function create() {
    const calendar = active.find(calendar => calendar.name.toLowerCase() === "ocean") || active[0];
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, from = localDate(new Date(), timeZone);
    setDraft({ name: "Meet with me", description: "", location: "", calendarId: calendar?.id || "", conflictCalendarIds: calendar ? [calendar.id] : [], timeZone, durationMinutes: 30, bufferMinutes: 0, noticeHours: 2, mode: "automatic", from, through: addDays(from, 14), weekdays: [1,2,3,4,5], dayStart: "09:00", dayEnd: "17:00", manualStarts: [], emailPreferences:emailDefaults }); setConfirm(null); setNotice("");
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
  async function retryEmails() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/planning/booking-emails", { method: "POST", headers: buildJsonHeadersWithCsrf() });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Email delivery could not be checked.");
      setEmails(body.emails); setNotice("Email delivery status refreshed. Confirmed appointments stay on your calendar.");
    } catch (error) { setError(error instanceof Error ? error.message : "Email delivery could not be checked."); }
    finally { setBusy(false); }
  }
  return <section className={shared.panel} aria-label="Booking links">
    <div className={shared.heading}><div><h3><UnigentamosIcon role="calendar" size={18} />{draft ? draft.id ? "Edit booking link" : "New booking link" : "Take bookings"}</h3>{!draft && <p>Offer available times, with instant confirmation.</p>}</div>{!draft && <Button icon="plus" intent="primary" disabled={loading || busy || !active.length} onClick={create} aria-label="Create booking link">New link</Button>}</div>


    {error && <div role="alert" className={shared.feedback}>{error} <Button disabled={busy} onClick={() => void load()}>Refresh booking links</Button></div>}
    {notice && <p role="status" className={shared.feedback}>{notice}</p>}{loading && <p role="status">Loading booking links…</p>}
    {draft && <form className={`${shared.form} ${styles.form}`} onSubmit={event => { event.preventDefault(); void save({ ...draft, operation: draft.id ? "update" : "create" }); }}>

      <h4 className={styles.srOnly}>{draft.id ? "Edit booking link" : "New booking link"}</h4>
      <div className={styles.editorColumns}>
        <section className={styles.editorSection} aria-label="Booking details">
          <h5><UnigentamosIcon role="calendar" size={16} />Booking details</h5>
          <label>Booking title<input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className={styles.grid}>
            <label>Add bookings to<SelectField aria-label="Add bookings to" value={draft.calendarId} onChange={event => setDraft({ ...draft, calendarId: event.target.value, conflictCalendarIds: [...new Set([...draft.conflictCalendarIds, event.target.value])] })}>{active.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</SelectField></label>
            <label>Appointment length<SelectField aria-label="Appointment length" value={draft.durationMinutes} onChange={event => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}>{[15,20,30,45,60,90,120].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</SelectField></label>
          </div>
          <label><span className={styles.fieldLabel}>Description for guests <small>(optional)</small></span><textarea rows={2} maxLength={1500} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
          <label><span className={styles.fieldLabel}>Location or meeting link <small>(optional)</small></span><input maxLength={500} value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} /></label>
          <label>Schedule time zone<SelectField searchable autoFocusSearch={false} aria-label="Schedule time zone" value={draft.timeZone} onChange={event => setDraft({ ...draft, timeZone: event.target.value })}>{[...new Set(["UTC", draft.timeZone, ...Intl.supportedValuesOf("timeZone")])].sort().map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ").replaceAll("/", " / ")}</option>)}</SelectField></label>
        </section>
        <section className={styles.editorSection} aria-label="Booking availability">
          <h5><UnigentamosIcon role="clock" size={16} />Availability</h5>
          <fieldset><legend className={styles.srOnly}>How should people choose a time?</legend><div className={styles.modes}>{(["automatic", "manual"] as const).map(mode => <label key={mode}><input type="radio" name="booking-mode" value={mode} checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })} /><span>{mode === "automatic" ? "Use my open time" : "Choose specific times"}</span></label>)}</div></fieldset>
          <div className={styles.grid}>
            <EventDateTimePicker compact dateOnly allDay label="First date" value={draft.from} timeZone={draft.timeZone} onChange={from => {setDraft({ ...draft, from, manualStarts:draft.manualStarts.filter(value => value.slice(0,10) >= from && value.slice(0,10) <= addDays(from,90)), through:draft.through < from ? from : draft.through > addDays(from,90) ? addDays(from,90) : draft.through });}} />
            <EventDateTimePicker compact dateOnly allDay label="Last date" value={draft.through} min={draft.from} max={addDays(draft.from,90)} timeZone={draft.timeZone} onChange={through => {setDraft({ ...draft, through, manualStarts:draft.manualStarts.filter(value => value.slice(0,10) <= through) });}} />
          </div>
          {draft.mode === "automatic" ? <>
            <fieldset><legend>Days to offer</legend><div className={styles.weekdays}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day,index) => <button type="button" key={day} aria-label={day} aria-pressed={draft.weekdays.includes(index+1)} onClick={() => setDraft({ ...draft, weekdays:draft.weekdays.includes(index+1) ? draft.weekdays.filter(day => day !== index+1) : [...draft.weekdays,index+1] })}>{day}</button>)}</div></fieldset>
            <div className={styles.grid}>
              <EventDateTimePicker compact timeOnly label="Available from" value={draft.from+"T"+draft.dayStart} allDay={false} timeZone={draft.timeZone} onChange={value => setDraft({ ...draft, dayStart:value.slice(11,16) })} />
              <EventDateTimePicker compact timeOnly label="Available until" value={draft.from+"T"+draft.dayEnd} allDay={false} timeZone={draft.timeZone} onChange={value => setDraft({ ...draft, dayEnd:value.slice(11,16) })} />
            </div>
            <p className={shared.note}>Busy times are removed automatically. Offer up to 90 days at a time.</p>
          </> : <ManualBookingSlots from={draft.from} through={draft.through} duration={draft.durationMinutes} timeZone={draft.timeZone} values={draft.manualStarts} onChange={manualStarts => setDraft({ ...draft, manualStarts })} />}
        </section>
      </div>
      <BookingDisclosure title="Scheduling settings" summary={`${draft.bufferMinutes} min buffer · ${draft.noticeHours}h notice`}>
        <fieldset><legend>Check calendars for conflicts</legend><div className={shared.choices}>{active.map(calendar => <label className={shared.choice} key={calendar.id}><input type="checkbox" disabled={calendar.id === draft.calendarId} checked={calendar.id === draft.calendarId || draft.conflictCalendarIds.includes(calendar.id)} onChange={event => setDraft({ ...draft, conflictCalendarIds:event.target.checked ? [...draft.conflictCalendarIds,calendar.id] : draft.conflictCalendarIds.filter(id => id !== calendar.id) })} /><span className={shared.dot} style={{backgroundColor:calendar.color}} />{calendar.name}</label>)}</div><p className={shared.note}>Your destination calendar is always checked, including hidden and all-day events. Keep imported calendars refreshed.</p></fieldset>
        <div className={styles.grid}><label>Buffer between appointments<SelectField aria-label="Buffer between appointments" value={draft.bufferMinutes} onChange={event => setDraft({ ...draft, bufferMinutes:Number(event.target.value) })}>{[0,5,10,15,30,60].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</SelectField></label><label>Minimum advance notice<SelectField aria-label="Minimum advance notice" value={draft.noticeHours} onChange={event => setDraft({ ...draft, noticeHours:Number(event.target.value) })}>{[0,1,2,4,12,24,48,72].map(hours => <option key={hours} value={hours}>{hours} hours</option>)}</SelectField></label></div>
      </BookingDisclosure>
      <BookingEmailSettings value={draft.emailPreferences || emailDefaults} onChange={emailPreferences => setDraft({ ...draft, emailPreferences })} ready={!!emails?.ready} />
      <div className={styles.formFooter}><p className={shared.note}>Bookings confirm immediately{emails?.ready && (draft.emailPreferences?.guestConfirmation ?? true) ? " with a confirmation email for your guest" : " on screen"}. Your other events stay private.</p><div className={shared.actions}><Button disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button intent="primary" type="submit" busy={busy} disabled={draft.mode === "manual" ? !draft.manualStarts.length : !draft.weekdays.length}>{draft.id ? "Save changes" : "Create link"}</Button></div></div>
    </form>}
    {!loading && !error && !links.length && !draft && <p className={shared.empty}>No booking links yet. Offer your open time or choose specific slots.</p>}
    <div className={shared.links} hidden={!!draft}>{[...links].sort((a,b) => Number(status(a) !== "Active") - Number(status(b) !== "Active")).map(link => <article className={shared.card} key={link.id} aria-label={`${link.name} booking link`}>
      <div className={shared.cardHeading}><strong>{link.name}</strong><span className={shared.badge} data-inactive={status(link) !== "Active"}>{status(link)}</span>{link.path && <Button icon="copy" onClick={() => void copy(link)}>Copy link</Button>}</div><div className={shared.calendarList}><span><UnigentamosIcon role="calendar" size={14} /><i className={shared.dot} style={{backgroundColor:calendars.find(calendar => calendar.id === link.calendarId)?.color || "#999"}} />{calendars.find(calendar => calendar.id === link.calendarId)?.name || "Removed calendar"}</span><span>{link.durationMinutes} min · {link.mode === "manual" ? "Specific times" : "Open time"}</span><span>{link.bookingCount} booked</span></div><p className={shared.note}>{link.from} – {link.through} · {link.timeZone.replaceAll("_", " ")}</p>
      <details className={shared.manage}><summary>Availability &amp; link settings</summary>
      {link.path && <><div className={shared.url}><input aria-label={`${link.name} booking URL`} readOnly value={origin+link.path} onFocus={event => event.target.select()} /></div><a className={styles.preview} href={link.path} target="_blank" rel="noreferrer"><UnigentamosIcon role="open" size={14} /> Preview booking page</a></>}
      <div className={shared.actions}><Button disabled={busy} onClick={() => { setDraft({ ...link, expectedUpdatedAt: link.updatedAt, emailPreferences:link.emailPreferences ? { ...link.emailPreferences, organizerEmails:link.emailPreferences.organizerEmails.length ? link.emailPreferences.organizerEmails : emailDefaults.organizerEmails } : emailDefaults, conflictCalendarIds: link.conflictCalendarIds.filter(id => active.some(calendar => calendar.id === id)) }); setConfirm(null); setNotice(""); }}>Edit availability</Button><Button disabled={busy} onClick={() => setConfirm({ id: link.id, operation: "regenerate" })}>Replace link</Button>{!link.revokedAt && <Button disabled={busy} onClick={() => setConfirm({ id: link.id, operation: "revoke" })}>Close bookings</Button>}</div>
      {confirm?.id === link.id && <div className={shared.confirm}><p>{confirm.operation === "revoke" ? "Close this booking link?" : "Replace this booking URL?"} The old URL will stop accepting bookings. Existing appointments will stay on your calendar.</p><div className={shared.actions}><Button busy={busy} onClick={() => void save({ ...confirm, expectedUpdatedAt: link.updatedAt })}>Confirm</Button><Button disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button></div></div>}
    </details>
    </article>)}</div>
    {emails && !draft && <div className={styles.emailStatus} aria-label="Booking emails"><div><strong>{emails.ready ? "Email delivery ready" : "Email setup needed"}</strong><p className={shared.note}>{emails.ready ? "Set guest confirmations, recipients and a personal message on each booking link." : "Connect a verified sender to email guests and receive booking notifications. Bookings still confirm on screen."}</p>{!!(emails.pending + emails.failed + emails.review) && <p className={shared.note}>{emails.pending} pending · {emails.failed} need attention{emails.review ? ` · ${emails.review} need delivery review` : ""}. Confirmed bookings are safe.</p>}{emails.review > 0 && <p className={shared.note}>Check these messages in Resend before sending again to avoid duplicates.</p>}</div>{emails.ready && !!(emails.pending + emails.failed) && <Button disabled={busy} onClick={() => void retryEmails()}>Retry emails</Button>}</div>}
  </section>;
}
