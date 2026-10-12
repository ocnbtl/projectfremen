import { bookingEmailPayload } from "./booking-email-template";
export { bookingEmailPayload } from "./booking-email-template";
import { randomUUID } from "node:crypto";
import { effectiveEvent, type PlanningState } from "./types";
import type { BookingEmails, BookingEmailJob, BookingReceipt, BookingEmailSummary, BookingEmailPreferences } from "./booking-types";
import { localFor } from "./calendar-model";
import { mutatePlanningState, readPlanningState } from "./store";

const roles = ["guest", "organizer"] as const;
type Role = (typeof roles)[number];
const address = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function bookingEmailConfig() {
  const key = process.env.RESEND_API_KEY?.trim(), from = process.env.BOOKING_EMAIL_FROM?.trim() || "", organizerEmail = process.env.BOOKING_NOTIFY_EMAIL?.trim() || "";
  const senderAddress = from.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] || from;
  const missing = [!key && "RESEND_API_KEY", (!address.test(senderAddress) || /[\r\n]/.test(from)) && "BOOKING_EMAIL_FROM", !address.test(organizerEmail) && "BOOKING_NOTIFY_EMAIL"].filter(Boolean) as string[];
  return { ready: !missing.length, key, from, organizerEmail, missing };
}
export function queueBookingEmails(input: Pick<BookingEmails, "title" | "guestName" | "guestEmail" | "note" | "location" | "timeZone">, preferences?: BookingEmailPreferences): BookingEmails | undefined {
  const config = bookingEmailConfig();
  if (!config.ready) return;
  if (preferences) {
    if (!preferences.guestConfirmation && !preferences.organizerNotification) return;
    const recipients = preferences.organizerEmails.length ? [...preferences.organizerEmails] : [config.organizerEmail];
    return { ...input, version: 4, from: config.from, organizerEmail: recipients[0], organizerEmails: recipients, guestMessage: preferences.guestMessage, guestDetails: preferences.guestDetails ? { ...preferences.guestDetails } : undefined,
      guest: { status: preferences.guestConfirmation ? "pending" : "cancelled", attempts: 0 },
      organizer: { status: preferences.organizerNotification ? "pending" : "cancelled", attempts: 0 } };
  }
  return { ...input, version: 4, from: config.from, organizerEmail: config.organizerEmail, guest: { status: "pending", attempts: 0 }, organizer: { status: "pending", attempts: 0 } };
}
export function bookingEmailSummary(state: PlanningState): BookingEmailSummary {
  const config = bookingEmailConfig(), jobs = (state.bookingData?.receipts || []).flatMap(receipt => receipt.emails ? roles.map(role => receipt.emails![role]) : []);
  return { ready: config.ready, from: config.from || undefined, organizerEmail: config.ready ? config.organizerEmail : undefined, missing: config.missing, pending: jobs.filter(job => ["pending", "sending"].includes(job.status)).length, accepted: jobs.filter(job => job.status === "accepted").length, failed: jobs.filter(job => job.status === "failed").length, review: jobs.filter(job => job.status === "review").length };
}
function currentBooking(state: PlanningState, receipt: BookingReceipt) {
  const event = state.events.find(event => event.id === receipt.eventId && !event.archivedAt);
  if (!event || event.source?.cancelled || event.overrides?.cancelled) return false;
  const fields = effectiveEvent(event), mail = receipt.emails!;
  return fields.start === localFor(Date.parse(receipt.start), mail.timeZone) && fields.end === localFor(Date.parse(receipt.end), mail.timeZone) && fields.timeZone === mail.timeZone && fields.location === mail.location && fields.title === `${mail.title} — ${mail.guestName}` && fields.participants?.some(person => person.email === mail.guestEmail);
}
export async function deliverBookingEmail(receiptId: string, role: Role, retryFailed = false) {
  const config = bookingEmailConfig(); if (!config.ready) return;
  const claimed = await mutatePlanningState(state => {
    const receipt = state.bookingData?.receipts.find(item => item.id === receiptId), job = receipt?.emails?.[role], now = Date.now();
    if (!receipt || !job || ["accepted", "review", "cancelled"].includes(job.status) || (job.status === "failed" && !retryFailed) || (job.leaseUntil && Date.parse(job.leaseUntil) > now) || (!retryFailed && job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now)) return { state, result: null };
    // Do not risk another send after Resend's 24-hour idempotency window.
    if (job.firstAttemptAt && now - Date.parse(job.firstAttemptAt) >= 23 * 3600000) { job.status = "review"; job.error = "Delivery needs review before another email can be sent."; return { state, result: null }; }
    if (!currentBooking(state, receipt)) { job.status = "cancelled"; job.error = "Appointment changed before email delivery."; return { state, result: null }; }
    const lease = randomUUID(); job.status = "sending"; job.lease = lease; job.leaseUntil = new Date(now + 90000).toISOString(); job.firstAttemptAt ||= new Date(now).toISOString(); job.attempts++;
    return { state, result: { receipt: structuredClone(receipt), lease } };
  });
  if (!claimed) return;
  let status: BookingEmailJob["status"] = "pending", providerId: string | undefined, error = "Email service could not be reached. Your booking is safe.";
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": `booking-v1/${receiptId}/${role}` }, body: JSON.stringify(bookingEmailPayload(claimed.receipt, role)), signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => ({}));
    if (response.ok && typeof body.id === "string") { status = "accepted"; providerId = body.id; error = ""; }
    else if ([400,401,403,404,422].includes(response.status)) { status = "failed"; error = "Check the email service credentials, verified sender, or recipient address."; }
    else if (response.status === 409 && body.name !== "concurrent_idempotent_requests") { status = "review"; error = "The email service requires a delivery review."; }
    else error = "Email service temporarily unavailable. Delivery will be retried.";
  } catch { /* A timeout can mean accepted; reuse the same key and payload. */ }
  await mutatePlanningState(state => {
    const job = state.bookingData?.receipts.find(item => item.id === receiptId)?.emails?.[role];
    if (job?.lease === claimed.lease) { Object.assign(job, { status, providerId, error: error || undefined, nextAttemptAt: status === "pending" ? new Date(Date.now() + 1500).toISOString() : undefined }); delete job.lease; delete job.leaseUntil; }
    return { state, result: undefined };
  });
}
export async function dispatchBookingEmails(receiptId: string) {
  const receipt = (await readPlanningState()).bookingData?.receipts.find(item => item.id === receiptId);
  if (!receipt?.emails) return;
  // Bound immediate retries to the serverless request lifetime; durable jobs also
  // remain available to the daily sweep and authenticated manual retry control.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 1600));
    for (const role of roles) { await deliverBookingEmail(receiptId, role); await new Promise(resolve => setTimeout(resolve, 600)); }
  }
}
export async function retryBookingEmails() {
  if (!bookingEmailConfig().ready) return;
  const state = await readPlanningState(); let count = 0;
  for (const receipt of state.bookingData?.receipts || []) for (const role of roles) {
    if (count >= 6) return;
    if (receipt.emails && ["pending", "sending", "failed"].includes(receipt.emails[role].status)) { await deliverBookingEmail(receipt.id, role, true); count++; await new Promise(resolve => setTimeout(resolve, 600)); }
  }
}
