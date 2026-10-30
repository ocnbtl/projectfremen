import { readWellnessCalendarEvents } from "../personal-wellness/calendar";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { addDays, eventOccurrences, localFor } from "./calendar-model";
import { mutatePlanningState, readPlanningState, normalizePlanningRecord } from "./store";
import { repeatBirthdays } from "./repeat-birthdays";
import { effectiveEvent, type PlanningState } from "./types";
import type { BirthdaySource } from "./observances";
import type { BookingLink, BookingLinkView, BookingSlot, PublicBooking, BookingEmailPreferences } from "./booking-types";
import { bookingEmailConfig, queueBookingEmails } from "./booking-email";

export class BookingError extends Error { constructor(message: string, public status = 400) { super(message); } }
const fail = (message: string, status = 400): never => { throw new BookingError(message, status); };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function signingSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("Booking links are not configured");
  return secret;
}
const signature = (link: BookingLink) => createHmac("sha256", signingSecret()).update(`calendar-booking:v1:${link.id}:${link.keyVersion}`).digest("hex");
export function bookingLinkView(link: BookingLink, state: PlanningState): BookingLinkView {
  const { keyVersion: _key, ...rest } = link; void _key;
  return { ...rest, path: link.revokedAt ? null : `/book/${link.id}.${signature(link)}`, bookingCount: state.bookingData?.receipts.filter(receipt => receipt.linkId === link.id).length || 0 };
}
function resolve(token: string, state: PlanningState): BookingLink {
  const match = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(token);
  const link = match && state.bookingData?.links.find(link => link.id === match[1] && !link.revokedAt);
  if (!link || !match || !timingSafeEqual(Buffer.from(signature(link), "hex"), Buffer.from(match[2], "hex"))) return fail("This booking link is unavailable.", 404);
  if (!state.calendars.some(calendar => calendar.id === link.calendarId && !calendar.archivedAt)) return fail("This booking link is unavailable.", 404);
  return link;
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) return fail(`Enter a valid ${label}.`);
  return value.trim();
}
function integer(value: unknown, label: string, low: number, high: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < low || value > high) return fail(`Choose ${label} between ${low} and ${high}.`);
  return value;
}
function strictInstant(local: string, zone: string) {
  return Number(Temporal.PlainDateTime.from(local).toZonedDateTime(zone, { disambiguation: "reject" }).epochMilliseconds);
}
function fields(input: Record<string, unknown>, state: PlanningState) {
  let emailPreferences: BookingEmailPreferences | undefined;
  if (input.emailPreferences !== undefined) {
    const value = input.emailPreferences as BookingEmailPreferences;
    if (!value || typeof value !== "object" || typeof value.guestConfirmation !== "boolean" || typeof value.organizerNotification !== "boolean" || !Array.isArray(value.organizerEmails) || value.organizerEmails.length > 5) return fail("Choose valid email confirmation settings.");
    const organizerEmails = [...new Set(value.organizerEmails.map(email => text(email, "notification email address", 254, true).toLowerCase()))];
    if (organizerEmails.some(email => !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email))) return fail("Enter valid notification email addresses.");
    if (value.guestDetails !== undefined && (!value.guestDetails || typeof value.guestDetails !== "object" || ["date", "time", "timeZone", "location"].some(key => typeof value.guestDetails![key as keyof typeof value.guestDetails] !== "boolean"))) return fail("Choose valid guest email details.");
    emailPreferences = { guestConfirmation: value.guestConfirmation, organizerNotification: value.organizerNotification, organizerEmails, guestMessage: text(value.guestMessage ?? "", "guest message", 1500), ...(value.guestDetails ? { guestDetails: { date:value.guestDetails.date, time:value.guestDetails.time, timeZone:value.guestDetails.timeZone, location:value.guestDetails.location } } : {}) };
  }
  const name = text(input.name, "booking title", 120, true), description = text(input.description ?? "", "description", 1500), location = text(input.location ?? "", "location", 500);
  const calendarId = text(input.calendarId, "destination calendar", 120, true);
  const active = new Set(state.calendars.filter(calendar => !calendar.archivedAt).map(calendar => calendar.id));
  if (!active.has(calendarId)) return fail("Choose an available destination calendar.");
  if (!Array.isArray(input.conflictCalendarIds) || input.conflictCalendarIds.length > 50 || input.conflictCalendarIds.some(id => typeof id !== "string" || !active.has(id))) return fail("Choose available calendars to check for conflicts.");
  const conflictCalendarIds = [...new Set([calendarId, ...input.conflictCalendarIds as string[]])];
  const timeZone = text(input.timeZone, "time zone", 100, true);
  const durationMinutes = integer(input.durationMinutes, "a duration in minutes", 5, 480), bufferMinutes = integer(input.bufferMinutes ?? 0, "a buffer in minutes", 0, 120), noticeHours = integer(input.noticeHours ?? 2, "notice in hours", 0, 720);
  const mode: BookingLink["mode"] = input.mode === "manual" ? "manual" : input.mode === "automatic" ? "automatic" : fail("Choose manual or automatic availability.");
  const from = text(input.from, "start date", 10, true), through = text(input.through, "end date", 10, true);
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)) throw Error();
    const days = Temporal.PlainDate.from(through).since(Temporal.PlainDate.from(from)).days;
    if (days < 0 || days > 90) return fail("Choose a date range of up to 91 days.");
    Temporal.Now.zonedDateTimeISO(timeZone);
  } catch (error) { if (error instanceof BookingError) throw error; return fail("Choose valid dates and a valid time zone."); }
  const dayStart = text(input.dayStart ?? "09:00", "start time", 5, true), dayEnd = text(input.dayEnd ?? "17:00", "end time", 5, true);
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(dayStart) || !clock.test(dayEnd) || dayEnd <= dayStart) return fail("Daily end time must be after the start time.");
  if (!Array.isArray(input.weekdays) || input.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) return fail("Choose valid weekdays.");
  const weekdays = [...new Set(input.weekdays as number[])];
  if (mode === "automatic" && !weekdays.length) return fail("Choose at least one weekday.");
  if (!Array.isArray(input.manualStarts) || input.manualStarts.length > 200) return fail("Choose up to 200 manual times.");
  const manualStarts = [...new Set(input.manualStarts as string[])].sort();
  if (mode === "manual" && !manualStarts.length) return fail("Add at least one available time.");
  for (const start of manualStarts) {
    if (typeof start !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || start.slice(0,10) < from || start.slice(0,10) > through) return fail("Manual times must be inside the selected date range.");
    try {
      const endMs = strictInstant(start, timeZone) + durationMinutes*60000, end = localFor(endMs, timeZone);
      if (end > `${addDays(through,1)}T00:00`) return fail("Each manual appointment must end inside the selected date range.");
      if (strictInstant(end,timeZone) !== endMs) throw Error();
    } catch (error) { if (error instanceof BookingError) throw error; return fail("One of these times is ambiguous or skipped by daylight saving. Choose another time."); }
  }
  return { name, description, location, calendarId, conflictCalendarIds, timeZone, durationMinutes, bufferMinutes, noticeHours, mode, from, through, weekdays, dayStart, dayEnd, manualStarts, ...(emailPreferences ? { emailPreferences } : {}) };
}
export async function changeBookingLink(input: Record<string, unknown>) {
  signingSecret();
  return mutatePlanningState(state => {
    const data = state.bookingData || { links: [], receipts: [] }, now = new Date().toISOString();
    let link: BookingLink;
    if (input.operation === "create") {
      if (data.links.length >= 100) return fail("The limit is 100 booking links.");
      link = { ...fields(input, state), id: randomUUID(), keyVersion: randomBytes(32).toString("hex"), createdAt: now, updatedAt: now };
    } else {
      const previous = data.links.find(link => link.id === input.id);
      if (!previous) return fail("Booking link not found.", 404);
      if (input.expectedUpdatedAt !== previous.updatedAt) return fail("This link changed elsewhere. Refresh links and try again.", 409);
      link = { ...previous, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt) + 1)).toISOString() };
      if (input.operation === "update") Object.assign(link, fields(input, state));
      else if (input.operation === "revoke") link.revokedAt = now;
      else if (input.operation === "regenerate") { link.keyVersion = randomBytes(32).toString("hex"); delete link.revokedAt; }
      else return fail("Unknown booking action.");
    }
    const next = { ...state, bookingData: { ...data, links: [...data.links.filter(item => item.id !== link.id), link] } };
    return { state: next, result: bookingLinkView(link, next) };
  });
}
export function availableBookingSlots(link: BookingLink, state: PlanningState, birthdays?: BirthdaySource[], now = Date.now()): BookingSlot[] {
  const allowed = new Set(link.conflictCalendarIds);
  // Hidden calendars still block time. Fail closed if a selected conflict calendar was removed.
  if (link.conflictCalendarIds.some(id => !state.calendars.some(calendar => calendar.id === id && !calendar.archivedAt))) return [];
  const relevant = state.events.filter(event => allowed.has(effectiveEvent(event).calendarId) || [...Object.values(event.exceptions || {}), ...Object.values(event.sourceExceptions || {})].some(item => item.calendarId && allowed.has(item.calendarId)));
  const occupied = eventOccurrences(relevant, addDays(link.from, -1), addDays(link.through, 2), link.timeZone, birthdays).filter(event => allowed.has(event.calendarId));
  const duration = link.durationMinutes * 60000, buffer = link.bufferMinutes * 60000;
  const bookedBuffers = new Map((state.bookingData?.receipts || []).map(receipt => [receipt.eventId, (receipt.bufferMinutes || 0)*60000]));
  const candidates: number[] = [];
  if (link.mode === "manual") for (const local of link.manualStarts) candidates.push(strictInstant(local, link.timeZone));
  else for (let date = link.from; date <= link.through; date = addDays(date, 1)) {
    if (!link.weekdays.includes(Temporal.PlainDate.from(date).dayOfWeek)) continue;
    const startMinute = Number(link.dayStart.slice(0,2))*60 + Number(link.dayStart.slice(3)), endMinute = Number(link.dayEnd.slice(0,2))*60 + Number(link.dayEnd.slice(3));
    for (let minute = startMinute; minute + link.durationMinutes <= endMinute; minute += link.durationMinutes + link.bufferMinutes) {
      const local = `${date}T${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
      try {
        const start = strictInstant(local, link.timeZone);
        // Reject a candidate crossing a DST discontinuity or the daily boundary.
        const endLocal = localFor(start + duration, link.timeZone);
        if (endLocal.slice(0,10) === date && endLocal.slice(11,16) <= link.dayEnd && strictInstant(endLocal,link.timeZone) === start + duration) candidates.push(start);
      } catch { /* Nonexistent/ambiguous local times are not offered. */ }
    }
  }
  return [...new Set(candidates)].sort((a,b)=>a-b).filter(start => {
    try { if (strictInstant(localFor(start + duration, link.timeZone), link.timeZone) !== start + duration) return false; } catch { return false; }
    return start >= now + link.noticeHours*3600000 && !occupied.some(event => {
      const gap = Math.max(buffer, bookedBuffers.get(event.eventId) || 0);
      return event.startMs < start + duration + gap && event.endMs > start - gap;
    });
  }).map(start => ({ start: new Date(start).toISOString(), end: new Date(start + duration).toISOString() }));
}
export async function publicBooking(token: string): Promise<PublicBooking> {
  if (!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) return fail("This booking link is unavailable.",404);
  const state = await readPlanningState(), link = resolve(token, state);
  const birthdays = await repeatBirthdays(state.events);
  return { name: link.name, description: link.description, location: link.location, timeZone: link.timeZone, durationMinutes: link.durationMinutes, slots: availableBookingSlots(link, { ...state, events: [...state.events, ...await readWellnessCalendarEvents()] }, birthdays), confirmationEmail: bookingEmailConfig().ready && (link.emailPreferences?.guestConfirmation ?? true) };
}
export async function reserveBooking(token: string, input: Record<string, unknown>, ip: string) {
  const name = text(input.name, "name", 120, true), email = text(input.email, "email", 254, true).toLowerCase(), note = text(input.note ?? "", "note", 1500);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
  if (input.website) return fail("This booking could not be submitted.");
  const requestId = text(input.requestId, "request identifier", 36, true), start = text(input.start, "appointment time", 40, true);
  if (!/^[a-f0-9-]{36}$/.test(requestId) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(start)) return fail("Choose a valid appointment time.");
  const fingerprint = hash(JSON.stringify([token, start, name, email, note]));
  const ipHash = createHmac("sha256", signingSecret()).update(`booking-ip:${ip}`).digest("hex"), emailHash = createHmac("sha256", signingSecret()).update(`booking-email:${email}`).digest("hex");
  const birthdays = await repeatBirthdays((await readPlanningState()).events);
  const wellnessEvents = await readWellnessCalendarEvents();
  return mutatePlanningState(state => {
    const link = resolve(token, state), data = state.bookingData!, now = Date.now();
    const previous = data.receipts.find(receipt => receipt.id === requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.linkId !== link.id) return fail("This request has already been used. Refresh before booking.", 409);
      const event = state.events.find(event => event.id === previous.eventId && !event.archivedAt);
      if (!event || event.source?.cancelled || event.overrides?.cancelled) return fail("This booking is no longer active. Contact the organizer.", 409);
      return { state, result: { name: link.name, start: previous.start, end: previous.end, timeZone: link.timeZone, location: link.location, confirmationEmail: Boolean(previous.emails && previous.emails.guest.status !== "cancelled") } };
    }
    const recent = data.receipts.filter(receipt => now - Date.parse(receipt.createdAt) < 86400000);
    if (recent.filter(receipt => receipt.emailHash === emailHash).length >= 5 || recent.filter(receipt => receipt.ipHash === ipHash && now - Date.parse(receipt.createdAt) < 3600000).length >= 10 || recent.filter(receipt => receipt.linkId === link.id && now - Date.parse(receipt.createdAt) < 3600000).length >= 60) return fail("Too many bookings. Please try again later or contact the organizer.", 429);
    if (data.receipts.length >= 20000) return fail("Bookings are temporarily unavailable. Contact the organizer.", 503);
    const slot = availableBookingSlots(link, { ...state, events: [...state.events, ...wellnessEvents] }, birthdays, now).find(slot => slot.start === start);
    if (!slot) return fail("That time is no longer available. Please choose another time.", 409);
    const stamp = new Date(now).toISOString();
    const event = normalizePlanningRecord("events", { id: randomUUID(), title: `${link.name} — ${name}`, description: note, start: localFor(Date.parse(slot.start), link.timeZone), end: localFor(Date.parse(slot.end), link.timeZone), timeZone: link.timeZone, allDay: false, calendarId: link.calendarId, location: link.location, linkedRefs: [], participants: [{ name, email }], recurrence: "", exceptions: {}, reminderMinutes: 15, kind: "event", createdAt: stamp, updatedAt: stamp });
    const emails = queueBookingEmails({ title: link.name, guestName: name, guestEmail: email, note, location: link.location, timeZone: link.timeZone }, link.emailPreferences);
    const receipt = { id: requestId, linkId: link.id, eventId: event.id, fingerprint, ipHash, emailHash, createdAt: stamp, bufferMinutes: link.bufferMinutes, ...slot, emails };
    return { state: { ...state, events: [...state.events, event], bookingData: { ...data, receipts: [...data.receipts, receipt] } }, result: { name: link.name, ...slot, timeZone: link.timeZone, location: link.location, confirmationEmail: Boolean(emails && emails.guest.status !== "cancelled") } };
  });
}
