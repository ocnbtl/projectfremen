"use client";

import dynamic from "next/dynamic";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import type {
  BuildItemStatus,
  PersonalBuildItem,
  PersonalLifeCollection,
  PersonalLifeState,
  PersonalList,
  PersonalListCell,
  PersonalListColumnType,
  PersonalListRow,
  PersonalTrip,
  PersonalVehicle,
  TripStatus,
  VehicleModification,
  VehicleModificationStatus
} from "../../lib/modules/personal-life/types";
import type { PersonalOpsState } from "../../lib/modules/personal-ops/types";
import {
  normalizeCredentialWebsite,
  type CredentialDetail,
  type CredentialSummary
} from "../../lib/modules/personal-passwords/types";
import {
  PHONE_COUNTRY_FORMATS,
  canonicalCountryCode,
  formatInternationalPhone,
  normalizeCountryCodeInput,
  rebasePhoneCountryCode,
  validateInternationalPhone
} from "../../lib/modules/people/phone";
import PersonalOpsSidebar, { type PersonalOpsSidebarCounts } from "./PersonalOpsSidebar";
import PersonalOpsIcon from "./PersonalOpsIcon";
import baseStyles from "./PersonalOpsWorkspace.module.css";
import styles from "./PersonalLifeWorkspace.module.css";

const TravelWorldMap = dynamic(() => import("./TravelWorldMap"), {
  ssr: false,
  loading: () => <div className={styles.worldMapLoading}>Loading the world map…</div>
});

export type PersonalLifeView = "passwords" | "lists" | "travel" | "personal-build" | "car";

export type PersonalLifeLinkOption = {
  kind: "person" | "object";
  ref: NativeObjectRef;
};

type LifeEditor = {
  collection: PersonalLifeCollection;
  id?: string;
  values: Record<string, string>;
};

type CredentialDraft = {
  id?: string;
  updatedAt?: string;
  title: string;
  username: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  secret: string;
  pin: string;
  website: string;
  notes: string;
};

const VIEW_COPY: Record<PersonalLifeView, { title: string; description: string; action: string }> = {
  passwords: { title: "Passwords", description: "", action: "Password" },
  lists: { title: "Lists", description: "Flexible notebooks for things to buy, watch, pack, remember, or rank.", action: "New list" },
  travel: { title: "Travel", description: "A personal atlas of places lived, visited, planned, and wanted.", action: "Add trip" },
  "personal-build": { title: "Personal Build", description: "The long-term loadout you are deliberately assembling.", action: "Add item" },
  car: { title: "Car", description: "Current vehicle records and the build sheet for what comes next.", action: "Add vehicle" }
};

const TRIP_LABELS: Record<TripStatus, string> = { been: "Been", want: "Want to go", lived: "Lived", planned: "Planned" };
const BUILD_LABELS: Record<BuildItemStatus, string> = { wanted: "Wanted", researching: "Researching", acquired: "Acquired", retired: "Retired" };
const MOD_LABELS: Record<VehicleModificationStatus, string> = { idea: "Ideas", researching: "Researching", planned: "Planned", installed: "Installed", skipped: "Skipped" };
const LIST_COLUMN_LABELS: Record<PersonalListColumnType, string> = {
  text: "Text",
  date: "Date",
  price: "Price",
  place: "Place",
  time: "Time",
  rating: "Rating",
  person: "Person",
  object: "Object"
};

function linkKey(ref: NativeObjectRef) {
  return `${ref.module}:${ref.objectType}:${ref.objectId}`;
}

