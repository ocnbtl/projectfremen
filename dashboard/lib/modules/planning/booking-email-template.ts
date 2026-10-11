import type { BookingReceipt } from "./booking-types";
export type BookingEmailRole = "guest" | "organizer";
type Role = BookingEmailRole;

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
// Version 1 must remain stable: provider retries require byte-identical payloads.
export function bookingEmailPayload(receipt: Pick<BookingReceipt, "start" | "end" | "emails">, role: Role) {
  const mail = receipt.emails!;
  const format = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: mail.timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
  const heading = role === "guest" ? "Your booking is confirmed" : "You have a new booking";
  const detail = role === "guest" ? `Hi ${mail.guestName}, your time is reserved.` : `${mail.guestName} booked a time with you.`;
  const rows = [["Appointment", mail.title], ["Starts", format(receipt.start)], ["Ends", format(receipt.end)], ["Time zone", mail.timeZone], ["Location", mail.location || "Not specified — contact the organizer for details."]];
  if (role === "organizer") rows.push(["Guest", `${mail.guestName} (${mail.guestEmail})`]);
  if (mail.note) rows.push(["Booking note", mail.note]);
  if (mail.version === 2 && role === "guest" && mail.guestMessage) rows.push(["From your host", mail.guestMessage]);
  const footer = role === "guest" ? "Need to change or cancel? Reply to this email to contact the organizer." : "The appointment is on your Unigentamos calendar. Reply to this email to contact your guest.";
  return {
    from: mail.from, to: role === "organizer" && mail.version === 2 ? mail.organizerEmails || [mail.organizerEmail] : [role === "guest" ? mail.guestEmail : mail.organizerEmail], reply_to: role === "guest" ? mail.organizerEmail : mail.guestEmail,
    subject: `${role === "guest" ? "Booking confirmed" : "New booking"}: ${mail.title}`.replace(/[\r\n]+/g, " ").slice(0, 200),
    text: `${heading}\n\n${detail}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n\n")}\n\n${footer}\n\nUnigentamos`,
    html: `<!doctype html><html><body style="margin:0;background:#f7f7fa;font-family:Arial,sans-serif;color:#243c44"><table role="presentation" style="width:100%;padding:28px 14px"><tr><td align="center"><table role="presentation" style="width:100%;max-width:560px;background:#fff;border:1px solid #e0ddec;border-radius:16px"><tr><td style="padding:28px"><p style="font-size:13px;color:#62568f;font-weight:bold;margin:0 0 22px">Unigentamos</p><h1 style="font-size:24px;line-height:1.3;margin:0 0 14px">${heading}</h1><p style="font-size:14px;line-height:1.6">${escape(detail)}</p><table role="presentation" style="width:100%;margin:22px 0">${rows.map(([label, value]) => `<tr><td style="padding:7px 12px 7px 0;vertical-align:top;font-size:12px;color:#767581;width:85px">${label}</td><td style="padding:7px 0;font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap">${escape(value)}</td></tr>`).join("")}</table><p style="font-size:12px;line-height:1.6;color:#767581">${footer}</p></td></tr></table></td></tr></table></body></html>`,
  };
}
