"use client";
import type { BookingEmailPreferences } from "../../lib/modules/planning/booking-types";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import BookingDisclosure from "./BookingDisclosure";
import BookingEmailPreview from "./BookingEmailPreview";
import type { BookingEmailPreviewDetails } from "../../lib/modules/planning/booking-email-preview";
import styles from "./CalendarBookings.module.css";

export default function BookingEmailSettings({ value, onChange, ready, details, sender, defaultRecipient }: { value: BookingEmailPreferences; onChange: (value: BookingEmailPreferences) => void; ready: boolean; details: BookingEmailPreviewDetails; sender?: string; defaultRecipient?: string }) {
  const summary = [value.guestConfirmation && "Guests", value.organizerNotification && "You"].filter(Boolean).join(" + ") || "Off";
  return <BookingDisclosure title="Confirmation emails" summary={summary} icon="email">
    {!ready && <p className={styles.slotNote}>Email delivery needs setup. These preferences will apply once a sender is connected.</p>}
    <div className={styles.emailColumns}>
      <div className={styles.emailSection}>
        <label className={styles.emailToggle}><input type="checkbox" checked={value.guestConfirmation} onChange={event => onChange({ ...value, guestConfirmation: event.target.checked })} /><span>Email guests a confirmation</span></label>
        <div className={styles.emailDetails} role="group" aria-label="Include in guest confirmation">{([['date','Date'],['time','Time'],['timeZone','Time zone'],['location','Location']] as const).map(([key,label]) => <label key={key}><input type="checkbox" disabled={!value.guestConfirmation} checked={value.guestDetails?.[key] ?? true} onChange={event => onChange({ ...value, guestDetails:{date:true,time:true,timeZone:true,location:true,...value.guestDetails,[key]:event.target.checked} })} />{label}</label>)}</div>
        <label className={styles.messageLabel}>Message from you <small>(optional, for this link)</small><textarea disabled={!value.guestConfirmation} rows={3} maxLength={1500} placeholder="Anything guests should know before your appointment…" value={value.guestMessage} onChange={event => onChange({ ...value, guestMessage: event.target.value })} /></label>
      </div>
      <div className={styles.emailSection}>
        <label className={styles.emailToggle}><input type="checkbox" checked={value.organizerNotification} onChange={event => onChange({ ...value, organizerNotification: event.target.checked })} /><span>Notify me</span></label>
        <div className={styles.recipients}>{value.organizerEmails.map((email,index) => <div key={index}><input type="email" required maxLength={254} aria-label={`Notification email ${index+1}`} placeholder="you@example.com" value={email} onChange={event => onChange({ ...value, organizerEmails:value.organizerEmails.map((item,i) => i === index ? event.target.value : item) })} /><Button icon="close" aria-label={`Remove notification email ${index+1}`} disabled={value.organizerEmails.length === 1} onClick={() => onChange({ ...value, organizerEmails:value.organizerEmails.filter((_,i) => i !== index) })} /></div>)}</div>
        <Button icon="plus" disabled={value.organizerEmails.length >= 5} onClick={() => onChange({ ...value, organizerEmails:[...value.organizerEmails, ""] })}>Add email</Button>
        <p className={styles.slotNote}>Up to 5 recipients; the first is also your reply address.</p>
      </div>
    </div>
    <BookingEmailPreview details={details} preferences={value} sender={sender} defaultRecipient={defaultRecipient} ready={ready} />
  </BookingDisclosure>;
}