function formatDate(value?: string) {
  if (!value) return "No date";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function credentialWebsiteHref(value: string) {
  const website = normalizeCredentialWebsite(value);
  if (!website) return "";
  try {
    const parsed = new URL(website);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? website : "";
  } catch {
    return "";
  }
}

function credentialWebsiteDomain(value: string) {
  const href = credentialWebsiteHref(value);
  if (!href) return "Website unavailable";
  return new URL(href).hostname.replace(/^www\./i, "");
}

function countsFor(ops: PersonalOpsState, life: PersonalLifeState, passwords: number): PersonalOpsSidebarCounts {
  const core = [...ops.goals, ...ops.decisions, ...ops.obligations, ...ops.followUps];
  return {
    command: core.filter((item) => item.lifecycle !== "complete" && item.lifecycle !== "archived").length + ops.routines.filter((item) => item.lifecycle !== "archived").length,
    goals: ops.goals.length,
    decisions: ops.decisions.length,
    obligations: ops.obligations.length,
    followUps: ops.followUps.length,
    routines: ops.routines.length,
    captures: ops.captures.length,
    templates: ops.templates.length,
    archived: core.filter((item) => item.lifecycle === "archived").length,
    passwords,
    lists: life.lists.length,
    travel: life.trips.length,
    personalBuild: life.buildItems.length,
    car: life.vehicles.length
  };
}

function input(label: string, name: string, value: string, setValue: (value: string) => void, options?: { type?: string; required?: boolean; placeholder?: string }) {
  return <label><span>{label}</span><input name={name} type={options?.type || "text"} value={value} onChange={(event) => setValue(event.target.value)} required={options?.required} placeholder={options?.placeholder} /></label>;
}

export default function PersonalLifeWorkspace({
  initialView,
  initialState,
  personalOpsState,
  initialCredentials,
  initialLinkOptions,
  initialLoadError
}: {
  initialView: PersonalLifeView;
  initialState: PersonalLifeState;
  personalOpsState: PersonalOpsState;
  initialCredentials: CredentialSummary[];
  initialLinkOptions: PersonalLifeLinkOption[];
  initialLoadError?: string;
}) {
  const [state, setState] = useState(initialState);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editor, setEditor] = useState<LifeEditor | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(initialLoadError || "");
  const [selectedListId, setSelectedListId] = useState(initialState.lists[0]?.id || "");
  const [listDraft, setListDraft] = useState<PersonalList | null>(initialState.lists[0] || null);
  const [listColumnType, setListColumnType] = useState<PersonalListColumnType>("text");
  const [tripFilters, setTripFilters] = useState<Set<TripStatus>>(() => new Set(["been", "want", "lived", "planned"]));
  const [selectedTripId, setSelectedTripId] = useState(initialState.trips[0]?.id || "");
  const [selectedVehicleId, setSelectedVehicleId] = useState(initialState.vehicles[0]?.id || "");
  const [modDraft, setModDraft] = useState("");
  const [modStatus, setModStatus] = useState<VehicleModificationStatus>("idea");
  const [credentials, setCredentials] = useState<CredentialSummary[]>(initialCredentials);
  const [credentialSecrets, setCredentialSecrets] = useState<Record<string, { secret: string; pin: string }>>({});
  const [passwordsMasked, setPasswordsMasked] = useState(true);
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft | null>(null);
  const [passwordFieldVisible, setPasswordFieldVisible] = useState(false);
  const [pinFieldVisible, setPinFieldVisible] = useState(false);
  const [expandedWebsiteId, setExpandedWebsiteId] = useState("");
  const websiteRevealTimerRef = useRef<number | null>(null);
  const copy = VIEW_COPY[initialView];

  useEffect(() => () => {
    if (websiteRevealTimerRef.current !== null) window.clearTimeout(websiteRevealTimerRef.current);
  }, []);

  async function requestCredentials(url = "/api/personal/passwords") {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; items?: CredentialSummary[] | CredentialDetail[]; item?: CredentialDetail; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Encrypted credentials could not be loaded.");
    return payload;
  }

  async function revealCredential(id: string): Promise<CredentialDetail> {
    const payload = await requestCredentials(`/api/personal/passwords?id=${encodeURIComponent(id)}`);
    if (!payload.item) throw new Error("Credential not found.");
    return payload.item;
  }

  async function togglePasswordPrivacy() {
    setError("");
    if (!passwordsMasked) {
      setPasswordsMasked(true);
      setCredentialSecrets({});
      return;
    }
    setBusy(true);
    try {
      const payload = await requestCredentials("/api/personal/passwords?includeSecrets=true");
      const details = (payload.items || []) as CredentialDetail[];
      setCredentials(details.map(({ secret: _secret, pin: _pin, ...summary }) => summary));
      setCredentialSecrets(Object.fromEntries(details.map((item) => [item.id, { secret: item.secret, pin: item.pin }])));
      setPasswordsMasked(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passwords could not be revealed.");
    } finally {
      setBusy(false);
    }
  }

  const sidebarCounts = countsFor(personalOpsState, state, credentials.length);
  const selectedList = state.lists.find((item) => item.id === selectedListId) || state.lists[0] || null;
  const workingList = listDraft?.id === selectedList?.id ? listDraft : selectedList;
  const selectedTrip = state.trips.find((item) => item.id === selectedTripId) || null;
  const selectedVehicle = state.vehicles.find((item) => item.id === selectedVehicleId) || state.vehicles[0] || null;

  function replaceObject(collection: PersonalLifeCollection, item: PersonalList | PersonalTrip | PersonalBuildItem | PersonalVehicle) {
    setState((current) => {
      if (collection === "lists") return { ...current, lists: current.lists.some((candidate) => candidate.id === item.id) ? current.lists.map((candidate) => candidate.id === item.id ? item as PersonalList : candidate) : [item as PersonalList, ...current.lists] };
      if (collection === "trips") return { ...current, trips: current.trips.some((candidate) => candidate.id === item.id) ? current.trips.map((candidate) => candidate.id === item.id ? item as PersonalTrip : candidate) : [item as PersonalTrip, ...current.trips] };
      if (collection === "buildItems") return { ...current, buildItems: current.buildItems.some((candidate) => candidate.id === item.id) ? current.buildItems.map((candidate) => candidate.id === item.id ? item as PersonalBuildItem : candidate) : [item as PersonalBuildItem, ...current.buildItems] };
      return { ...current, vehicles: current.vehicles.some((candidate) => candidate.id === item.id) ? current.vehicles.map((candidate) => candidate.id === item.id ? item as PersonalVehicle : candidate) : [item as PersonalVehicle, ...current.vehicles] };
    });
  }

  async function saveObject(collection: PersonalLifeCollection, values: Record<string, unknown>, existing?: PersonalList | PersonalTrip | PersonalBuildItem | PersonalVehicle) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/personal/life", {
      method: existing ? "PATCH" : "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify(existing
        ? { collection, id: existing.id, expectedUpdatedAt: existing.updatedAt, patch: values }
        : { collection, input: values })
    });
    const payload = await response.json() as { ok?: boolean; item?: PersonalList | PersonalTrip | PersonalBuildItem | PersonalVehicle; error?: string };
    setBusy(false);
    if (!response.ok || !payload.ok || !payload.item) {
      setError(payload.error || "The record could not be saved.");
      return null;
    }
    replaceObject(collection, payload.item);
    setNotice(existing ? "Changes saved." : "Added to Personal Ops.");
    return payload.item;
  }

  async function removeObject(collection: PersonalLifeCollection, item: PersonalList | PersonalTrip | PersonalBuildItem | PersonalVehicle) {
    if (!window.confirm(`Delete “${"title" in item ? item.title : item.name}”? This removes this Personal Ops record.`)) return;
    setBusy(true);
    const response = await fetch("/api/personal/life", { method: "DELETE", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ collection, id: item.id, expectedUpdatedAt: item.updatedAt }) });
    const payload = await response.json() as { ok?: boolean; error?: string };
    setBusy(false);
    if (!response.ok || !payload.ok) return setError(payload.error || "The record could not be deleted.");
    setState((current) => ({
      ...current,
      lists: collection === "lists" ? current.lists.filter((candidate) => candidate.id !== item.id) : current.lists,
      trips: collection === "trips" ? current.trips.filter((candidate) => candidate.id !== item.id) : current.trips,
      buildItems: collection === "buildItems" ? current.buildItems.filter((candidate) => candidate.id !== item.id) : current.buildItems,
      vehicles: collection === "vehicles" ? current.vehicles.filter((candidate) => candidate.id !== item.id) : current.vehicles
    }));
    setNotice("Record deleted.");
  }

  function openCreate(preset: Record<string, string> = {}) {
    if (initialView === "passwords") {
      setCredentialDraft({ title: "", username: "", email: "", phone: "", phoneCountryCode: "+1", secret: "", pin: "", website: "", notes: "" });
      setPasswordFieldVisible(false);
      setPinFieldVisible(false);
      return;
    }
    if (initialView === "lists") setEditor({ collection: "lists", values: { title: "", description: "", kind: "custom", ...preset } });
    if (initialView === "travel") setEditor({ collection: "trips", values: { name: "", place: "", region: "", status: "want", travelMode: "plane", latitude: "0", longitude: "0", startDate: "", endDate: "", notes: "", ...preset } });
    if (initialView === "personal-build") setEditor({ collection: "buildItems", values: { name: "", category: "", status: "wanted", targetDate: "", budget: "", notes: "", ...preset } });
    if (initialView === "car") setEditor({ collection: "vehicles", values: { name: "", year: "", make: "", model: "", trim: "", status: "future", vinNote: "", notes: "", ...preset } });
  }

  function openEdit(collection: PersonalLifeCollection, item: PersonalList | PersonalTrip | PersonalBuildItem | PersonalVehicle) {
    if (collection === "lists") {
      const value = item as PersonalList;
      setEditor({ collection, id: value.id, values: { title: value.title, description: value.description, kind: value.kind } });
    } else if (collection === "trips") {
      const value = item as PersonalTrip;
      setEditor({ collection, id: value.id, values: { name: value.name, place: value.place, region: value.region, status: value.status, travelMode: value.travelMode, latitude: String(value.latitude), longitude: String(value.longitude), startDate: value.startDate, endDate: value.endDate, notes: value.notes } });
    } else if (collection === "buildItems") {
      const value = item as PersonalBuildItem;
      setEditor({ collection, id: value.id, values: { name: value.name, category: value.category, status: value.status, targetDate: value.targetDate, budget: value.budget, notes: value.notes } });
    } else {
      const value = item as PersonalVehicle;
      setEditor({ collection, id: value.id, values: { name: value.name, year: value.year, make: value.make, model: value.model, trim: value.trim, status: value.status, vinNote: value.vinNote, notes: value.notes } });
    }
  }

  function editorValue(name: string) { return editor?.values[name] || ""; }
  function setEditorValue(name: string, value: string) { setEditor((current) => current ? { ...current, values: { ...current.values, [name]: value } } : current); }

  async function submitEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const existing = editor.id ? state[editor.collection].find((item) => item.id === editor.id) : undefined;
    const values: Record<string, unknown> = { ...editor.values };
    if (editor.collection === "lists") {
      const list = existing as PersonalList | undefined;
      values.items = list?.items || [];
      values.columns = list?.columns || [{ id: crypto.randomUUID(), label: "Item", type: "text" }];
      values.rows = list?.rows || [];
    }
    if (editor.collection === "trips") {
      values.latitude = Number(editor.values.latitude);
      values.longitude = Number(editor.values.longitude);
    }
    if (editor.collection === "vehicles") values.modifications = (existing as PersonalVehicle | undefined)?.modifications || [];
    const saved = await saveObject(editor.collection, values, existing);
    if (!saved) return;
    if (editor.collection === "lists") {
      setSelectedListId(saved.id);
      setListDraft(saved as PersonalList);
    }
    if (editor.collection === "trips") setSelectedTripId(saved.id);
    if (editor.collection === "vehicles") setSelectedVehicleId(saved.id);
    setEditor(null);
  }

  async function saveCredential(event: FormEvent) {
    event.preventDefault();
    if (!credentialDraft || !credentialDraft.title.trim() || !credentialDraft.secret) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/personal/passwords", {
        method: credentialDraft.id ? "PATCH" : "POST",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify(credentialDraft.id
          ? {
              id: credentialDraft.id,
              expectedUpdatedAt: credentialDraft.updatedAt,
              input: credentialDraft
            }
          : { input: credentialDraft })
      });
      const payload = await response.json() as { ok?: boolean; item?: CredentialSummary; error?: string };
      if (!response.ok || !payload.ok || !payload.item) {
        throw new Error(payload.error || "The credential could not be saved.");
      }
      setCredentials((current) => current.some((item) => item.id === payload.item?.id)
        ? current.map((item) => item.id === payload.item?.id ? payload.item! : item)
        : [...current, payload.item!].sort((left, right) => left.title.localeCompare(right.title)));
      setCredentialSecrets({});
      setPasswordsMasked(true);
      setCredentialDraft(null);
      setNotice("Credential encrypted and saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The credential could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function editCredential(item: CredentialSummary) {
    expandCredentialWebsite(item.id);
    setBusy(true);
    setError("");
    try {
      const detail = await revealCredential(item.id);
      setCredentialDraft(detail);
      setPasswordFieldVisible(false);
      setPinFieldVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The credential could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCredential(item: CredentialSummary) {
    setError("");
    try {
      const detail = await revealCredential(item.id);
      await navigator.clipboard.writeText(detail.secret);
      setNotice("Password copied.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be copied.");
    }
  }

  function expandCredentialWebsite(id: string) {
    if (websiteRevealTimerRef.current !== null) window.clearTimeout(websiteRevealTimerRef.current);
    setExpandedWebsiteId(id);
    websiteRevealTimerRef.current = window.setTimeout(() => {
      setExpandedWebsiteId((current) => current === id ? "" : current);
      websiteRevealTimerRef.current = null;
    }, 3200);
  }

  async function copyCredentialWebsite(item: CredentialSummary) {
    const href = credentialWebsiteHref(item.website);
    if (!href) return;
    setError("");
    try {
      await navigator.clipboard.writeText(href);
      expandCredentialWebsite(item.id);
      setNotice("Website copied.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website could not be copied.");
    }
  }

  async function deleteCredential(item: CredentialSummary) {
    if (!window.confirm(`Delete “${item.title || "credential"}”? This removes the encrypted record.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/personal/passwords", {
        method: "DELETE",
        headers: buildJsonHeadersWithCsrf(),
        body: JSON.stringify({ id: item.id, expectedUpdatedAt: item.updatedAt })
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The credential could not be deleted.");
      setCredentials((current) => current.filter((candidate) => candidate.id !== item.id));
      setExpandedWebsiteId((current) => current === item.id ? "" : current);
      setCredentialSecrets((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setNotice("Credential deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The credential could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  function selectList(list: PersonalList) {
    setSelectedListId(list.id);
    setListDraft(list);
  }

  function updateListDraft(update: (current: PersonalList) => PersonalList) {
    setListDraft((current) => current ? update(current) : current);
  }

  function updateListCell(rowId: string, columnId: string, cell: PersonalListCell) {
    updateListDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => row.id === rowId
        ? { ...row, cells: { ...row.cells, [columnId]: cell } }
        : row)
    }));
  }

  function addListColumn() {
    const id = crypto.randomUUID();
    const column = { id, label: LIST_COLUMN_LABELS[listColumnType], type: listColumnType };
    updateListDraft((current) => ({
      ...current,
      columns: [...current.columns, column],
      rows: current.rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: { value: "" } } }))
    }));
  }

  function addListRow() {
    updateListDraft((current) => ({
      ...current,
      rows: [
        ...current.rows,
        {
          id: crypto.randomUUID(),
          completed: false,
          cells: Object.fromEntries(current.columns.map((column) => [column.id, { value: "" }]))
        }
      ]
    }));
  }

  async function saveListDraft() {
    if (!workingList || !selectedList) return;
    const saved = await saveObject("lists", {
      title: workingList.title,
      description: workingList.description,
      kind: workingList.kind,
      items: workingList.items,
      columns: workingList.columns,
      rows: workingList.rows
    }, selectedList);
    if (saved) setListDraft(saved as PersonalList);
  }

  async function addModification(vehicle: PersonalVehicle) {
    if (!modDraft.trim()) return;
    const modification: VehicleModification = { id: crypto.randomUUID(), name: modDraft.trim(), category: "", status: modStatus, estimate: "", notes: "" };
    const saved = await saveObject("vehicles", { modifications: [...vehicle.modifications, modification] }, vehicle);
    if (saved) setModDraft("");
  }

  function renderListCell(row: PersonalListRow, columnId: string, type: PersonalListColumnType, label: string) {
    const cell = row.cells[columnId] || { value: "" };
    if (type === "rating") {
      const rating = Number(cell.value) || 0;
      return <div className={styles.ratingInput} aria-label={`${label} rating`}>{[1, 2, 3, 4, 5].map((value) => <button type="button" aria-label={`Set ${label} to ${value} stars`} aria-pressed={rating === value} data-active={value <= rating || undefined} onClick={() => updateListCell(row.id, columnId, { value: String(value) })} key={value}>★</button>)}</div>;
    }
    if (type === "person" || type === "object") {
      const options = initialLinkOptions.filter((option) => option.kind === type);
      const selectedKey = cell.ref ? linkKey(cell.ref) : "";
      return <div className={styles.linkCell}>
        <PersonalOpsIcon name={type} />
        <select aria-label={label} value={selectedKey} onChange={(event) => {
          const option = options.find((candidate) => linkKey(candidate.ref) === event.target.value);
          updateListCell(row.id, columnId, option ? { value: option.ref.label, ref: option.ref } : { value: "" });
        }}>
          <option value="">Choose {type === "person" ? "a person" : "an object"}</option>
          {cell.ref && !options.some((option) => linkKey(option.ref) === selectedKey) && <option value={selectedKey}>{cell.ref.label}</option>}
          {options.map((option) => <option value={linkKey(option.ref)} key={linkKey(option.ref)}>{option.ref.label}</option>)}
        </select>
        {cell.ref && <a href={cell.ref.route} aria-label={`Open ${cell.ref.label}`} title={`Open ${cell.ref.label}`}><PersonalOpsIcon name="open" /></a>}
      </div>;
    }
    return <input
      aria-label={label}
      type={type === "date" || type === "time" ? type : "text"}
      inputMode={type === "price" ? "decimal" : undefined}
      placeholder={type === "price" ? "$0.00" : type === "place" ? "Add place…" : ""}
      value={cell.value}
      onChange={(event) => updateListCell(row.id, columnId, { value: event.target.value })}
    />;
  }

  function renderPasswords() {
    return (
      <section className={styles.keyring} data-masked={passwordsMasked || undefined} aria-label="Encrypted password keyring">
        <header className={styles.keyringHeader}>
          <strong>Encrypted credentials</strong>
          <span className={styles.keyringCount}>{credentials.length}</span>
        </header>
        <div className={styles.credentialLedger} role="table" aria-label="Credentials">
          <div className={styles.credentialGridHeader} role="row">
            <span className={styles.credentialAccountHeading} role="columnheader">Account</span>
            <span role="columnheader" aria-label="Username" title="Username"><PersonalOpsIcon name="username" /></span>
            <span role="columnheader" aria-label="Email" title="Email"><PersonalOpsIcon name="email" /></span>
            <span role="columnheader" aria-label="Phone" title="Phone"><PersonalOpsIcon name="phone" /></span>
            <span role="columnheader" aria-label="Password" title="Password"><PersonalOpsIcon name="password" /></span>
            <span role="columnheader" aria-label="PIN" title="PIN"><PersonalOpsIcon name="pin" /></span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          <div className={styles.credentialList} role="rowgroup">
            {credentials.length ? credentials.map((item) => (
            <article className={styles.credentialRow} role="row" data-website-expanded={expandedWebsiteId === item.id || undefined} key={item.id}>
              <div className={`${styles.credentialIdentity} ${styles.credentialPrivate}`} role="cell">
                <button
                  type="button"
                  className={styles.credentialLinkTrigger}
                  aria-label={item.website ? `Copy and reveal website for ${item.title}` : `No website for ${item.title}`}
                  title={item.website ? "Copy and reveal website" : "No website added"}
                  aria-expanded={item.website ? expandedWebsiteId === item.id : undefined}
                  onClick={() => void copyCredentialWebsite(item)}
                  disabled={!item.website}
                ><PersonalOpsIcon name="link" /></button>
                <span className={styles.credentialIdentityText}>
                  <strong>{item.title || "Untitled credential"}</strong>
                  {item.website && <span className={styles.credentialWebsiteReveal} id={`credential-website-${item.id}`}>
                    <span>{credentialWebsiteDomain(item.website)}</span>
                    <a href={credentialWebsiteHref(item.website)} target="_blank" rel="noreferrer" aria-label={`Open website for ${item.title}`} title="Open website"><PersonalOpsIcon name="open" /></a>
                  </span>}
                </span>
              </div>
              <span className={`${styles.credentialCell} ${styles.credentialPrivate}`} role="cell" data-field="username" data-label="Username">{item.username}</span>
              <span className={`${styles.credentialCell} ${styles.credentialPrivate}`} role="cell" data-field="email" data-label="Email">{item.email}</span>
              <span className={`${styles.credentialCell} ${styles.credentialPrivate}`} role="cell" data-field="phone" data-label="Phone">{item.phone}</span>
              <code className={styles.credentialPrivate} role="cell" data-field="password" data-label="Password" aria-label={passwordsMasked ? "Hidden password" : "Revealed password"}>{passwordsMasked ? "••••••••" : credentialSecrets[item.id]?.secret || ""}</code>
              <code className={styles.credentialPrivate} role="cell" data-field="pin" data-label="PIN" aria-label={!item.hasPin ? "No PIN" : passwordsMasked ? "Hidden PIN" : "Revealed PIN"}>{item.hasPin ? passwordsMasked ? "••••" : credentialSecrets[item.id]?.pin || "" : ""}</code>
              <div className={styles.iconActions} role="cell" aria-label={`${item.title} actions`}>
                <button type="button" aria-label={`Copy password for ${item.title}`} title="Copy password" onClick={() => void copyCredential(item)}><PersonalOpsIcon name="copy" /></button>
                <button type="button" aria-label={`Edit ${item.title}`} title="Edit" onClick={() => void editCredential(item)}><PersonalOpsIcon name="edit" /></button>
                <button type="button" className={styles.dangerAction} aria-label={`Delete ${item.title}`} title="Delete" onClick={() => void deleteCredential(item)}><PersonalOpsIcon name="delete" /></button>
              </div>
            </article>
            )) : <div className={styles.empty}><strong>No passwords yet</strong><span>Add a credential when you are ready.</span></div>}
          </div>
        </div>
      </section>
    );
  }

  function renderLists() {
    return <div className={styles.notebook}>
      <aside className={styles.listIndex} aria-label="Lists">
        {state.lists.map((list) => <button type="button" data-active={selectedList?.id === list.id || undefined} onClick={() => selectList(list)} key={list.id}><span>{list.title}</span><small>{list.rows.filter((row) => row.completed).length}/{list.rows.length}</small></button>)}
        {!state.lists.length && <p>No lists yet.</p>}
      </aside>
      <section className={styles.listPage}>
        {workingList && selectedList ? <>
          <header className={styles.listEditorHeader}>
            <div className={styles.listIdentityEditor}>
              <select aria-label="List type" value={workingList.kind} onChange={(event) => updateListDraft((current) => ({ ...current, kind: event.target.value as PersonalList["kind"] }))}><option value="shopping">Things to buy</option><option value="watchlist">Watchlist</option><option value="favorites">Favorites</option><option value="packing">Packing</option><option value="custom">Custom</option></select>
              <input aria-label="List title" value={workingList.title} onChange={(event) => updateListDraft((current) => ({ ...current, title: event.target.value }))} />
              <input aria-label="List description" value={workingList.description} onChange={(event) => updateListDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Add a short description…" />
            </div>
            <div className={styles.listHeaderActions}>
              <button type="button" className={styles.primaryButton} disabled={busy || !workingList.title.trim()} onClick={() => void saveListDraft()}>{busy ? "Saving…" : "Save list"}</button>
              <button type="button" className={styles.squareAction} aria-label={`Delete ${workingList.title}`} title="Delete list" onClick={() => { setListDraft(null); void removeObject("lists", selectedList); }}><PersonalOpsIcon name="delete" /></button>
            </div>
          </header>
          <div className={styles.listTableScroller}>
            <table className={styles.listTable}>
              <thead><tr><th className={styles.completeColumn}><span className={styles.visuallyHidden}>Complete</span></th>{workingList.columns.map((column) => <th key={column.id}><div className={styles.columnHeading}><input aria-label={`${column.label} column name`} value={column.label} onChange={(event) => updateListDraft((current) => ({ ...current, columns: current.columns.map((candidate) => candidate.id === column.id ? { ...candidate, label: event.target.value } : candidate) }))} /><span>{LIST_COLUMN_LABELS[column.type]}</span>{workingList.columns.length > 1 && <button type="button" aria-label={`Remove ${column.label} column`} title="Remove column" onClick={() => updateListDraft((current) => ({ ...current, columns: current.columns.filter((candidate) => candidate.id !== column.id), rows: current.rows.map((row) => { const cells = { ...row.cells }; delete cells[column.id]; return { ...row, cells }; }) }))}><PersonalOpsIcon name="delete" /></button>}</div></th>)}<th className={styles.rowActionColumn}><span className={styles.visuallyHidden}>Row actions</span></th></tr></thead>
              <tbody>{workingList.rows.map((row, rowIndex) => <tr data-complete={row.completed || undefined} key={row.id}>
                <td className={styles.completeColumn}><button type="button" className={styles.checkmark} aria-label={row.completed ? `Reopen row ${rowIndex + 1}` : `Complete row ${rowIndex + 1}`} onClick={() => updateListDraft((current) => ({ ...current, rows: current.rows.map((candidate) => candidate.id === row.id ? { ...candidate, completed: !candidate.completed } : candidate) }))}>{row.completed && <PersonalOpsIcon name="check" />}</button></td>
                {workingList.columns.map((column) => <td key={column.id}>{renderListCell(row, column.id, column.type, column.label)}</td>)}
                <td className={styles.rowActionColumn}><button type="button" className={styles.squareAction} aria-label={`Delete row ${rowIndex + 1}`} title="Delete row" onClick={() => updateListDraft((current) => ({ ...current, rows: current.rows.filter((candidate) => candidate.id !== row.id) }))}><PersonalOpsIcon name="delete" /></button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className={styles.listComposer}>
            <button type="button" onClick={addListRow}>+ Add item</button>
            <div><select aria-label="New column type" value={listColumnType} onChange={(event) => setListColumnType(event.target.value as PersonalListColumnType)}>{Object.entries(LIST_COLUMN_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button type="button" onClick={addListColumn}><PersonalOpsIcon name="add-column" />Add column</button></div>
          </div>
        </> : <div className={styles.empty}><strong>Start a list</strong><span>Create a focused notebook for anything you want to track.</span></div>}
      </section>
    </div>;
  }

  function renderTravel() {
    const visibleTrips = state.trips.filter((trip) => tripFilters.has(trip.status));
    return <div className={styles.atlas}>
      <section className={styles.mapPanel}>
        <div className={styles.mapToolbar} aria-label="Travel map layers">{(Object.keys(TRIP_LABELS) as TripStatus[]).map((status) => <button type="button" data-status={status} data-active={tripFilters.has(status) || undefined} aria-pressed={tripFilters.has(status)} onClick={() => setTripFilters((current) => { const next = new Set(current); if (next.has(status)) next.delete(status); else next.add(status); return next; })} key={status}><span />{TRIP_LABELS[status]}</button>)}</div>
        <TravelWorldMap
          trips={visibleTrips}
          selectedTripId={selectedTripId}
          labels={TRIP_LABELS}
          onSelectTrip={setSelectedTripId}
          onCreateAt={(latitude, longitude) => openCreate({ latitude: String(latitude), longitude: String(longitude) })}
        />
      </section>
      <section className={styles.tripLedger}>
        <header><h2>Trip ledger</h2><span>{visibleTrips.length} shown</span></header>
        <div>{visibleTrips.map((trip) => <article data-selected={selectedTrip?.id === trip.id || undefined} key={trip.id} onClick={() => setSelectedTripId(trip.id)}><span className={styles.tripStatus} data-status={trip.status}>{TRIP_LABELS[trip.status]}</span><strong>{trip.name}</strong><p>{trip.place}{trip.region ? ` · ${trip.region}` : ""}</p><small>{trip.travelMode} · {trip.startDate ? formatDate(trip.startDate) : "Date open"}</small><div className={styles.rowActions}><button type="button" onClick={(event) => { event.stopPropagation(); openEdit("trips", trip); }}>Edit</button><button type="button" onClick={(event) => { event.stopPropagation(); void removeObject("trips", trip); }}>Delete</button></div></article>)}</div>
      </section>
    </div>;
  }

  function renderBuild() {
    const lanes = (["wanted", "researching", "acquired"] as BuildItemStatus[]);
    return <div className={styles.loadout}>
      <header className={styles.loadoutHeader}><span>LOADOUT / 01</span><strong>{state.buildItems.filter((item) => item.status === "acquired").length}</strong><p>pieces acquired</p></header>
      <div className={styles.loadoutLanes}>{lanes.map((status) => <section key={status}><header><h2>{BUILD_LABELS[status]}</h2><span>{state.buildItems.filter((item) => item.status === status).length}</span></header><div>{state.buildItems.filter((item) => item.status === status).map((item) => <article key={item.id}><span>{item.category || "Unsorted"}</span><strong>{item.name}</strong>{item.notes && <p>{item.notes}</p>}<small>{item.targetDate ? formatDate(item.targetDate) : "No target"}{item.budget ? ` · ${item.budget}` : ""}</small><div className={styles.rowActions}><button type="button" onClick={() => openEdit("buildItems", item)}>Edit</button><button type="button" onClick={() => void removeObject("buildItems", item)}>Delete</button></div></article>)}</div></section>)}</div>
      {state.buildItems.some((item) => item.status === "retired") && <p className={styles.retiredNote}>{state.buildItems.filter((item) => item.status === "retired").length} retired item(s) remain in the record.</p>}
    </div>;
  }

  function renderCar() {
    const modLanes = (["idea", "researching", "planned", "installed"] as VehicleModificationStatus[]);
    return <div className={styles.garage}>
      <nav className={styles.vehicleTabs} aria-label="Vehicles">{state.vehicles.map((vehicle) => <button type="button" data-active={selectedVehicle?.id === vehicle.id || undefined} onClick={() => setSelectedVehicleId(vehicle.id)} key={vehicle.id}><span>{vehicle.status}</span><strong>{vehicle.name}</strong></button>)}</nav>
      {selectedVehicle ? <>
        <header className={styles.vehicleHero}><div><span>{selectedVehicle.status} vehicle</span><h2>{selectedVehicle.name}</h2><p>{[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model, selectedVehicle.trim].filter(Boolean).join(" ") || "Build profile"}</p></div><div className={styles.rowActions}><button type="button" onClick={() => openEdit("vehicles", selectedVehicle)}>Edit vehicle</button><button type="button" onClick={() => void removeObject("vehicles", selectedVehicle)}>Delete</button></div></header>
        <div className={styles.modComposer}><input value={modDraft} onChange={(event) => setModDraft(event.target.value)} placeholder="Add modification…" aria-label="Modification name" /><select aria-label="Modification status" value={modStatus} onChange={(event) => setModStatus(event.target.value as VehicleModificationStatus)}>{modLanes.map((status) => <option value={status} key={status}>{MOD_LABELS[status]}</option>)}</select><button type="button" onClick={() => void addModification(selectedVehicle)}>Add</button></div>
        <div className={styles.modLanes}>{modLanes.map((status) => <section key={status}><header><h3>{MOD_LABELS[status]}</h3><span>{selectedVehicle.modifications.filter((item) => item.status === status).length}</span></header>{selectedVehicle.modifications.filter((item) => item.status === status).map((mod) => <article key={mod.id}><strong>{mod.name}</strong>{mod.category && <small>{mod.category}</small>}<button type="button" aria-label={`Delete ${mod.name}`} onClick={() => void saveObject("vehicles", { modifications: selectedVehicle.modifications.filter((item) => item.id !== mod.id) }, selectedVehicle)}>×</button></article>)}</section>)}</div>
      </> : <div className={styles.empty}><strong>No vehicle profile yet</strong><span>Add a current car or start the build sheet for a future one.</span></div>}
    </div>;
  }

  const tripEditorStatus = (editor?.collection === "trips" ? editorValue("status") : "want") as TripStatus;
  const tripEditorTitle = editor?.id
    ? `Edit ${TRIP_LABELS[tripEditorStatus].toLowerCase()} record`
    : tripEditorStatus === "been"
      ? "Add a place you’ve been"
      : tripEditorStatus === "lived"
        ? "Add a place you lived"
        : tripEditorStatus === "planned"
          ? "Plan a trip"
          : "Add somewhere you want to go";

  const credentialPhoneError = credentialDraft?.phone.trim()
    ? canonicalCountryCode(credentialDraft.phoneCountryCode, "")
      ? validateInternationalPhone(credentialDraft.phone, credentialDraft.phoneCountryCode)
      : "Add a country code before saving this phone number."
    : null;

  function closeCredentialEditor() {
    setCredentialDraft(null);
    setPasswordFieldVisible(false);
    setPinFieldVisible(false);
  }

  return <div className={baseStyles.shell}>
    <PersonalOpsSidebar activeView={initialView} filter="" pathname={`/admin/personal/${initialView}`} counts={sidebarCounts} mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
    <main className={baseStyles.directory}>
      <div className={baseStyles.mobileToolbar}><button type="button" onClick={() => setMobileSidebarOpen(true)} aria-expanded={mobileSidebarOpen}>☰ Personal Ops</button><button type="button" className={initialView === "passwords" ? styles.mobileAddAction : undefined} onClick={() => openCreate()}>{initialView === "passwords" ? <><PersonalOpsIcon name="plus" /><span>{copy.action}</span></> : <>+ {copy.action}</>}</button></div>
      <div className={styles.scroll}>
        <header className={styles.pageHeader}><div>{initialView !== "passwords" && <span>Personal Ops / Command</span>}<h1>{copy.title}</h1>{copy.description && <p>{copy.description}</p>}</div><div className={styles.headerActions}>{initialView === "passwords" && <button type="button" className={styles.privacyToggle} aria-label={passwordsMasked ? "Unblur password page" : "Blur password page"} aria-pressed={!passwordsMasked} onClick={() => void togglePasswordPrivacy()} disabled={busy} title={passwordsMasked ? "Unblur page" : "Blur page"}>{passwordsMasked ? <PersonalOpsIcon name="show" /> : <PersonalOpsIcon name="hide" />}<span>{passwordsMasked ? "Unblur" : "Blur"}</span></button>}<button type="button" className={`${styles.primaryButton} ${initialView === "passwords" ? styles.addAction : ""}`} onClick={() => openCreate()}>{initialView === "passwords" ? <><PersonalOpsIcon name="plus" /><span>{copy.action}</span></> : <>+ {copy.action}</>}</button></div></header>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <div className={styles.notice} role="status"><span>{notice}</span><button type="button" aria-label="Dismiss notification" title="Dismiss" onClick={() => setNotice("")}><PersonalOpsIcon name="close" /></button></div>}
        <div className={styles.workspace} data-view={initialView}>
          {initialView === "passwords" && renderPasswords()}
          {initialView === "lists" && renderLists()}
          {initialView === "travel" && renderTravel()}
          {initialView === "personal-build" && renderBuild()}
          {initialView === "car" && renderCar()}
        </div>
      </div>
    </main>

    {credentialDraft && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCredentialEditor(); }}>
      <form className={styles.editor} data-credential-editor onSubmit={saveCredential}>
        <header>
          <div><h2>{credentialDraft.id ? "Edit password" : "Add password"}</h2></div>
          <button type="button" className={styles.editorClose} aria-label="Close password editor" title="Close" onClick={closeCredentialEditor}><PersonalOpsIcon name="close" /></button>
        </header>
        {input("Account", "title", credentialDraft.title, (value) => setCredentialDraft((current) => current ? { ...current, title: value } : current), { required: true, placeholder: "Service or account" })}
        <label>
          <span>Website</span>
          <input
            name="website"
            type="url"
            value={credentialDraft.website}
            onChange={(event) => setCredentialDraft((current) => current ? { ...current, website: event.target.value } : current)}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              const input = event.currentTarget;
              const start = input.selectionStart ?? credentialDraft.website.length;
              const end = input.selectionEnd ?? start;
              const nextWebsite = `${credentialDraft.website.slice(0, start)}${pasted}${credentialDraft.website.slice(end)}`;
              const normalizedWebsite = normalizeCredentialWebsite(nextWebsite);
              if (normalizedWebsite === nextWebsite) return;
              event.preventDefault();
              setCredentialDraft((current) => current ? { ...current, website: normalizedWebsite } : current);
            }}
            onBlur={() => setCredentialDraft((current) => current ? { ...current, website: normalizeCredentialWebsite(current.website) } : current)}
            placeholder="https://"
          />
        </label>
        <div className={styles.credentialIdentityFields}>
          {input("Username", "username", credentialDraft.username, (value) => setCredentialDraft((current) => current ? { ...current, username: value } : current), { placeholder: "Optional username" })}
          {input("Email", "email", credentialDraft.email, (value) => setCredentialDraft((current) => current ? { ...current, email: value } : current), { type: "email", placeholder: "name@example.com" })}
          <div className={styles.credentialPhoneFields}>
            <div className={styles.credentialCountryCode}>
              <input
                name="phoneCountryCode"
                aria-label="Country code"
                inputMode="tel"
                list="credential-country-code-suggestions"
                value={credentialDraft.phoneCountryCode}
                onChange={(event) => {
                  const nextCode = normalizeCountryCodeInput(event.target.value);
                  setCredentialDraft((current) => current ? {
                    ...current,
                    phoneCountryCode: nextCode,
                    phone: /^\+\d{1,4}$/.test(nextCode) && nextCode !== current.phoneCountryCode
                      ? rebasePhoneCountryCode(current.phone, current.phoneCountryCode, nextCode)
                      : current.phone
                  } : current);
                }}
                onBlur={(event) => {
                  const nextCode = canonicalCountryCode(event.target.value, "");
                  if (nextCode) setCredentialDraft((current) => current ? { ...current, phoneCountryCode: nextCode } : current);
                }}
                placeholder="+1"
                required={Boolean(credentialDraft.phone.trim())}
              />
            </div>
            <label>
              <span>Phone</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                value={credentialDraft.phone}
                onChange={(event) => setCredentialDraft((current) => current ? { ...current, phone: event.target.value } : current)}
                onBlur={() => setCredentialDraft((current) => current ? { ...current, phone: formatInternationalPhone(current.phone, current.phoneCountryCode) } : current)}
                placeholder={credentialDraft.phoneCountryCode === "+51" ? "987-654-321" : "614-796-3848"}
                aria-describedby={credentialPhoneError ? "credential-phone-error" : undefined}
              />
            </label>
            <datalist id="credential-country-code-suggestions">{PHONE_COUNTRY_FORMATS.map((country) => <option value={country.code} label={`${country.country} · ${country.localDigits} digits`} key={country.code} />)}</datalist>
            {credentialPhoneError && <p id="credential-phone-error" role="status">{credentialPhoneError}</p>}
          </div>
        </div>
        <div className={styles.editorField}>
          <label htmlFor="credential-secret">Password</label>
          <div className={styles.secretControl}>
            <input id="credential-secret" name="secret" type={passwordFieldVisible ? "text" : "password"} autoComplete="new-password" value={credentialDraft.secret} onChange={(event) => setCredentialDraft((current) => current ? { ...current, secret: event.target.value } : current)} required />
            <button type="button" aria-label={passwordFieldVisible ? "Hide password" : "Show password"} title={passwordFieldVisible ? "Hide password" : "Show password"} aria-pressed={passwordFieldVisible} onClick={() => setPasswordFieldVisible((current) => !current)}>{passwordFieldVisible ? <PersonalOpsIcon name="hide" /> : <PersonalOpsIcon name="show" />}</button>
          </div>
        </div>
        <div className={styles.editorField}>
          <label htmlFor="credential-pin">PIN</label>
          <div className={styles.secretControl}>
            <input id="credential-pin" name="pin" type={pinFieldVisible ? "text" : "password"} inputMode="numeric" autoComplete="off" value={credentialDraft.pin} onChange={(event) => setCredentialDraft((current) => current ? { ...current, pin: event.target.value } : current)} placeholder="Optional" />
            <button type="button" aria-label={pinFieldVisible ? "Hide PIN" : "Show PIN"} title={pinFieldVisible ? "Hide PIN" : "Show PIN"} aria-pressed={pinFieldVisible} onClick={() => setPinFieldVisible((current) => !current)}>{pinFieldVisible ? <PersonalOpsIcon name="hide" /> : <PersonalOpsIcon name="show" />}</button>
          </div>
        </div>
        <label className={styles.full}><span>Notes</span><textarea value={credentialDraft.notes} onChange={(event) => setCredentialDraft((current) => current ? { ...current, notes: event.target.value } : current)} rows={4} /></label>
        <footer><button type="button" onClick={closeCredentialEditor}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy || Boolean(credentialPhoneError)}>{busy ? "Saving…" : "Save"}</button></footer>
      </form>
    </div>}

    {editor && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}><form className={styles.editor} onSubmit={submitEditor}><header><div>{editor.collection !== "trips" && <span>Personal Ops record</span>}<h2>{editor.collection === "trips" ? tripEditorTitle : `${editor.id ? "Edit" : "Add"} ${editor.collection === "buildItems" ? "personal build item" : editor.collection === "vehicles" ? "vehicle" : editor.collection.slice(0, -1)}`}</h2></div><button type="button" aria-label="Close editor" onClick={() => setEditor(null)}>×</button></header>
      {editor.collection === "lists" && <>{input("Title", "title", editorValue("title"), (value) => setEditorValue("title", value), { required: true })}<label><span>Type</span><select value={editorValue("kind")} onChange={(event) => setEditorValue("kind", event.target.value)}><option value="shopping">Things to buy</option><option value="watchlist">Watchlist</option><option value="favorites">Favorites</option><option value="packing">Packing</option><option value="custom">Custom</option></select></label><label className={styles.full}><span>Description</span><textarea value={editorValue("description")} onChange={(event) => setEditorValue("description", event.target.value)} rows={3} /></label></>}
      {editor.collection === "trips" && <>
        <label className={styles.full}><span>Status</span><select value={editorValue("status")} onChange={(event) => setEditorValue("status", event.target.value)}>{Object.entries(TRIP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {input(tripEditorStatus === "want" ? "Place name" : tripEditorStatus === "lived" ? "Home label" : "Trip name", "name", editorValue("name"), (value) => setEditorValue("name", value), { required: true, placeholder: tripEditorStatus === "planned" ? "Weekend in Montréal" : "Name this place" })}
        {input(tripEditorStatus === "planned" ? "Destination" : "Place", "place", editorValue("place"), (value) => setEditorValue("place", value), { required: true, placeholder: "City or country" })}
        {input("Region", "region", editorValue("region"), (value) => setEditorValue("region", value), { placeholder: "State, province, or region" })}
        {(tripEditorStatus === "been" || tripEditorStatus === "planned") && <label><span>Travel mode</span><select value={editorValue("travelMode")} onChange={(event) => setEditorValue("travelMode", event.target.value)}>{["car", "plane", "train", "boat", "bus", "bike", "walk", "other"].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>}
        {tripEditorStatus === "want" && input("Target date", "startDate", editorValue("startDate"), (value) => setEditorValue("startDate", value), { type: "date" })}
        {tripEditorStatus === "been" && <>{input("Arrived", "startDate", editorValue("startDate"), (value) => setEditorValue("startDate", value), { type: "date" })}{input("Returned", "endDate", editorValue("endDate"), (value) => setEditorValue("endDate", value), { type: "date" })}</>}
        {tripEditorStatus === "lived" && <>{input("Moved in", "startDate", editorValue("startDate"), (value) => setEditorValue("startDate", value), { type: "date" })}{input("Moved out", "endDate", editorValue("endDate"), (value) => setEditorValue("endDate", value), { type: "date" })}</>}
        {tripEditorStatus === "planned" && <>{input("Depart", "startDate", editorValue("startDate"), (value) => setEditorValue("startDate", value), { type: "date" })}{input("Return", "endDate", editorValue("endDate"), (value) => setEditorValue("endDate", value), { type: "date" })}</>}
        <fieldset className={styles.coordinateFields}><legend>Map pin</legend>{input("Latitude", "latitude", editorValue("latitude"), (value) => setEditorValue("latitude", value), { type: "number", required: true })}{input("Longitude", "longitude", editorValue("longitude"), (value) => setEditorValue("longitude", value), { type: "number", required: true })}</fieldset>
        <label className={styles.full}><span>{tripEditorStatus === "want" ? "Why it’s on the list" : tripEditorStatus === "lived" ? "Living notes" : "Trip notes"}</span><textarea value={editorValue("notes")} onChange={(event) => setEditorValue("notes", event.target.value)} rows={4} /></label>
      </>}
      {editor.collection === "buildItems" && <>{input("Item", "name", editorValue("name"), (value) => setEditorValue("name", value), { required: true, placeholder: "Boots, jacket, vest…" })}{input("Category", "category", editorValue("category"), (value) => setEditorValue("category", value), { placeholder: "Footwear, outerwear, gear…" })}<label><span>Status</span><select value={editorValue("status")} onChange={(event) => setEditorValue("status", event.target.value)}>{Object.entries(BUILD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{input("Target", "targetDate", editorValue("targetDate"), (value) => setEditorValue("targetDate", value), { type: "date" })}{input("Budget", "budget", editorValue("budget"), (value) => setEditorValue("budget", value), { placeholder: "$ or range" })}<label className={styles.full}><span>Notes</span><textarea value={editorValue("notes")} onChange={(event) => setEditorValue("notes", event.target.value)} rows={4} /></label></>}
      {editor.collection === "vehicles" && <>{input("Build name", "name", editorValue("name"), (value) => setEditorValue("name", value), { required: true, placeholder: "Daily driver or future build" })}{input("Year", "year", editorValue("year"), (value) => setEditorValue("year", value))}{input("Make", "make", editorValue("make"), (value) => setEditorValue("make", value))}{input("Model", "model", editorValue("model"), (value) => setEditorValue("model", value))}{input("Trim", "trim", editorValue("trim"), (value) => setEditorValue("trim", value))}<label><span>Status</span><select value={editorValue("status")} onChange={(event) => setEditorValue("status", event.target.value)}><option value="current">Current</option><option value="future">Future</option><option value="previous">Previous</option></select></label>{input("Identification note", "vinNote", editorValue("vinNote"), (value) => setEditorValue("vinNote", value), { placeholder: "Optional partial reference—never a key" })}<label className={styles.full}><span>Build notes</span><textarea value={editorValue("notes")} onChange={(event) => setEditorValue("notes", event.target.value)} rows={4} /></label></>}
      <footer><button type="button" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Saving…" : "Save"}</button></footer></form></div>}
  </div>;
}
