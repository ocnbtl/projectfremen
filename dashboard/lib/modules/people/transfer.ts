import Papa from "papaparse";
import type {
  PersonalContactProfile,
  PersonalRecord,
} from "../../personal-records-store";
import { findPeopleDuplicates } from "./duplicates";
import {
  normalizePhoneForStorage,
  phoneCountryCodeForValue,
  validateInternationalPhone,
} from "./phone";
import { normalizeBirthday } from "./birthday";

export const IMPORT_LIMIT = 500;
export type ContactDraft = {
  key: string;
  name: string;
  kind: "person" | "org";
  profile: Partial<PersonalContactProfile>;
  employer: string;
  employerWebsite: string;
  photo?: string;
  extra: Record<string, string>;
  warnings: string[];
};
export type CsvMapping = Record<string, string>;
export const CSV_FIELDS = [
  "name",
  "firstName",
  "middleName",
  "lastName",
  "nickname",
  "email",
  "phone",
  "employer",
  "occupation",
  "employerWebsite",
  "website",
  "birthday",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "notes",
  "kind",
] as const;
export const transferNameKey = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const safeUrl = (value: string) => {
  try {
    const url = new URL(/^https?:/i.test(value) ? value : `https://${value}`);
    return /^https?:$/.test(url.protocol) &&
      url.hostname.includes(".") &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
};
const category = (value: string) =>
  /work|business/i.test(value)
    ? "work"
    : /school|university/i.test(value)
      ? "university"
      : /home|personal/i.test(value)
        ? "personal"
        : "primary";
const blank = (key: string): ContactDraft => ({
  key,
  name: "",
  kind: "person",
  profile: { emails: [], phones: [], locations: [], occupations: [] },
  employer: "",
  employerWebsite: "",
  extra: {},
  warnings: [],
});
function phone(
  draft: ContactDraft,
  value: string,
  label: string,
  countryCode: string,
) {
  if (/(?:ext\.?|;ext=|\bx)\s*\d+/i.test(value))
    draft.extra[`Phone with extension ${draft.profile.phones!.length + 1}`] =
      value;
  const code = phoneCountryCodeForValue(value, countryCode),
    number = normalizePhoneForStorage(value, code);
  if (!number) return;
  const error = validateInternationalPhone(number, code);
  if (error) {
    draft.extra[`Unformatted phone ${Object.keys(draft.extra).length + 1}`] =
      value;
    draft.warnings.push(`Check phone: ${value}`);
    return;
  }
  draft.profile.phones!.push({
    id: `phone-${draft.profile.phones!.length}`,
    category: category(label),
    number,
    countryCode: code,
  });
}
function email(draft: ContactDraft, value: string, label: string) {
  if (!value) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    draft.extra[`Unformatted email ${Object.keys(draft.extra).length + 1}`] =
      value;
    draft.warnings.push(`Check email: ${value}`);
    return;
  }
  draft.profile.emails!.push({
    id: `email-${draft.profile.emails!.length}`,
    category: category(label),
    address: value,
  });
}
function finish(draft: ContactDraft) {
  if (draft.profile.birthday) {
    const source = draft.profile.birthday;
    const normalized = normalizeBirthday(
      source
        .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")
        .replace(/^--(\d{2})(\d{2})$/, "--$1-$2"),
    );
    // Ambiguous slash dates stay visible as source data instead of guessing a locale.
    if (!normalized) {
      draft.extra["Original birthday"] = source;
      draft.warnings.push(`Check birthday: ${source} (use YYYY-MM-DD)`);
    }
    draft.profile.birthday = normalized;
  }
  draft.name =
    draft.name ||
    [draft.profile.firstName, draft.profile.middleName, draft.profile.lastName]
      .filter(Boolean)
      .join(" ") ||
    (draft.kind === "org" ? draft.employer : "");
  if (!draft.name) draft.warnings.push("Add a name to include this contact.");
  draft.profile.fullName = draft.name;
  if (draft.employer || draft.profile.primaryOccupation)
    draft.profile.occupations = [
      {
        id: "job-1",
        title: draft.profile.primaryOccupation || "",
        employer: draft.employer,
        status: "current",
      },
    ];
  return draft;
}
export function readCsv(source: string) {
  const parsed = Papa.parse<Record<string, string>>(
    source.replace(/^\uFEFF/, ""),
    { header: true, skipEmptyLines: "greedy", preview: IMPORT_LIMIT + 1 },
  );
  if (
    parsed.errors.some(
      (error) => error.type === "Quotes" || error.code === "TooManyFields",
    )
  )
    throw new Error(
      "This CSV has an unfinished quote or extra columns. Export it again and retry.",
    );
  if (parsed.data.length > IMPORT_LIMIT || parsed.meta.truncated)
    throw new Error(`Choose a file with up to ${IMPORT_LIMIT} contacts.`);
  return { headers: parsed.meta.fields || [], rows: parsed.data };
}
export function suggestCsvMapping(headers: string[]): CsvMapping {
  const aliases: Record<string, string[]> = {
    name: ["name", "fullname", "displayname"],
    firstName: ["firstname", "givenname"],
    middleName: ["middlename", "additionalname"],
    lastName: ["lastname", "familyname", "surname"],
    nickname: ["nickname"],
    email: ["email", "emailaddress", "email1value"],
    phone: ["phone", "phonenumber", "mobilephone", "mobile", "phone1value"],
    employer: [
      "employer",
      "company",
      "companyname",
      "organizationname",
      "organization1name",
    ],
    occupation: [
      "occupation",
      "jobtitle",
      "title",
      "organizationtitle",
      "organization1title",
    ],
    employerWebsite: ["employerwebsite", "companywebsite"],
    website: ["website", "webpage", "website1value"],
    birthday: ["birthday", "birthdate"],
    address: ["address", "homestreet", "address1street"],
    city: ["city", "homecity", "address1city"],
    state: ["state", "homestate", "address1region"],
    zip: ["zip", "postalcode", "homepostalcode", "address1postalcode"],
    country: ["country", "homecountry", "address1country"],
    notes: ["notes", "note"],
    kind: ["kind", "type", "contacttype"],
  };
  return Object.fromEntries(
    CSV_FIELDS.map((field) => [
      field,
      headers.find((header) =>
        aliases[field]?.includes(transferNameKey(header)),
      ) || "",
    ]),
  );
}
export function csvContacts(
  rows: Record<string, string>[],
  mapping: CsvMapping,
  countryCode = "+1",
): ContactDraft[] {
  return rows.map((row, index) => {
    const draft = blank(`csv-${index}`),
      used = new Set<string>();
    const get = (field: string) => {
      const header = mapping[field];
      if (header) used.add(header);
      return text(row[header]);
    };
    draft.name = get("name");
    draft.kind = /^(org|organization|company|business)$/i.test(get("kind"))
      ? "org"
      : "person";
    for (const field of [
      "firstName",
      "middleName",
      "lastName",
      "nickname",
      "birthday",
      "notes",
    ] as const)
      draft.profile[field] = get(field);
    draft.employer = get("employer");
    draft.employerWebsite = safeUrl(get("employerWebsite"));
    draft.profile.primaryOccupation = get("occupation");
    draft.profile.website = safeUrl(get("website"));
    email(draft, get("email"), "primary");
    phone(draft, get("phone"), "primary", countryCode);
    const address = [
      get("address"),
      get("city"),
      get("state"),
      get("zip"),
      get("country"),
    ]
      .filter(Boolean)
      .join(", ");
    if (address)
      draft.profile.locations = [
        {
          id: "place-1",
          label: "Imported address",
          location: [get("city"), get("state"), get("country")]
            .filter(Boolean)
            .join(", "),
          address,
        },
      ];
    for (const [header, value] of Object.entries(row)) {
      if (!text(value) || used.has(header)) continue;
      if (
        /^(e-?mail.*(?:value|address)|(?:home|work|business|other).*e-?mail|email\s*\d+)$/i.test(
          header,
        )
      ) {
        email(draft, text(value), header);
        used.add(header);
      } else if (
        /^(phone.*value|(?:home|work|business|other).*phone|phone\s*\d+)$/i.test(
          header,
        )
      ) {
        phone(draft, text(value), header, countryCode);
        used.add(header);
      } else if (
        ["linkedin", "instagram", "tiktok", "x", "youtube"].includes(
          header.toLowerCase(),
        )
      ) {
        draft.profile[header.toLowerCase() as "linkedin"] = safeUrl(value);
        used.add(header);
      }
    }
    for (const [header, value] of Object.entries(row))
      if (text(value) && !used.has(header)) draft.extra[header] = text(value);
    return finish(draft);
  });
}
const unescapeCard = (value: string) =>
  value.replace(/\\([nN,;\\])/g, (_, c: string) => (/n/i.test(c) ? "\n" : c));
