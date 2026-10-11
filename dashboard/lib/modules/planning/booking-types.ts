export type BookingLink = {
  id: string; keyVersion: string; name: string; description: string; location: string;
  calendarId: string; conflictCalendarIds: string[]; timeZone: string;
  durationMinutes: number; bufferMinutes: number; noticeHours: number;
  mode: "manual" | "automatic"; from: string; through: string;
  weekdays: number[]; dayStart: string; dayEnd: string; manualStarts: string[];
  createdAt: string; updatedAt: string; revokedAt?: string;
};
export type BookingLinkView = Omit<BookingLink, "keyVersion"> & { path: string | null; bookingCount: number };
export type BookingReceipt = {
  id: string; linkId: string; eventId: string; fingerprint: string; ipHash: string; emailHash: string;
  createdAt: string; start: string; end: string; bufferMinutes?: number;
  emails?: BookingEmails;
};
export type BookingEmailJob = {
  status: "pending" | "sending" | "accepted" | "failed" | "review" | "cancelled";
  attempts: number; firstAttemptAt?: string; nextAttemptAt?: string;
  lease?: string; leaseUntil?: string; providerId?: string; error?: string;
};
export type BookingEmails = {
  version: 1; from: string; organizerEmail: string; title: string; guestName: string;
  guestEmail: string; note: string; location: string; timeZone: string;
  guest: BookingEmailJob; organizer: BookingEmailJob;
};
export type BookingEmailSummary = {
  ready: boolean; organizerEmail?: string; missing: string[]; pending: number;
  accepted: number; failed: number; review: number;
};
export type BookingData = { links: BookingLink[]; receipts: BookingReceipt[] };
export type BookingSlot = { start: string; end: string };
export type PublicBooking = { name: string; description: string; location: string; timeZone: string; durationMinutes: number; slots: BookingSlot[]; confirmationEmail: boolean };
