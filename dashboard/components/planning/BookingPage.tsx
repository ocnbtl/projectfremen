"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicBooking, BookingSlot } from "../../lib/modules/planning/booking-types";
import styles from "./BookingPage.module.css";

function dateKey(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
export default function BookingPage({ token }: { token: string }) {
  const [data, setData] = useState<PublicBooking | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [zone, setZone] = useState("UTC"), [day, setDay] = useState(""), [selected, setSelected] = useState<BookingSlot | null>(null);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [note, setNote] = useState(""), [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState<(BookingSlot & { name: string; location: string }) | null>(null);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null), form = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/book/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "This booking page is unavailable.");
      setData(body); setError("");
    } catch (error) { setData(null); setError(error instanceof Error ? error.message : "This booking page is unavailable."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); void load(); }, [load]);
  const zones = useMemo(() => [...new Set([zone, data?.timeZone || "UTC", ...Intl.supportedValuesOf("timeZone")])].sort(), [zone, data?.timeZone]);
  const days = useMemo(() => [...new Set((data?.slots || []).map(slot => dateKey(slot.start, zone)))], [data, zone]);
  const chosenDay = days.includes(day) ? day : days[0];
  const time = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
  const date = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError("");
    const fingerprint = JSON.stringify([selected.start, name, email, note]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/book/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: selected.start, name, email, note, website, requestId: attempt.current.id }) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setSelected(null); await load(); }
        throw new Error(body.error || "Your booking could not be confirmed. Try again.");
      }
      setConfirmed(body.booking);
    } catch (error) { setError(error instanceof Error ? error.message : "Connection interrupted. Try again to check your booking."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <a className={styles.brand} href="/" aria-label="Unigentamos home"><img src="/unigentamos-logo.svg" width="28" height="28" alt="" />Unigentamos</a>
    <section className={styles.card} aria-label="Book an appointment">
      {confirmed ? <div className={styles.confirmation}><span aria-hidden="true" className={styles.check}>✓</span><h1>You’re booked</h1><h2>{confirmed.name}</h2><p>{date(confirmed.start)}</p><p>{time(confirmed.start)} – {time(confirmed.end)}</p>{confirmed.location && <p>{confirmed.location}</p>}<p className={styles.muted}>Your appointment has been added to the organizer’s calendar. Keep this page or take a screenshot for your records. Contact the organizer if you need to change or cancel it.</p><p className={styles.muted}>No confirmation email is sent.</p></div> : <>
        <header className={styles.header}><span className={styles.eyebrow}>BOOK A TIME</span><h1>{data?.name || "Choose a time to meet"}</h1>{data && <><p className={styles.duration}>{data.durationMinutes} minute appointment · Confirmed immediately</p>{data.description && <p className={styles.description}>{data.description}</p>}{data.location && <p className={styles.location}>Location · {data.location}</p>}</>}</header>
        {error && <div role="alert" className={styles.error}>{error} {!busy && <button type="button" onClick={() => void load()}>Refresh available times</button>}</div>}
        {loading && <p role="status">Finding available times…</p>}
        {data && !loading && <>
          <label className={styles.zone}>Times shown in<select aria-label="Display time zone" value={zone} disabled={busy} onChange={event => { setZone(event.target.value); setDay(""); }}>{zones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
          {!days.length ? <div className={styles.empty}><h2>No times are available</h2><p>Please check back later or contact the organizer.</p></div> : <div className={styles.availability}>
            <div className={styles.days} role="group" aria-label="Available dates">{days.map(key => <button type="button" key={key} disabled={busy} aria-pressed={chosenDay === key} onClick={() => { setDay(key); setSelected(null); }}><span>{new Date(key+"T12:00:00Z").toLocaleDateString(undefined,{timeZone:"UTC",weekday:"short"})}</span><strong>{new Date(key+"T12:00:00Z").toLocaleDateString(undefined,{timeZone:"UTC",month:"short",day:"numeric"})}</strong></button>)}</div>
            <div className={styles.times} role="group" aria-label="Available times">{data.slots.filter(slot => dateKey(slot.start, zone) === chosenDay).map(slot => <button type="button" key={slot.start} disabled={busy} aria-pressed={selected?.start === slot.start} onClick={() => { setSelected(slot); setError(""); requestAnimationFrame(() => form.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" })); }}>{time(slot.start)}</button>)}</div>
          </div>}
          {selected && <form ref={form} className={styles.form} onSubmit={submit}><h2>Your details</h2><p>{date(selected.start)}<br />{time(selected.start)} – {time(selected.end)}</p>
            <div className={styles.fields}><label>Name<input required autoComplete="name" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label><label>Email<input required type="email" autoComplete="email" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label></div>
            <label>Note <span className={styles.muted}>(optional)</span><textarea rows={3} maxLength={1500} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
            <label className={styles.trap} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
            <p className={styles.muted}>Your details go to the organizer with your appointment. Confirmation appears here; no email is sent.</p><button className={styles.primary} disabled={busy} type="submit">{busy ? "Confirming…" : "Confirm booking"}</button>
          </form>}
        </>}
      </>}
    </section><p className={styles.footer}>Scheduling with Unigentamos</p>
  </main>;
}
