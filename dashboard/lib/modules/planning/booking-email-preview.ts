import { Temporal } from "@js-temporal/polyfill";
import type { BookingEmailPreferences, BookingLink, BookingEmails } from "./booking-types";
import { bookingEmailPayload, type BookingEmailRole } from "./booking-email-template";

export type BookingEmailPreviewDetails = Pick<BookingLink, "name" | "location" | "timeZone" | "durationMinutes" | "from" | "dayStart" | "mode" | "manualStarts">;
/** Read-only sample; uses the same renderer as delivery and never queues mail. */
export function previewBookingEmail(details: BookingEmailPreviewDetails, preferences: BookingEmailPreferences, role: BookingEmailRole, sender?: string, defaultRecipient?: string) {
  const local = details.mode === "manual" && details.manualStarts.length ? details.manualStarts[0] : `${details.from}T${details.dayStart}`;
  try {
    const start = Temporal.PlainDateTime.from(local).toZonedDateTime(details.timeZone, { disambiguation: "reject" }).toInstant();
    const end = start.add({ minutes: details.durationMinutes });
    const recipients = preferences.organizerEmails.length ? [...new Set(preferences.organizerEmails.map(email => email.trim().toLowerCase()))] : [defaultRecipient || "Your notification email"];
    const emails: BookingEmails = {
      version: 2, from: sender || "Sender not configured", organizerEmail: recipients[0] || "Your notification email", organizerEmails: recipients,
      title: details.name.trim() || "Appointment title", location: details.location.trim(), timeZone: details.timeZone,
      guestName: "Alex Morgan", guestEmail: "alex@example.com", note: "Looking forward to our appointment.", guestMessage: preferences.guestMessage.trim(),
      guest: { status: "pending", attempts: 0 }, organizer: { status: "pending", attempts: 0 },
    };
    return bookingEmailPayload({ start: start.toString(), end: end.toString(), emails }, role);
  } catch { return null; }
}
