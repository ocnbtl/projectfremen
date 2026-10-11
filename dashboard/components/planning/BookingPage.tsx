"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PublicBooking, BookingSlot } from "../../lib/modules/planning/booking-types";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import { addDays, monthStart, shiftMonth, weekStart } from "../../lib/modules/planning/calendar-model";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import Icon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import styles from "./BookingPage.module.css";

function dateKey(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(day + "T12:00:00Z").toLocaleDateString(undefined, { ...options, timeZone: "UTC" });

export default function BookingPage({ token }: { token: string }) {
  const [data, setData] = useState<PublicBooking | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [zone, setZone] = useState("UTC"), [day, setDay] = useState(""), [month, setMonth] = useState("");
  const [selected, setSelected] = useState<BookingSlot | null>(null), [step, setStep] = useState<"time" | "details">("time");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [note, setNote] = useState(""), [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState<(BookingSlot & { name: string; location: string; confirmationEmail: boolean }) | null>(null);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null), submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null), dateGrid = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
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
  const days = useMemo(() => [...new Set((data?.slots || []).map(slot => dateKey(slot.start, zone)))].sort(), [data, zone]);
  const months = useMemo(() => [...new Set(days.map(day => day.slice(0, 7)))], [days]);
  const chosenDay = days.includes(day) ? day : days[0];
  const visibleMonth = months.includes(month) ? month : chosenDay?.slice(0, 7);
  const monthIndex = months.indexOf(visibleMonth);
  const first = visibleMonth ? weekStart(monthStart(visibleMonth + "-01")) : "";
  const calendarDays = first ? Math.ceil((Date.parse(shiftMonth(visibleMonth + "-01", 1)) - Date.parse(first)) / 86400000 / 7) * 7 : 0;
  const currentSlots = data?.slots.filter(slot => dateKey(slot.start, zone) === chosenDay) || [];
  const time = (value: string, withZone = false) => new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}) }).format(new Date(value));
  const date = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
  const range = (slot: BookingSlot) => `${time(slot.start)} – ${time(slot.end, true)}`;
  const endDate = (slot: BookingSlot) => dateKey(slot.start, zone) === dateKey(slot.end, zone) ? "" : `Ends ${date(slot.end)}`;
  const activeStep = confirmed ? 2 : step === "details" ? 1 : 0;
  useEffect(() => {
    if (step === "time" && !confirmed) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "nearest" });
  }, [step, confirmed, reduced]);
  function chooseDay(next: string) { setDay(next); setSelected(null); setMonth(next.slice(0, 7)); }
  function changeTime() { setStep("time"); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!selected || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    const fingerprint = JSON.stringify([selected.start, name, email, note]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/book/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: selected.start, name, email, note, website, requestId: attempt.current.id }) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setSelected(null); setStep("time"); await load(); }
        throw new Error(body.error || "Your booking could not be confirmed. Try again.");
      }
      setConfirmed(body.booking);
    } catch (error) { setError(error instanceof Error ? error.message : "Connection interrupted. Try again to check your booking."); }
    finally { submitting.current = false; setBusy(false); }
  }
  const summary = (slot: BookingSlot, location?: string) => <div className={styles.appointment}>
    <div><Icon role="calendar" size={18} /><span>{date(slot.start)}</span></div>
    <div><Icon role="clock" size={18} /><span>{range(slot)}{endDate(slot) && <small>{endDate(slot)}</small>}</span></div>
    {location && <div><Icon role="location" size={18} /><span>{location}</span></div>}
  </div>;
  return <main className={styles.page} style={moduleThemeVariables("calendar") as CSSProperties}>
    <a className={styles.brand} href="/" aria-label="Unigentamos home"><img src="/unigentamos-logo.svg" width="28" height="28" alt="" />Unigentamos<span>Scheduling</span></a>
    <section className={styles.card} aria-label="Book an appointment" aria-busy={loading || busy}>
      <aside className={styles.overview}>
        <span className={styles.mark}><Icon role="calendar" size={22} /></span><p className={styles.eyebrow}>YOU’RE INVITED</p><h1>{data?.name || "Find a time to meet"}</h1>
        {data && <><div className={styles.facts}><span><Icon role="clock" size={16} />{data.durationMinutes} minutes</span><span><Icon role="check" size={16} />Instant confirmation</span></div>{data.description && <><p className={styles.description}>{data.description}</p><details className={styles.mobileAbout}><summary>About this appointment<Icon role="chevron-down" size={14} /></summary><p>{data.description}</p></details></>}{data.location && <p className={styles.location}><Icon role="location" size={16} /><span>{data.location}</span></p>}</>}
        <p className={styles.overviewNote}>A little time, made simple.</p>
      </aside>
      <div className={styles.workspace}>
        <ol className={styles.steps} aria-label="Booking progress">
          <motion.li aria-hidden="true" className={styles.stepHighlight} initial={false} animate={{ x: `${activeStep * 100}%` }} transition={{ duration: reduced ? 0 : .24, ease: [.22, .78, .18, 1] }} />
          {["Choose time", "Your details", "Confirmed"].map((label, index) => <li key={label} aria-current={activeStep === index ? "step" : undefined} data-complete={activeStep > index}><span>{activeStep > index ? <Icon role="check" size={13} /> : index + 1}</span>{label}</li>)}
        </ol>
        <motion.div className={styles.stage} key={confirmed ? "confirmed" : step} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22, ease: [.22, .78, .18, 1] }}>
          {confirmed ? <div className={styles.confirmation}>
            <span className={styles.successMark}><Icon role="check" size={28} /></span><h2 ref={heading} tabIndex={-1}>You’re booked.</h2><p className={styles.subheading}>Your appointment is on the organizer’s calendar.</p>
            <div className={styles.receipt}><h3>{confirmed.name}</h3>{summary(confirmed, confirmed.location)}</div>
            <div className={styles.delivery}><Icon role="email" size={20} /><div><strong>{confirmed.confirmationEmail ? "Confirmation email on its way" : "Keep your appointment details"}</strong><p>{confirmed.confirmationEmail ? <>We’re sending the details to <b>{email}</b>. Check your spam folder if it doesn’t arrive.</> : "Email confirmation isn’t available right now. Save a screenshot of these details for your records."}</p></div></div><p className={styles.muted}>Need to change or cancel? Contact the organizer directly.</p>
          </div> : <>
            {error && data && <div role="alert" className={styles.error}><Icon role="clock" size={18} /><span>{error}</span></div>}
            {loading ? <div className={styles.state} role="status"><span className={styles.loadingMark}><Icon role="calendar" size={26} /></span><h2>Finding a time for you</h2><p>Checking the latest availability…</p><div className={styles.skeleton} aria-hidden="true" /></div>
            : !data ? <div className={styles.state} role="alert"><Icon role="link" size={28} /><h2 ref={heading} tabIndex={-1}>This booking link is unavailable</h2>{error && error !== "This booking link is unavailable." && error !== "This booking page is unavailable." && <p>{error}</p>}<p>Ask the organizer for a current link, or try again.</p><Button onClick={() => void load()}>Try again</Button></div>
            : step === "details" && selected ? <form className={styles.form} onSubmit={submit}>
              <div className={styles.stageHeading}><h2 ref={heading} tabIndex={-1}>Your details</h2><Button icon="back" intent="quiet" disabled={busy} onClick={changeTime}>Change time</Button></div><div className={styles.selectionSummary}>{summary(selected)}</div>
              <div className={styles.fields}><label>Your name<input required autoComplete="name" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label><label>Email address<input required type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label></div>
              <label><span className={styles.fieldLabel}>Anything to share? <small>Optional</small></span><textarea rows={3} maxLength={1500} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
              <label className={styles.trap} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label><p className={styles.muted}>Your details are shared only with the organizer. {data.confirmationEmail ? "We’ll email your date, time, and location." : "Your confirmation will appear here."}</p>
              <div className={styles.formAction}><Button className={styles.primary} intent="primary" type="submit" busy={busy} icon={busy ? undefined : "check"}>{busy ? "Confirming your booking…" : "Confirm booking"}</Button><span>No account needed</span></div>
            </form> : <>
              <div className={styles.stageHeading}><h2 ref={heading} tabIndex={-1}>Choose a time</h2><span>{data.durationMinutes} min</span></div>
              <label className={styles.zone}><span><Icon role="clock" size={15} />Times shown in</span><SelectField searchable autoFocusSearch={false} contained aria-label="Display time zone" value={zone} onChange={event => { const next = event.target.value; setZone(next); setDay(selected ? dateKey(selected.start, next) : ""); setMonth(selected ? dateKey(selected.start, next).slice(0,7) : ""); }}>{zones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ").replaceAll("/", " / ")}</option>)}</SelectField></label>
              {!days.length ? <div className={styles.state}><Icon role="calendar" size={28} /><h3>No times available just yet</h3><p>Check back later, or contact the organizer to find a time that works.</p><Button onClick={() => void load()}>Refresh availability</Button></div> : <>
                <div className={styles.availability}>
                  <section className={styles.calendar} aria-label="Choose an available date">
                    <div className={styles.monthHeading}><h3 aria-live="polite">{dayLabel(visibleMonth + "-01", { month: "long", year: "numeric" })}</h3><div><Button aria-label="Previous available month" disabled={monthIndex <= 0} onClick={() => { const next = months[monthIndex-1]; chooseDay(days.find(day => day.startsWith(next))!); }}><Icon role="back" candidate="chevron-left" size={18} /></Button><Button icon="chevron-right" aria-label="Next available month" disabled={monthIndex >= months.length-1} onClick={() => { const next = months[monthIndex+1]; chooseDay(days.find(day => day.startsWith(next))!); }} /></div></div>
                    <div className={styles.weekdays} aria-hidden="true">{["Su","Mo","Tu","We","Th","Fr","Sa"].map(day => <span key={day}>{day}</span>)}</div>
                    <div ref={dateGrid} className={styles.dates} role="group" aria-label="Available dates">{Array.from({length:calendarDays},(_,index) => {const date = addDays(first,index), available = days.includes(date) && date.startsWith(visibleMonth); return <button key={date} type="button" data-day={date} data-outside={!date.startsWith(visibleMonth)} disabled={!available} aria-label={dayLabel(date,{dateStyle:"full"})} aria-pressed={date === chosenDay} onClick={() => chooseDay(date)} onKeyDown={event => {
                      const offset = ({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
                      if (!offset) return; event.preventDefault(); let next = addDays(date,offset); const direction = Math.sign(offset);
                      while (next.startsWith(visibleMonth) && !days.includes(next)) next = addDays(next,direction);
                      dateGrid.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]:not([disabled])`)?.focus();
                    }}>{Number(date.slice(-2))}{available && <i aria-hidden="true" />}</button>;})}</div><p className={styles.calendarHint}><i />Available dates</p>
                  </section>
                  <section className={styles.slotSection} aria-label="Choose an available time"><h3>{dayLabel(chosenDay,{weekday:"short",month:"short",day:"numeric"})}<span>{currentSlots.length} available</span></h3><div className={styles.times} role="group" aria-label="Available times">{currentSlots.map(slot => <button type="button" key={slot.start} aria-label={`${time(slot.start)} to ${time(slot.end, true)}`} aria-pressed={selected?.start === slot.start} onClick={() => {setSelected(slot); setError("");}}>{time(slot.start)}{selected?.start === slot.start && <Icon role="check" size={14} />}</button>)}</div></section>
                </div>
                <div className={styles.continueBar}><div aria-live="polite">{selected ? <><strong>{dayLabel(dateKey(selected.start,zone),{month:"short",day:"numeric"})} · {range(selected)}</strong><span>Ready for your details</span></> : <><strong>Select a time that works</strong><span>Your booking confirms on the next step</span></>}</div><Button intent="primary" disabled={!selected} className={styles.primary} onClick={() => setStep("details")}>Continue<Icon role="arrow-right" size={16} /></Button></div>
              </>}
            </>}
          </>}
        </motion.div>
      </div>
    </section><p className={styles.footer}><Icon role="calendar" size={14} />Scheduling with Unigentamos</p>
  </main>;
}
