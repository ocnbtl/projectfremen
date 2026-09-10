"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PersonalRecord,
  PersonalContactProfile,
  ImportCompany,
} from "../../lib/personal-records-store";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import {
  csvContacts,
  readCsv,
  suggestCsvMapping,
  vcardContacts,
  draftMatches,
  draftRecord,
  transferNameKey,
  CSV_FIELDS,
  PRIVATE_EXPORT_DEFAULTS,
  type ContactDraft,
  type CsvMapping,
  type ExportOptions,
} from "../../lib/modules/people/transfer";
import type { OrganizationAutofillResult } from "../../lib/modules/people/organization-autofill";
import { normalizeOrganizationIndustry } from "../../lib/modules/people/organization-industries";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { PeopleProfileAvatar } from "./PeopleProfilePhoto";

const SOURCES = [
  {
    name: "Apple Contacts",
    icon: "person",
    help: "On iPhone, open Contacts → Lists, touch and hold a list, then choose Export. On iCloud.com, select contacts and export a vCard.",
  },
  {
    name: "Google Contacts",
    icon: "people",
    help: "At contacts.google.com, select contacts → Export → Google CSV or vCard. Upload that file here.",
  },
  {
    name: "Outlook",
    icon: "email",
    help: "In Outlook People, choose Manage contacts → Export contacts, then upload the CSV.",
  },
  {
    name: "CRM / CSV",
    icon: "organization",
    help: "Export contacts from your CRM as CSV. Name, email, phone, company, and job title are recognized automatically. Adjust columns only if needed.",
  },
];
type Research = {
  profile: Partial<PersonalContactProfile>;
  photo?: string;
  message: string;
  sources: string[];
};
type Props = {
  mode: "import" | "export";
  people: PersonalRecord[];
  onChanged: (records: PersonalRecord[]) => void;
  onBusy: (busy: boolean) => void;
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The transfer could not finish. Your selection is still here.";
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
export default function PeopleTransfer({
  mode,
  people,
  onChanged,
  onBusy,
}: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [source, setSource] = useState(0),
    [drafts, setDrafts] = useState<ContactDraft[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [csv, setCsv] = useState<ReturnType<typeof readCsv> | null>(null),
    [mapping, setMapping] = useState<CsvMapping>({}),
    [country, setCountry] = useState("+1"),
    [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [batch, setBatch] = useState(""),
    [completed, setCompleted] = useState(false);
  const [research, setResearch] = useState<Record<string, Research>>({}),
    [lookupRevision, setLookupRevision] = useState(0),
    [enrich, setEnrich] = useState(true),
    [looking, setLooking] = useState(""),
    [websites, setWebsites] = useState<Record<string, string>>({}),
    [chosenCompanies, setChosenCompanies] = useState<Record<string, string>>(
      {},
    );
  const [options, setOptions] = useState<ExportOptions>({
      ...PRIVATE_EXPORT_DEFAULTS,
    }),
    [format, setFormat] = useState("vcf"),
    [pictures, setPictures] = useState(true),
    [shareFile, setShareFile] = useState<File | null>(null);
  const lock = useRef(false),
    lookup = useRef<AbortController | null>(null),
    researchRef = useRef(research);
  researchRef.current = research;
  const active = useMemo(
    () =>
      people
        .filter((p) => ["person", "org"].includes(p.className) && !p.archivedAt)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [people],
  );
  const reviewed = useMemo(() => {
    const seen = [...active];
    return drafts.map((draft) => {
      const matches = draftMatches(draft, seen);
      seen.push(draftRecord(draft));
      return { draft, matches };
    });
  }, [drafts, active]);
  const employers = useMemo(
    () =>
      [
        ...new Map(
          drafts
            .filter(
              (d) =>
                selected.has(d.key) && d.kind === "person" && d.employer.trim(),
            )
            .map((d) => [
              transferNameKey(d.employer),
              { name: d.employer.trim(), website: d.employerWebsite },
            ]),
        ).entries(),
      ].map(([key, company]) => ({
        ...company,
        key,
        matches: active.filter(
          (p) => p.className === "org" && transferNameKey(p.title) === key,
        ),
      })),
    [drafts, selected, active],
  );
  const employerSignature = JSON.stringify(
    employers.map((c) => [
      c.key,
      c.website,
      websites[c.key],
      c.matches.map((p) => p.id),
    ]),
  );
  useEffect(() => {
    const controller = new AbortController();
    lookup.current = controller;
    if (mode !== "import" || !enrich || completed || busy)
      return () => controller.abort();
    void (async () => {
      for (const company of employers) {
        if (controller.signal.aborted) break;
        const website = websites[company.key] ?? company.website,
          cacheKey = `${company.key}|${website}`;
        if (company.matches.length || researchRef.current[cacheKey]) continue;
        setLooking(company.name);
        try {
          const response = await fetch("/api/people/transfer/employer", {
            method: "POST",
            headers: buildJsonHeadersWithCsrf(),
            signal: controller.signal,
            body: JSON.stringify({ name: company.name, website }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error);
          const result = payload.result as OrganizationAutofillResult,
            profile: Partial<PersonalContactProfile> = {};
          for (const item of result.suggestions) {
            if (item.field === "name") continue;
            const field =
              item.field === "streetAddress" ? "address" : item.field;
            profile[field as "website"] = item.value;
          }
          profile.industry = normalizeOrganizationIndustry(
            profile.organizationType || "",
            profile.industry || "",
          );
          if (profile.headquarters || profile.address)
            profile.locations = [
              {
                id: "hq-1",
                label: "Headquarters",
                location: profile.headquarters,
                address: profile.address,
              },
            ];
          if (!controller.signal.aborted)
            setResearch((current) => ({
              ...current,
              [cacheKey]: {
                profile,
                photo: result.photo?.dataUrl,
                message: result.suggestions.length
                  ? `${result.suggestions.length} public details found`
                  : result.message,
                sources: result.sources || [],
              },
            }));
        } catch (reason) {
          if (!controller.signal.aborted)
            setResearch((current) => ({
              ...current,
              [cacheKey]: {
                profile: {},
                message: errorMessage(reason),
                sources: [],
              },
            }));
        }
      }
      if (!controller.signal.aborted) setLooking("");
    })();
    return () => {
      controller.abort();
    };
    // A changed selection or website cancels stale research; results never write records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employerSignature, enrich, mode, completed, busy, lookupRevision]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  function initialize(rows: ContactDraft[], newFile = true) {
    if (!rows.length) throw new Error("No contacts were found in that file.");
    const seen = [...active],
      next = new Set<string>();
    for (const draft of rows) {
      if (draft.name && !draftMatches(draft, seen).length) next.add(draft.key);
      seen.push(draftRecord(draft));
    }
    setDrafts(rows);
    setSelected(
      !newFile && drafts.some((draft) => draft.name)
        ? new Set(
            rows
              .filter((draft) => draft.name && selected.has(draft.key))
              .map((draft) => draft.key),
          )
        : next,
    );
    setBatch(crypto.randomUUID());
    setCompleted(false);
    setNotice("");
    setError("");
    if (newFile) {
      setResearch({});
      setWebsites({});
      setChosenCompanies({});
      setEnrich(true);
      setLookupRevision((current) => current + 1);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    try {
      if (file.size > 4_000_000)
        throw new Error(
          "Choose a contact file under 4 MB, with up to 500 contacts.",
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encoding =
        bytes[0] === 255 && bytes[1] === 254
          ? "utf-16le"
          : bytes[0] === 254 && bytes[1] === 255
            ? "utf-16be"
            : "utf-8";
      const raw = new TextDecoder(encoding).decode(bytes);
      if (/\.vcf$|\.vcard$/i.test(file.name) || /^\s*BEGIN:VCARD/i.test(raw)) {
        setCsv(null);
        initialize(vcardContacts(raw, country));
      } else if (/\.csv$/i.test(file.name)) {
        const parsed = readCsv(raw),
          suggested = suggestCsvMapping(parsed.headers);
        setCsv(parsed);
        setMapping(suggested);
        initialize(csvContacts(parsed.rows, suggested, country));
      } else throw new Error("Choose a .vcf, .vcard, or .csv contact file.");
      setFileName(file.name);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const visibleImports = reviewed.filter(
    ({ draft, matches }) =>
      (filter !== "selected" || selected.has(draft.key)) &&
      (filter !== "new" || !matches.length) &&
      `${draft.name} ${draft.employer} ${draft.profile.emails?.map((e) => e.address).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const visibleExports = active.filter(
    (p) =>
      ((filter !== "person" && filter !== "org") || p.className === filter) &&
      p.title.toLowerCase().includes(query.toLowerCase()),
  );
  async function importSelected() {
    if (lock.current) return;
    lock.current = true;
    lookup.current?.abort();
    setLooking("");
    setBusy(true);
    setError("");
    try {
      const contacts = reviewed
        .filter(({ draft }) => selected.has(draft.key))
        .map(({ draft, matches }) => ({
          ...draft,
          allowDuplicate: matches.length > 0,
        }));
      const companies: ImportCompany[] = employers.map((company) => {
        const website = websites[company.key] ?? company.website;
        const data = research[`${company.key}|${website}`];
        return {
          name: company.name,
          existingId:
            chosenCompanies[company.key] ||
            (company.matches.length === 1 ? company.matches[0].id : undefined),
          profile: { website, ...data?.profile },
          photo: data?.photo,
          sources: data?.sources,
        };
      });
      const body = JSON.stringify({
        action: "import",
        contacts,
        companies,
        batch,
      });
      if (new Blob([body]).size > 3_800_000)
        throw new Error(
          "This selection is too large. Uncheck some contacts and import them in a second batch.",
        );
      const response = await fetch("/api/people/transfer", {
          method: "POST",
          headers: buildJsonHeadersWithCsrf(),
          body,
        }),
        payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      onChanged(payload.items);
      setCompleted(true);
      setNotice(
        `${payload.createdIds.length} profiles added, including new employers. ${payload.skipped} already imported or matching contacts skipped.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function undo() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/people/transfer", {
          method: "POST",
          headers: buildJsonHeadersWithCsrf(),
          body: JSON.stringify({ action: "undo", batch }),
        }),
        payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onChanged(payload.items);
      setNotice("Import undone. Those profiles are now in Recently Deleted.");
      setBatch("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function prepareExport() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setShareFile(null);
    try {
      const response = await fetch("/api/people/transfer", {
        method: "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({
          action: "export",
          ids: [...selected],
          options,
          format,
          pictures,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const blob = await response.blob(),
        file = new File([blob], `unigentamos-contacts.${format}`, {
          type: blob.type,
        });
      setShareFile(file);
      setNotice(
        "Your file is ready. Download it or use your device’s share menu.",
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function share() {
    if (!shareFile) return;
    try {
      await navigator.share({
        files: [shareFile],
        title: "Contacts from Unigentamos",
      });
    } catch (reason) {
      if ((reason as Error).name !== "AbortError")
        setError(
          "Sharing is unavailable here. Download the file and attach it to an email or message.",
        );
    }
  }
  useEffect(() => {
    setShareFile(null);
    setNotice("");
  }, [selected, options, format, pictures]);
  return (
    <fieldset
      className="people-transfer-workflow"
      disabled={busy || !ready}
      aria-label={mode === "import" ? "Contact import" : "Contact export"}
    >
      <header className="people-transfer-intro">
        <span>
          <UnigentamosIcon
            role={mode === "import" ? "import" : "export"}
            size={22}
          />
        </span>
        <div>
          <h3>
            {mode === "import"
              ? "Bring your people together"
              : "Share your people, your way"}
          </h3>
          <p>
            {mode === "import"
              ? "Choose a contact file, keep the people you want, and bring their employers along."
              : "Select people and organizations, choose what to include, then download or share."}
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="people-transfer-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="people-transfer-notice">
          {notice}
        </p>
      )}
      {mode === "import" ? (
        <>
          {!drafts.length ? (
            <div className="people-transfer-start">
              <div className="people-transfer-sources">
                {SOURCES.map((item, index) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={source === index}
                    onClick={() => setSource(index)}
                  >
                    <UnigentamosIcon role={item.icon} size={22} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              <p>{SOURCES[source].help}</p>
              <label className="people-transfer-file">
                Choose contact file
                <input
                  aria-label="Choose contact file"
                  type="file"
                  accept=".vcf,.vcard,.csv"
                  onChange={(event) => void upload(event.target.files?.[0])}
                />
                <small>vCard or CSV · up to 500 contacts / 4 MB</small>
              </label>
              <label className="people-transfer-country">
                Default country code
                <input
                  aria-label="Import default country code"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="+1"
                />
                <small>
                  Used for phone numbers without an international prefix.
                </small>
              </label>
            </div>
          ) : (
            <>
              <div className="people-transfer-file-bar">
                <span>
                  {fileName} · {drafts.length} contacts
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    lookup.current?.abort();
                    setDrafts([]);
                    setCsv(null);
                    setLooking("");
                    setCompleted(false);
                    setNotice("");
                  }}
                >
                  Choose another file
                </button>
              </div>
              {completed ? (
                <div className="people-transfer-complete">
                  <UnigentamosIcon role="check" size={32} />
                  <h3>Your contacts are in People</h3>
                  <p>
                    Employer links are ready. You can continue editing each
                    profile there.
                  </p>
                  {batch && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void undo()}
                    >
                      Undo this import
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {csv && (
                    <details className="people-transfer-mapping">
                      <summary>
                        Adjust columns{" "}
                        <small>Only if something looks wrong</small>
                      </summary>
                      <div>
                        {CSV_FIELDS.map((field) => (
                          <label key={field}>
                            {field.replace(/([A-Z])/g, " $1")}
                            <SelectField
                              value={mapping[field] || ""}
                              onChange={(event) => {
                                const next = {
                                  ...mapping,
                                  [field]: event.target.value,
                                };
                                setMapping(next);
                                initialize(
                                  csvContacts(csv.rows, next, country),
                                  false,
                                );
                              }}
                            >
                              <option value="">Not included</option>
                              {csv.headers.map((header) => (
                                <option key={header}>{header}</option>
                              ))}
                            </SelectField>
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                  <div className="people-transfer-toolbar">
                    <input
                      aria-label="Search import contacts"
                      placeholder="Search contacts or employers…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <SelectField
                      aria-label="Show import contacts"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All contacts</option>
                      <option value="new">New contacts</option>
                      <option value="selected">Selected</option>
                    </SelectField>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(
                          (current) =>
                            new Set([
                              ...current,
                              ...visibleImports
                                .filter(({ draft }) => draft.name)
                                .map(({ draft }) => draft.key),
                            ]),
                        )
                      }
                    >
                      Select shown
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                    >
                      Clear
                    </button>
                  </div>
                  <p className="people-transfer-hint">
                    {selected.size} selected · Existing matches start unchecked.
                    You can check them to add a separate profile.
                  </p>
                  <div
                    className="people-transfer-list"
                    aria-label="Import contacts"
                  >
                    {visibleImports.map(({ draft, matches }) => (
                      <article
                        key={draft.key}
                        className={selected.has(draft.key) ? "is-selected" : ""}
                      >
                        <label className="people-transfer-choice">
                          <input
                            type="checkbox"
                            aria-label={`Import ${draft.name || "unnamed contact"}`}
                            checked={selected.has(draft.key)}
                            disabled={!draft.name || busy}
                            onChange={() => toggle(draft.key)}
                          />
                          <span>
                            <strong>{draft.name || "Unnamed contact"}</strong>
                            <small>
                              {[draft.profile.primaryOccupation, draft.employer]
                                .filter(Boolean)
                                .join(" at ") ||
                                draft.profile.emails?.[0]?.address ||
                                draft.profile.phones?.[0]?.number ||
                                (draft.kind === "org"
                                  ? "Organization"
                                  : "Person")}
                            </small>
                          </span>
                          <em>{matches.length ? "Existing match" : "New"}</em>
                        </label>
                        <details>
                          <summary>
                            Details
                            {draft.warnings.length
                              ? ` · ${draft.warnings.length} to check`
                              : ""}
                          </summary>
                          <div className="people-transfer-contact-edit">
                            {(
                              [
                                ["name", "Name"],
                                ["employer", "Employer"],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key}>
                                {label}
                                <input
                                  aria-label={`${label} for ${draft.key}`}
                                  value={draft[key]}
                                  onChange={(e) =>
                                    setDrafts((current) =>
                                      current.map((d) =>
                                        d.key === draft.key
                                          ? { ...d, [key]: e.target.value }
                                          : d,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            ))}
                            <label>
                              Occupation
                              <input
                                value={draft.profile.primaryOccupation || ""}
                                onChange={(e) =>
                                  setDrafts((current) =>
                                    current.map((d) =>
                                      d.key === draft.key
                                        ? {
                                            ...d,
                                            profile: {
                                              ...d.profile,
                                              primaryOccupation: e.target.value,
                                            },
                                          }
                                        : d,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <label>
                              Type
                              <SelectField
                                value={draft.kind}
                                onChange={(e) =>
                                  setDrafts((current) =>
                                    current.map((d) =>
                                      d.key === draft.key
                                        ? {
                                            ...d,
                                            kind: e.target.value as
                                              | "person"
                                              | "org",
                                          }
                                        : d,
                                    ),
                                  )
                                }
                              >
                                <option value="person">Person</option>
                                <option value="org">Organization</option>
                              </SelectField>
                            </label>
                          </div>
                          {matches.map((match) => (
                            <p key={match.id}>
                              Matches{" "}
                              {active.find((p) => p.id === match.id)?.title ||
                                "another contact in this file"}
                              : {match.reasons.join(", ")}
                            </p>
                          ))}
                          {draft.warnings.map((warning, i) => (
                            <p key={i}>{warning}</p>
                          ))}
                          <p>
                            {draft.profile.emails
                              ?.map((e) => e.address)
                              .join(" · ")}
                          </p>
                          <p>
                            {draft.profile.phones
                              ?.map((p) => p.number)
                              .join(" · ")}
                          </p>
                          {Object.keys(draft.extra).length > 0 && (
                            <small>
                              {Object.keys(draft.extra).length} additional
                              source fields will be preserved privately.
                            </small>
                          )}
                        </details>
                      </article>
                    ))}
                  </div>
                  {employers.length > 0 && (
                    <details className="people-transfer-employers">
                      <summary>
                        {employers.length} employers · linked automatically
                      </summary>
                      <label className="people-transfer-toggle">
                        <input
                          type="checkbox"
                          checked={enrich}
                          onChange={(e) => {
                            setEnrich(e.target.checked);
                            setLooking("");
                          }}
                        />
                        Find public organization details
                      </label>
                      {employers.map((company) => {
                        const website =
                            websites[company.key] ?? company.website,
                          data = research[`${company.key}|${website}`];
                        return (
                          <article key={company.key}>
                            <strong>{company.name}</strong>
                            <small>
                              {company.matches.length === 1
                                ? "Link to existing organization"
                                : company.matches.length > 1
                                  ? "Choose an existing organization"
                                  : looking === company.name
                                    ? "Finding public details…"
                                    : data?.message || "New organization"}
                            </small>
                            {company.matches.length > 1 ? (
                              <SelectField
                                aria-label={`Existing organization for ${company.name}`}
                                value={chosenCompanies[company.key] || ""}
                                onChange={(e) =>
                                  setChosenCompanies((current) => ({
                                    ...current,
                                    [company.key]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Choose organization</option>
                                {company.matches.map((p) => (
                                  <option value={p.id} key={p.id}>
                                    {p.title} ·{" "}
                                    {p.profile?.website || p.id.slice(-6)}
                                  </option>
                                ))}
                              </SelectField>
                            ) : (
                              !company.matches.length && (
                                <input
                                  aria-label={`Website for ${company.name}`}
                                  placeholder="Add official website to improve autofill"
                                  defaultValue={website}
                                  onBlur={(e) =>
                                    setWebsites((current) => ({
                                      ...current,
                                      [company.key]: e.target.value,
                                    }))
                                  }
                                />
                              )
                            )}{" "}
                            {!company.matches.length && data && (
                              <button
                                type="button"
                                onClick={() => {
                                  setResearch((current) => {
                                    const next = { ...current };
                                    delete next[`${company.key}|${website}`];
                                    return next;
                                  });
                                  setEnrich(true);
                                  setLookupRevision((current) => current + 1);
                                }}
                              >
                                Retry public details
                              </button>
                            )}
                            {!!data?.sources.length && (
                              <details>
                                <summary>Public details and sources</summary>
                                <p>{data.profile.context}</p>
                                <p>
                                  {[
                                    data.profile.organizationType,
                                    data.profile.industry,
                                    data.profile.foundedYear,
                                    data.profile.headquarters,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                                {data.sources.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {new URL(url).hostname}
                                  </a>
                                ))}
                              </details>
                            )}
                          </article>
                        );
                      })}
                    </details>
                  )}
                  <footer className="people-transfer-footer">
                    <div>
                      <strong>{selected.size} contacts ready</strong>
                      <small>
                        {looking
                          ? `Finding ${looking}… Import now keeps the details already found.`
                          : "Only selected contacts and their new employers will be added."}
                      </small>
                    </div>
                    <button
                      className="is-primary"
                      type="button"
                      disabled={
                        busy ||
                        !selected.size ||
                        employers.some(
                          (c) =>
                            c.matches.length > 1 && !chosenCompanies[c.key],
                        )
                      }
                      onClick={() => void importSelected()}
                    >
                      {busy ? "Importing…" : `Import ${selected.size} contacts`}
                    </button>
                  </footer>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="people-transfer-toolbar">
            <input
              aria-label="Search export contacts"
              placeholder="Search people and organizations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <SelectField
              aria-label="Export profile type"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Everyone</option>
              <option value="person">People</option>
              <option value="org">Organizations</option>
            </SelectField>
            <button
              type="button"
              onClick={() =>
                setSelected(
                  (current) =>
                    new Set([...current, ...visibleExports.map((p) => p.id)]),
                )
              }
            >
              Select shown
            </button>
            <button type="button" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
          <div className="people-transfer-export-grid">
            <div className="people-transfer-list" aria-label="Export contacts">
              {visibleExports.map((person) => (
                <label
                  className={`people-transfer-choice ${selected.has(person.id) ? "is-selected" : ""}`}
                  key={person.id}
                >
                  <input
                    type="checkbox"
                    aria-label={`Export ${person.title}`}
                    checked={selected.has(person.id)}
                    onChange={() => toggle(person.id)}
                  />
                  <PeopleProfileAvatar
                    label={person.title}
                    initials={person.title.slice(0, 1)}
                    photoUrl={person.profile?.photoUrl}
                    compact
                  />
                  <span>
                    <strong>{person.title}</strong>
                    <small>
                      {person.className === "org"
                        ? "Organization"
                        : [
                            person.profile?.primaryOccupation,
                            person.profile?.primaryEmployer,
                          ]
                            .filter(Boolean)
                            .join(" at ") || "Person"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <aside className="people-transfer-inclusions">
              <h4>Include in your export</h4>
              <p>
                Contact details are included. Add private context only when you
                want to share it.
              </p>
              {(
                [
                  ["notes", "Notes and memories"],
                  ["dreams", "Life dreams"],
                  ["interactions", "Interaction history"],
                  ["objects", "Linked people and objects"],
                  ["extras", "Additional imported fields"],
                ] as const
              ).map(([key, label]) => (
                <label className="people-transfer-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(e) =>
                      setOptions((current) => ({
                        ...current,
                        [key]: e.target.checked,
                      }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <label className="people-transfer-toggle">
                <input
                  type="checkbox"
                  checked={pictures}
                  disabled={format === "csv"}
                  onChange={(e) => setPictures(e.target.checked)}
                />
                <span>
                  Pictures {format === "csv" && <small>(vCard / JSON)</small>}
                </span>
              </label>
              <label>
                Format
                <SelectField
                  aria-label="Export format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="vcf">vCard · Contacts apps</option>
                  <option value="csv">CSV · CRM / spreadsheets</option>
                  <option value="json">JSON · Complete selected data</option>
                </SelectField>
              </label>
              <small>
                vCard and CSV include extra fields as structured data; receiving
                apps may only use standard contact fields.
              </small>
            </aside>
          </div>
          <footer className="people-transfer-footer">
            <div>
              <strong>{selected.size} profiles selected</strong>
              <small>
                {selected.size > 500
                  ? "Choose up to 500 profiles per export."
                  : "One file, ready for your contacts app, CRM, email, or messages."}
              </small>
            </div>
            <button
              className="is-primary"
              type="button"
              disabled={busy || !selected.size || selected.size > 500}
              onClick={() => void prepareExport()}
            >
              {busy ? "Preparing…" : "Prepare export"}
            </button>
          </footer>
          {shareFile && (
            <div className="people-transfer-ready">
              <UnigentamosIcon role="check" size={24} />
              <span>
                {shareFile.name}
                <small>
                  {Math.ceil(shareFile.size / 1024)} KB · ready to share
                </small>
              </span>
              <button
                type="button"
                onClick={() => download(shareFile, shareFile.name)}
              >
                Download
              </button>
              {typeof navigator !== "undefined" &&
                navigator.canShare?.({ files: [shareFile] }) && (
                  <button type="button" onClick={() => void share()}>
                    Share…
                  </button>
                )}
              <small>
                For email or text, share through your device or attach the
                downloaded file.
              </small>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
