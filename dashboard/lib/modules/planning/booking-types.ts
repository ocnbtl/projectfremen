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
};
export type BookingData = { links: BookingLink[]; receipts: BookingReceipt[] };
export type BookingSlot = { start: string; end: string };
export type PublicBooking = { name: string; description: string; location: string; timeZone: string; durationMinutes: number; slots: BookingSlot[] };