const splitCard = (value: string) => value.split(/(?<!\\);/).map(unescapeCard);
function quotedPrintable(value: string, charset: string) {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "=" && /^[a-f\d]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...new TextEncoder().encode(value[i]));
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
}
export function vcardContacts(
  source: string,
  countryCode = "+1",
): ContactDraft[] {
  const lines: string[] = [];
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const previous = lines[lines.length - 1] || "";
    if (
      /ENCODING=QUOTED-PRINTABLE/i.test(previous.split(":")[0]) &&
      previous.endsWith("=")
    )
      lines[lines.length - 1] =
        previous.slice(0, -1) + line.replace(/^[ \t]/, "");
    else if (/^[ \t]/.test(line))
      lines[lines.length - 1] = previous + line.slice(1);
    else if (
      /PHOTO;.*ENCODING=(B|BASE64)/i.test(previous.split(":")[0]) &&
      /^[A-Za-z0-9+/=]+$/.test(line)
    )
      lines[lines.length - 1] = previous + line;
    else lines.push(line);
  }
  const unfolded = lines.join("\n");
  const blocks = unfolded.match(/BEGIN:VCARD\n[\s\S]*?\nEND:VCARD/gi) || [];
  if (
    !blocks.length ||
    blocks.length !== (source.match(/BEGIN:VCARD/gi) || []).length
  )
    throw new Error("This vCard file is incomplete or unreadable.");
  if (blocks.length > IMPORT_LIMIT)
    throw new Error(`Choose a file with up to ${IMPORT_LIMIT} contacts.`);
  return blocks.map((block, index) => {
    const draft = blank(`vcf-${index}`);
    for (const line of block.split("\n")) {
      const colon = line.indexOf(":"),
        prefix = line.slice(0, colon),
        raw = line.slice(colon + 1);
      if (colon < 0) continue;
      const key = prefix.split(";")[0].replace(/^.*\./, "").toUpperCase();
      const value = /ENCODING=QUOTED-PRINTABLE/i.test(prefix)
        ? quotedPrintable(raw, prefix.match(/CHARSET=([^;]+)/i)?.[1] || "utf-8")
        : raw;
      const clean = unescapeCard(value),
        parts = splitCard(value);
      if (key === "FN") draft.name = clean;
      else if (key === "N") {
        draft.profile.lastName = parts[0];
        draft.profile.firstName = parts[1];
        draft.profile.middleName = parts[2];
      } else if (key === "KIND" || key === "X-ABSHOWAS") {
        if (/org|company/i.test(clean)) draft.kind = "org";
      } else if (key === "ORG") {
        draft.employer = parts[0];
        if (parts[1]) draft.extra.Department = parts.slice(1).join(" / ");
      } else if (key === "TITLE") draft.profile.primaryOccupation = clean;
      else if (key === "EMAIL") email(draft, clean, prefix);
      else if (key === "TEL")
        phone(draft, clean.replace(/^tel:/i, ""), prefix, countryCode);
      else if (key === "URL" || key === "X-SOCIALPROFILE") {
        const url = safeUrl(clean),
          social = prefix
            .match(/TYPE=(linkedin|instagram|tiktok|youtube|twitter|x)/i)?.[1]
            ?.toLowerCase();
        if (url && social)
          draft.profile[(social === "twitter" ? "x" : social) as "linkedin"] =
            url;
        else if (url) draft.profile.website ||= url;
        else draft.extra.URL = clean;
      } else if (key === "BDAY")
        draft.profile.birthday = /X-APPLE-OMIT-YEAR=/i.test(prefix)
          ? clean
              .replace(/^\d{4}-?/, "--")
              .replace(/^--(\d{2})(\d{2})$/, "--$1-$2")
          : clean.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
      else if (key === "NICKNAME") draft.profile.nickname = clean;
      else if (key === "NOTE") draft.profile.notes = clean;
      else if (key === "ADR")
        draft.profile.locations!.push({
          id: `place-${draft.profile.locations!.length}`,
          label: /WORK/i.test(prefix) ? "Work" : "Home",
          location: [parts[3], parts[4], parts[6]].filter(Boolean).join(", "),
          address: parts.filter(Boolean).join(", "),
        });
      else if (key === "PHOTO") {
        const encoded = /^data:image\/(jpeg|png|webp);base64,/i.test(raw)
          ? raw
          : /ENCODING=(B|BASE64)/i.test(prefix)
            ? `data:image/${/PNG/i.test(prefix) ? "png" : /WEBP/i.test(prefix) ? "webp" : "jpeg"};base64,${raw}`
            : "";
        if (encoded && encoded.length <= 200_000) draft.photo = encoded;
        else {
          draft.warnings.push(
            "Picture needs to be added separately (remote, unsupported, or over 150 KB).",
          );
          draft.extra["Photo reference"] = encoded
            ? "Embedded picture exceeded the import size limit"
            : clean;
        }
      } else if (!["BEGIN", "END", "VERSION", "PRODID"].includes(key))
        draft.extra[prefix] = clean;
    }
    return finish(draft);
  });
}
export function draftRecord(draft: ContactDraft): PersonalRecord {
  return {
    id: draft.key,
    title: draft.name,
    className: draft.kind,
    profile: draft.profile,
    domain: "notes-docs",
  } as PersonalRecord;
}
export function draftMatches(draft: ContactDraft, existing: PersonalRecord[]) {
  return findPeopleDuplicates([...existing, draftRecord(draft)])
    .filter(
      (match) => match.left.id === draft.key || match.right.id === draft.key,
    )
    .map((match) => ({
      id: match.left.id === draft.key ? match.right.id : match.left.id,
      reasons: match.reasons,
    }));
}
export type ExportOptions = {
  notes: boolean;
  dreams: boolean;
  interactions: boolean;
  objects: boolean;
  extras: boolean;
};
export const PRIVATE_EXPORT_DEFAULTS: ExportOptions = {
  notes: false,
  dreams: false,
  interactions: false,
  objects: false,
  extras: false,
};
export function exportContactData(
  record: PersonalRecord,
  options: ExportOptions,
) {
  const p = record.profile || ({} as PersonalContactProfile);
  const {
    notes,
    lifeDream,
    interactions,
    memories,
    associatedPeople,
    partner,
    children,
    photoUrl,
    photoUpdatedAt,
    ...basic
  } = p;
  void photoUrl;
  void photoUpdatedAt;
  // Construct the export deliberately; raw records include private metadata and relations.
  return {
    id: record.id,
    name: record.title,
    type: record.className === "org" ? "organization" : "person",
    profile: {
      ...basic,
      occupations: basic.occupations?.map(({ organizationId, ...job }) => ({
        ...job,
        ...(options.objects ? { organizationId } : {}),
      })),
      education: basic.education?.map(({ organizationId, ...school }) => ({
        ...school,
        ...(options.objects ? { organizationId } : {}),
      })),
      ...(options.notes ? { notes, memories } : {}),
      ...(options.dreams ? { lifeDream } : {}),
      ...(options.interactions ? { interactions } : {}),
      ...(options.objects ? { associatedPeople, partner, children } : {}),
    },
    ...(options.objects
      ? { projects: record.projects, relations: record.relations }
      : {}),
    ...(options.extras
      ? { originalFields: record.importMeta?.extra || {} }
      : {}),
  };
}
const escapeCard = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function foldCard(line: string) {
  let result = "",
    bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > 74) {
      result += "\r\n ";
      bytes = 1;
    }
    result += ch;
    bytes += size;
  }
  return result;
}
export function contactsVcard(
  contacts: ReturnType<typeof exportContactData>[],
  extras: Record<string, unknown> = {},
) {
  return (
    contacts
      .map((contact) => {
        const p = contact.profile,
          lines = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `FN:${escapeCard(contact.name)}`,
            `N:${[p.lastName, p.firstName, p.middleName, "", ""].map((x) => escapeCard(x || "")).join(";")}`,
          ];
        if (contact.type === "organization")
          lines.push("X-ABShowAs:COMPANY", `ORG:${escapeCard(contact.name)}`);
        else if (p.primaryEmployer)
          lines.push(`ORG:${escapeCard(p.primaryEmployer)}`);
        if (p.primaryOccupation)
          lines.push(`TITLE:${escapeCard(p.primaryOccupation)}`);
        for (const e of p.emails || [])
          lines.push(
            `EMAIL;TYPE=${e.category === "work" ? "WORK" : "HOME"}:${escapeCard(e.address)}`,
          );
        for (const n of p.phones || [])
          lines.push(
            `TEL;TYPE=${n.category === "work" ? "WORK" : "CELL"}:${escapeCard(n.number)}`,
          );
        if (p.website) lines.push(`URL:${escapeCard(p.website)}`);
        if (p.birthday) lines.push(`BDAY:${escapeCard(p.birthday)}`);
        for (const place of p.locations || [])
          lines.push(
            `ADR;TYPE=HOME:;;${escapeCard(place.address || "")};${escapeCard(place.location || "")};;;`,
          );
        const photo = (extras.photos as Record<string, string> | undefined)?.[
          contact.id
        ];
        if (photo)
          lines.push(
            `PHOTO;ENCODING=b;TYPE=${photo.startsWith("data:image/png") ? "PNG" : photo.startsWith("data:image/webp") ? "WEBP" : "JPEG"}:${photo.split(",")[1]}`,
          );
        if (p.notes) lines.push(`NOTE:${escapeCard(p.notes)}`);
        const extra = {
          ...contact,
          sharedInteractions: (
            extras.interactions as { participants?: string[] }[] | undefined
          )?.filter((i) => i.participants?.includes(contact.id)),
          objectLinks: extras.objectLinks,
        };
        lines.push(
          `X-UNIGENTAMOS-DATA:${escapeCard(JSON.stringify(extra))}`,
          "END:VCARD",
        );
        return lines.map(foldCard).join("\r\n");
      })
      .join("\r\n") + "\r\n"
  );
}
export function contactsCsv(
  contacts: ReturnType<typeof exportContactData>[],
  extras: Record<string, unknown> = {},
) {
  return (
    "\uFEFF" +
    Papa.unparse(
      contacts.map((c) => ({
        Name: c.name,
        Type: c.type,
        "First Name": c.profile.firstName || "",
        "Last Name": c.profile.lastName || "",
        Email: c.profile.emails?.[0]?.address || c.profile.primaryEmail || "",
        Phone: c.profile.phones?.[0]?.number || c.profile.phoneNumber || "",
        Company: c.profile.primaryEmployer || "",
        "Job Title": c.profile.primaryOccupation || "",
        Website: c.profile.website || "",
        Birthday: c.profile.birthday || "",
        Notes: c.profile.notes || "",
        "Life dream": c.profile.lifeDream || "",
        "Contact details JSON": JSON.stringify(c),
        "Included activity and links JSON": JSON.stringify(extras),
      })),
      { escapeFormulae: true },
    )
  );
}
