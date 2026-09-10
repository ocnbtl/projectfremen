"use client";
import { useState, type ReactNode } from "react";
import type { exportContactData } from "../../lib/modules/people/transfer";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export type ExportPreview = {
  contacts: ReturnType<typeof exportContactData>[];
  extras: Record<string, unknown> & { photos?: Record<string, string> };
  bytes: number;
  format: string;
};
const label = (key: string) => ({
  context: "Description", primaryEmail: "Primary email", primaryEmployer: "Employer",
  primaryOccupation: "Occupation", originalFields: "Original file fields", lifeDream: "Life dreams",
  objectLinks: "Linked objects", participantIds: "Participant IDs", occurredOn: "Date",
}[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase()));
const hasValue = (value: unknown): boolean => value !== null && value !== undefined && value !== "" &&
  (typeof value !== "object" || Object.values(value).some(hasValue));

/** Read-only structured rendering of the same privacy-filtered server data used by export. */
function PreviewFields({ value }: { value: unknown }) {
  if (!hasValue(value)) return null;
  if (Array.isArray(value)) return <ul>{value.filter(hasValue).map((item, i) => <li key={i}><PreviewFields value={item} /></li>)}</ul>;
  if (typeof value === "object" && value) return <dl>{Object.entries(value).filter(([key, item]) => hasValue(item) && !["id", "organizationId", "participantIds", "participants", "objectId", "sourceId", "targetId", "pinned"].includes(key)).map(([key, item]) => <div className={typeof item === "object" ? "is-nested" : undefined} key={key}><dt>{label(key)}</dt><dd><PreviewFields value={item} /></dd></div>)}</dl>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span>{String(value)}</span>;
}
function readableContact(contact: ExportPreview["contacts"][number]) {
  const { fullName, primaryEmail, phoneNumber, phoneCountryCode, primaryOccupation, primaryEmployer, ...profile } = contact.profile;
  void fullName;
  return {
    ...(!profile.emails?.length && primaryEmail ? { email: primaryEmail } : {}),
    ...(!profile.phones?.length && phoneNumber ? { phone: `${phoneCountryCode || ""} ${phoneNumber}`.trim() } : {}),
    ...(!profile.occupations?.length ? { occupation: primaryOccupation, employer: primaryEmployer } : {}),
    ...profile,
    ...("projects" in contact ? { projects: contact.projects, relations: contact.relations } : {}),
    ...("originalFields" in contact ? { originalFields: contact.originalFields } : {}),
  };
}
function PreviewDetails({ summary, children, initiallyOpen = false }: { summary: ReactNode; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{summary}<UnigentamosIcon role="chevron-down" size={16}/></summary>{open && children}</details>;
}

export default function ContactExportPreview({ preview }: { preview: ExportPreview }) {
  const { photos, ...context } = preview.extras;
  return <section className="people-export-preview" aria-label="Export preview">
    <header><UnigentamosIcon role="show" size={22} /><div><h4>Your export preview</h4><p>{preview.contacts.length} {preview.contacts.length === 1 ? "profile" : "profiles"} · {preview.format.toUpperCase()} · about {Math.max(1, Math.ceil(preview.bytes / 1024))} KB</p></div></header>
    <p>Review the included information below. Your contact app may display standard fields differently; additional details travel as structured data.</p>
    {preview.contacts.map(contact => <PreviewDetails key={contact.id} initiallyOpen={preview.contacts.length === 1} summary={<>{photos?.[contact.id] && <img src={photos[contact.id]} width={36} height={36} alt="" />}<span>{contact.name}<small>{contact.type === "organization" ? "Organization" : "Person"}</small></span></>}>
      <PreviewFields value={readableContact(contact)} />
    </PreviewDetails>)}
    {Object.values(context).some(hasValue) && <PreviewDetails summary="Included interactions and object links"><PreviewFields value={context}/></PreviewDetails>}
  </section>;
}
