import { createHash } from "node:crypto";
import { bookingEmailConfig } from "./booking-email";
import { previewBookingEmail, type BookingEmailPreviewDetails } from "./booking-email-preview";
import type { BookingEmailPreferences } from "./booking-types";
import { mutatePlanningState } from "./store";

export class EmailTestError extends Error { constructor(message: string, public status = 400) { super(message); } }
const invalid = (): never => { throw new EmailTestError("Choose a valid appointment date, time and email message before sending a test."); };
const bounded = (value: unknown, max: number) => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);

/** Only fixed sample messages to the server-configured owner; never creates a booking. */
export async function sendBookingEmailTest(input: unknown) {
  const config = bookingEmailConfig();
  if (!config.ready) throw new EmailTestError("Email delivery needs setup before sending a test.", 503);
  const { requestId, details, preferences } = (input || {}) as { requestId: string; details: BookingEmailPreviewDetails; preferences: BookingEmailPreferences };
  if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId) || !details || !preferences) invalid();
  if (!bounded(details.name,120) || !bounded(details.location,500) || !bounded(details.timeZone,100) || !bounded(details.from,10) || !bounded(details.dayStart,5) || !["manual","automatic"].includes(details.mode) || !Number.isInteger(details.durationMinutes) || details.durationMinutes < 5 || details.durationMinutes > 480 || !Array.isArray(details.manualStarts) || details.manualStarts.length > 200 || details.manualStarts.some(start => typeof start !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) || !bounded(preferences.guestMessage,1500)) invalid();
  if (preferences.guestDetails !== undefined && (!preferences.guestDetails || ["date","time","timeZone","location"].some(key => typeof preferences.guestDetails![key as keyof typeof preferences.guestDetails] !== "boolean"))) invalid();
  const safePreferences: BookingEmailPreferences = { guestConfirmation:true, organizerNotification:true, organizerEmails:[config.organizerEmail], guestMessage:preferences.guestMessage, guestDetails:preferences.guestDetails };
  const messages = (["guest","organizer"] as const).map(role => {
    const payload = previewBookingEmail(details, safePreferences, role, config.from, config.organizerEmail);
    if (!payload) return invalid();
    return { ...payload, to:[config.organizerEmail], reply_to:config.organizerEmail, subject:`[Test] ${payload.subject}` };
  });
  const body = JSON.stringify(messages), hash = createHash("sha256").update(body).digest("hex");
  const alreadyAccepted = await mutatePlanningState(state => {
    const data = state.bookingData ||= { links:[], receipts:[] }, now = Date.now();
    const tests = data.emailTests = (data.emailTests || []).filter(test => now - test.createdAt < 25*3600000);
    const existing = tests.find(test => test.id === requestId);
    if (existing) {
      if (existing.hash !== hash || now - existing.createdAt >= 23*3600000) throw new EmailTestError("This test has changed or expired. Close and reopen the editor to send a new test.",409);
      if (existing.accepted) return { state, result:true };
      if (now - existing.lastAttemptAt >= 600000) existing.attempts = 0;
      if (existing.attempts >= 5) throw new EmailTestError("Please wait ten minutes before retrying this test.",429);
      if (now - existing.lastAttemptAt < 2000) throw new EmailTestError("Please wait a moment before retrying this test.",429);
      existing.attempts++; existing.lastAttemptAt = now;
    } else {
      if (tests.filter(test => now - test.createdAt < 600000).length >= 5) throw new EmailTestError("You’ve sent five test pairs. Try again in ten minutes.",429);
      tests.push({id:requestId,hash,createdAt:now,lastAttemptAt:now,attempts:1});
    }
    return { state, result:false };
  });
  if (!alreadyAccepted) {
    // A single batch and stable key make retries safe even after a lost response.
    try {
      const response = await fetch("https://api.resend.com/emails/batch", { method:"POST", headers:{ Authorization:`Bearer ${config.key}`, "Content-Type":"application/json", "Idempotency-Key":`booking-test-v1/${requestId}` }, body, signal:AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.data) || result.data.length !== 2 || result.data.some((item: {id?:unknown}) => typeof item.id !== "string")) throw new Error("Not accepted");
    } catch { throw new EmailTestError("The email service could not confirm this test. Retry to safely check the same pair.",503); }
    await mutatePlanningState(state => {
      const test = state.bookingData?.emailTests?.find(test => test.id === requestId && test.hash === hash);
      if (test) test.accepted = true;
      return { state, result:undefined };
    });
  }
  return { recipient:config.organizerEmail, message:`Both test emails were accepted for delivery to ${config.organizerEmail}. No appointment was created.` };
}
