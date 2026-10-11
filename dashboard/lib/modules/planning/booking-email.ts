import { randomUUID } from "node:crypto";
import { effectiveEvent, type PlanningState } from "./types";
import type { BookingEmails, BookingEmailJob, BookingReceipt, BookingEmailSummary } from "./booking-types";
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
export function queueBookingEmails(input: Omit<BookingEmails, "version" | "from" | "organizerEmail" | "guest" | "organizer">): BookingEmails | undefined {
  const config = bookingEmailConfig();
  if (!config.ready) return;
  return { ...input, version: 1, from: config.from, organizerEmail: config.organizerEmail, guest: { status: "pending", attempts: 0 }, organizer: { status: "pending", attempts: 0 } };
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
// Version 1 must remain stable: provider retries require byte-identical payloads.
export function bookingEmailPayload(receipt: BookingReceipt, role: Role) {
  const mail = receipt.emails!;
  const format = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: mail.timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
  const heading = role === "guest" ? "Your booking is confirmed" : "You have a new booking";
  const detail = role === "guest" ? `Hi ${mail.guestName}, your time is reserved.` : `${mail.guestName} booked a time with you.`;
  const rows = [["Appointment", mail.title], ["Starts", format(receipt.start)], ["Ends", format(receipt.end)], ["Time zone", mail.timeZone], ["Location", mail.location || "Not specified — contact the organizer for details."]];
  if (role === "organizer") rows.push(["Guest", `${mail.guestName} (${mail.guestEmail})`]);
  if (mail.note) rows.push(["Booking note", mail.note]);
  const footer = role === "guest" ? "Need to change or cancel? Reply to this email to contact the organizer." : "The appointment is on your Unigentamos calendar. Reply to this email to contact your guest.";
  return {
    from: mail.from, to: [role === "guest" ? mail.guestEmail : mail.organizerEmail], reply_to: role === "guest" ? mail.organizerEmail : mail.guestEmail,
    subject: `${role === "guest" ? "Booking confirmed" : "New booking"}: ${mail.title}`.replace(/[\r\n]+/g, " ").slice(0, 200),
    text: `${heading}\n\n${detail}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n\n")}\n\n${footer}\n\nUnigentamos`,
    html: `<!doctype html><html><body style="margin:0;background:#f7f7fa;font-family:Arial,sans-serif;color:#243c44"><table role="presentation" style="width:100%;padding:28px 14px"><tr><td align="center"><table role="presentation" style="width:100%;max-width:560px;background:#fff;border:1px solid #e0ddec;border-radius:16px"><tr><td style="padding:28px"><p style="font-size:13px;color:#62568f;font-weight:bold;margin:0 0 22px">Unigentamos</p><h1 style="font-size:24px;line-height:1.3;margin:0 0 14px">${heading}</h1><p style="font-size:14px;line-height:1.6">${escape(detail)}</p><table role="presentation" style="width:100%;margin:22px 0">${rows.map(([label, value]) => `<tr><td style="padding:7px 12px 7px 0;vertical-align:top;font-size:12px;color:#767581;width:85px">${label}</td><td style="padding:7px 0;font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap">${escape(value)}</td></tr>`).join("")}</table><p style="font-size:12px;line-height:1.6;color:#767581">${footer}</p></td></tr></table></td></tr></table></body></html>`,
  };
}
export function bookingEmailSummary(state: PlanningState): BookingEmailSummary {
  const config = bookingEmailConfig(), jobs = (state.bookingData?.receipts || []).flatMap(receipt => receipt.emails ? roles.map(role => receipt.emails![role]) : []);
  return { ready: config.ready, organizerEmail: config.ready ? config.organizerEmail : undefined, missing: config.missing, pending: jobs.filter(job => ["pending", "sending"].includes(job.status)).length, accepted: jobs.filter(job => job.status === "accepted").length, failed: jobs.filter(job => job.status === "failed").length, review: jobs.filter(job => job.status === "review").length };
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
