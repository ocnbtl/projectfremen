"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { useCalendarMotion } from "./CalendarMotion";
import type { BookingEmailPreferences } from "../../lib/modules/planning/booking-types";
import { previewBookingEmail, type BookingEmailPreviewDetails } from "../../lib/modules/planning/booking-email-preview";
import type { BookingEmailRole } from "../../lib/modules/planning/booking-email-template";
import BookingDisclosure from "./BookingDisclosure";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./BookingEmailPreview.module.css";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";

const roles = ["guest", "organizer"] as const;
export default function BookingEmailPreview({ details, preferences, sender, defaultRecipient, ready }: { details: BookingEmailPreviewDetails; preferences: BookingEmailPreferences; sender?: string; defaultRecipient?: string; ready: boolean }) {
  const [role, setRole] = useState<BookingEmailRole>("guest"), id = useId(), { reduced } = useCalendarMotion();
  const payload = previewBookingEmail(details, preferences, role, sender, defaultRecipient);
  const enabled = role === "guest" ? preferences.guestConfirmation : preferences.organizerNotification;
  const [sending, setSending] = useState(false), [notice, setNotice] = useState(""), [failed, setFailed] = useState(false);
  const test = useRef<{ key:string; id:string } | null>(null), inFlight = useRef(false);
  async function sendTest() {
    if (inFlight.current) return;
    inFlight.current = true; setSending(true); setNotice(""); setFailed(false);
    const key = JSON.stringify({details,preferences});
    if (test.current?.key !== key) test.current = {key,id:crypto.randomUUID()};
    try {
      const response = await fetch("/api/planning/booking-emails/test", {method:"POST",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({requestId:test.current.id,details,preferences})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Test emails could not be sent.");
      setNotice(result.message); test.current = null;
    } catch (error) { setFailed(true); setNotice(error instanceof Error ? error.message : "Could not confirm delivery. Retry to check the same test pair."); }
    finally { inFlight.current = false; setSending(false); }
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    const next = event.key === "Home" ? "guest" : event.key === "End" ? "organizer" : ["ArrowLeft", "ArrowRight"].includes(event.key) ? role === "guest" ? "organizer" : "guest" : null;
    if (!next) return;
    event.preventDefault(); setRole(next); document.getElementById(`${id}-${next}`)?.focus();
  }
  // Only the fixed brand asset can load; scripts and navigation remain blocked.
  const srcDoc = payload?.html.replace("<html>", '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src https://unigentamos.com; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"></head>');
  return <div><BookingDisclosure title="Preview emails" icon="email" action={<Button icon="email" busy={sending} disabled={!ready || !payload} onClick={() => void sendTest()} title={`Send both samples to ${defaultRecipient || "your notification email"}`}>{failed ? "Retry test email" : "Send test email"}</Button>}>
    <div className={styles.preview}>
      <div className={styles.tabs} role="tablist" aria-label="Email preview recipient">
        <motion.span aria-hidden="true" className={styles.slider} initial={false} animate={{x:role === "guest" ? "0%" : "100%"}} transition={{duration:reduced ? 0 : .24,ease:[.22,.78,.18,1]}} />
        {roles.map(item => <button key={item} id={`${id}-${item}`} type="button" role="tab" aria-controls={`${id}-message`} aria-selected={role === item} tabIndex={role === item ? 0 : -1} onKeyDown={navigate} onClick={() => setRole(item)}><UnigentamosIcon role="email" size={16} />{item === "guest" ? "Guest" : "You"}</button>)}
      </div>
      <p className={styles.note}>Sample guest and appointment. Updates as you edit. Test emails send both versions to {defaultRecipient || "your notification email"}, without creating an appointment.</p>
      {(!enabled || !ready) && <p className={styles.status} role="status">{!enabled ? `Emails to ${role === "guest" ? "guests are" : "you are"} turned off for this link. This is a preview only.` : "Email delivery needs setup. You can still review the message."}</p>}
      <div id={`${id}-message`} role="tabpanel" aria-labelledby={`${id}-${role}`}>
        {payload ? <><dl className={styles.envelope}>
          <div><dt>Subject</dt><dd className={styles.subject}>{payload.subject}</dd></div>
          <div><dt>From</dt><dd>{payload.from}</dd></div>
          <div><dt>To</dt><dd>{payload.to.map(email => email || "Enter notification email").join(", ")}</dd></div>
          <div><dt>Reply to</dt><dd>{payload.reply_to}</dd></div>
        </dl><iframe className={styles.message} title={role === "guest" ? "Guest confirmation email preview" : "Organizer notification email preview"} srcDoc={srcDoc} sandbox="" referrerPolicy="no-referrer" /></> : <p className={styles.status}>Choose a valid date, start time and time zone to preview this appointment.</p>}
      </div>
    </div>
  </BookingDisclosure>{notice && <p className={styles.status} role={failed ? "alert" : "status"}>{notice}</p>}</div>;
}
