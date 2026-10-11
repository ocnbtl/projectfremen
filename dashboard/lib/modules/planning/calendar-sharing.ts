import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import { addDays, eventOccurrences } from "./calendar-model";
import { effectiveEvent, type Calendar, type CalendarEvent, type PlanningState } from "./types";
import type { BirthdaySource } from "./observances";

export type ShareDetails = { titles: boolean; locations: boolean; descriptions: boolean };
export type CalendarShare = {
  id: string; name: string; calendarIds: string[]; details: ShareDetails;
  keyVersion: string; createdAt: string; updatedAt: string; revokedAt?: string;
};
export type CalendarShareView = Omit<CalendarShare, "keyVersion"> & { path: string | null };
const FILE = "calendar-shares.json";
export class ShareError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function secret() {
  const value = process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!value) throw new Error("Calendar sharing is not configured");
  return value;
}
function signature(share: CalendarShare) {
  return createHmac("sha256", secret()).update(`calendar-share:v1:${share.id}:${share.keyVersion}`).digest("hex");
}
export function shareView(share: CalendarShare): CalendarShareView {
  const { keyVersion: _privateKey, ...view } = share;
  void _privateKey;
  return { ...view, path: share.revokedAt ? null : `/api/calendar-feeds/${share.id}.${signature(share)}.ics` };
}
export const readCalendarShares = () => readJsonFile<CalendarShare[]>(FILE, []);
export async function resolveCalendarShare(token: string): Promise<CalendarShare | undefined> {
  const match = /^([a-f0-9-]{36})\.([a-f0-9]{64})\.ics$/.exec(token);
  if (!match) return;
  const share = (await readCalendarShares()).find(item => item.id === match[1] && !item.revokedAt);
  if (!share) return;
  const expected = Buffer.from(signature(share), "hex"), provided = Buffer.from(match[2], "hex");
  return timingSafeEqual(expected, provided) ? share : undefined;
}
function selection(input: Record<string, unknown>, calendars: Calendar[]) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) throw new ShareError("Choose a link name (up to 120 characters).");
  if (!Array.isArray(input.calendarIds) || !input.calendarIds.length || input.calendarIds.length > 50 ||
    input.calendarIds.some(id => typeof id !== "string" || !calendars.some(c => c.id === id && !c.archivedAt)))
    throw new ShareError("Choose at least one available calendar.");
  const details = input.details as ShareDetails | undefined;
  if (!details || [details.titles, details.locations, details.descriptions].some(value => typeof value !== "boolean"))
    throw new ShareError("Choose which event details to share.");
  return { name, calendarIds: [...new Set(input.calendarIds as string[])], details: {
    titles: details.titles, locations: details.titles && details.locations, descriptions: details.titles && details.descriptions,
  } };
}
export async function changeCalendarShare(input: Record<string, unknown>, calendars: Calendar[]) {
  secret(); // Fail before writing if a stable signing key is unavailable.
  return mutateJsonFile<CalendarShare[], CalendarShare>(FILE, [], current => {
    const operation = input.operation;
    if (operation === "create") {
      if (current.length >= 50) throw new ShareError("The limit is 50 sharing links.");
      const now = new Date().toISOString();
      const item: CalendarShare = { ...selection(input, calendars), id: randomUUID(), keyVersion: randomBytes(32).toString("hex"), createdAt: now, updatedAt: now };
      return { value: [...current, item], result: item };
    }
    if (!["update", "revoke", "regenerate"].includes(String(operation))) throw new ShareError("Unknown sharing action.");
    const previous = current.find(item => item.id === input.id);
    if (!previous) throw new ShareError("Sharing link not found.", 404);
    if (input.expectedUpdatedAt !== previous.updatedAt) throw new ShareError("This link changed in another tab. Refresh and try again.", 409);
    const now = new Date(Math.max(Date.now(), Date.parse(previous.updatedAt) + 1)).toISOString();
    const item = { ...previous, updatedAt: now };
    if (operation === "update") Object.assign(item, selection(input, calendars));
    if (operation === "revoke") item.revokedAt = now;
    if (operation === "regenerate") {
      item.keyVersion = randomBytes(32).toString("hex");
      delete item.revokedAt;
    }
    return { value: current.map(share => share.id === item.id ? item : share), result: item };
  });
}

export function sharedEvents(share: CalendarShare, state: PlanningState): CalendarEvent[] {
  const allowed = new Set(state.calendars.filter(c => !c.archivedAt && share.calendarIds.includes(c.id)).map(c => c.id));
  // An exception can move an occurrence into or out of the selected calendars.
  return state.events.filter(event => allowed.has(effectiveEvent(event).calendarId) ||
    [...Object.values(event.sourceExceptions || {}), ...Object.values(event.exceptions || {})].some(exception => exception.calendarId && allowed.has(exception.calendarId)));
}
const escapeText = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
/** Fold at 75 octets without splitting a UTF-8 character (RFC 5545). */
export function foldCalendarLine(line: string) {
  let result = "", bytes = 0;
  for (const character of line) {
    const length = Buffer.byteLength(character);
    if (bytes + length > 75) { result += "\r\n "; bytes = 1; }
    result += character; bytes += length;
  }
  return result;
}
export function serializeCalendarShare(share: CalendarShare, state: PlanningState, birthdays?: BirthdaySource[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const allowed = new Set(state.calendars.filter(c => !c.archivedAt && share.calendarIds.includes(c.id)).map(c => c.id));
  const events = sharedEvents(share, state);
  const occurrences = eventOccurrences(events, addDays(today, -366), addDays(today, 732), "UTC", birthdays)
    .filter(event => allowed.has(event.calendarId));
  if (occurrences.length > 10000) throw new Error("Sharing feed exceeds its event limit");
  const originals = new Map(events.map(event => [event.id, event]));
  const places = new Map(state.places.filter(place => !place.archivedAt).map(place => [place.id, place]));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Unigentamos//Calendar sharing//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escapeText(share.name)}`, "X-PUBLISHED-TTL:PT1H"];
  for (const event of occurrences) {
    const original = originals.get(event.eventId)!;
    const base = effectiveEvent(original);
    const recurring = Boolean(base.recurrence || base.recurrenceAnchor || base.recurrenceDates?.length);
    const identity = `${share.id}:${event.eventId}:${recurring ? event.occurrenceKey : "single"}`;
    const uid = createHash("sha256").update(identity).digest("hex");
    const place = event.placeId ? places.get(event.placeId) : undefined;
    const modified = Math.max(Date.parse(original.updatedAt), Date.parse(share.updatedAt), share.details.locations && place ? Date.parse(place.updatedAt) : 0);
    lines.push("BEGIN:VEVENT", `UID:${uid}@unigentamos.com`, `DTSTAMP:${utc(modified)}`, `LAST-MODIFIED:${utc(modified)}`, `SEQUENCE:${Math.floor(modified / 1000)}`);
    if (event.allDay) lines.push(`DTSTART;VALUE=DATE:${event.start.slice(0,10).replace(/-/g, "")}`, `DTEND;VALUE=DATE:${event.end.slice(0,10).replace(/-/g, "")}`);
    else lines.push(`DTSTART:${utc(event.startMs)}`, `DTEND:${utc(event.endMs)}`);
    lines.push(`SUMMARY:${escapeText(share.details.titles ? event.title : "Busy")}`);
    if (share.details.titles && share.details.descriptions && event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (share.details.titles && share.details.locations) {
      const location = place ? [...new Set([place.name, place.address].filter(Boolean))].join(" — ") : event.location;
      if (location) lines.push(`LOCATION:${escapeText(location)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const result = lines.map(foldCalendarLine).join("\r\n") + "\r\n";
  if (Buffer.byteLength(result) > 5_000_000) throw new Error("Sharing feed exceeds its size limit");
  return result;
}
