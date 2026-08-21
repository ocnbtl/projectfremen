"use client";

import Link from "next/link";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { browserVault } from "../../lib/local-first/browser-engine";
import type { VaultObjectSnapshot } from "../../lib/local-first/types";
import type {
  BuildItemStatus,
  PersonalBuildItem,
  PersonalLifeCollection,
  PersonalLifeState,
  PersonalList,
  PersonalListItem,
  PersonalTrip,
  PersonalVehicle,
  TripStatus,
  VehicleModification,
  VehicleModificationStatus
} from "../../lib/modules/personal-life/types";
import type { PersonalOpsState } from "../../lib/modules/personal-ops/types";
import PersonalOpsSidebar, { type PersonalOpsSidebarCounts } from "./PersonalOpsSidebar";
import baseStyles from "./PersonalOpsWorkspace.module.css";
import styles from "./PersonalLifeWorkspace.module.css";

export type PersonalLifeView = "passwords" | "lists" | "travel" | "personal-build" | "car";

type LifeEditor = {
  collection: PersonalLifeCollection;
  id?: string;
  values: Record<string, string>;
};

type CredentialDraft = {
  id?: string;
  title: string;
  username: string;
  secret: string;
  website: string;
  notes: string;
};

const VIEW_COPY: Record<PersonalLifeView, { title: string; description: string; action: string }> = {
  passwords: { title: "Passwords", description: "Encrypted credentials kept inside your local-first Vault.", action: "Add password" },
  lists: { title: "Lists", description: "Flexible notebooks for things to buy, watch, pack, remember, or rank.", action: "New list" },
  travel: { title: "Travel", description: "A personal atlas of places lived, visited, planned, and wanted.", action: "Add trip" },
  "personal-build": { title: "Personal Build", description: "The long-term loadout you are deliberately assembling.", action: "Add item" },
  car: { title: "Car", description: "Current vehicle records and the build sheet for what comes next.", action: "Add vehicle" }
};

const TRIP_LABELS: Record<TripStatus, string> = { been: "Been", want: "Want to go", lived: "Lived", planned: "Planned" };
const BUILD_LABELS: Record<BuildItemStatus, string> = { wanted: "Wanted", researching: "Researching", acquired: "Acquired", retired: "Retired" };
const MOD_LABELS: Record<VehicleModificationStatus, string> = { idea: "Ideas", researching: "Researching", planned: "Planned", installed: "Installed", skipped: "Skipped" };

function stringField(snapshot: VaultObjectSnapshot, field: string): string {
  const value = snapshot.fields[field];
  return typeof value === "string" ? value : "";
}

function formatDate(value?: string) {
  if (!value) return "No date";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
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
  initialLoadError
}: {
  initialView: PersonalLifeView;
  initialState: PersonalLifeState;
  personalOpsState: PersonalOpsState;
  initialLoadError?: string;
}) {
  const [state, setState] = useState(initialState);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editor, setEditor] = useState<LifeEditor | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(initialLoadError || "");
  const [selectedListId, setSelectedListId] = useState(initialState.lists[0]?.id || "");
  const [newListItem, setNewListItem] = useState("");
  const [tripFilters, setTripFilters] = useState<Set<TripStatus>>(() => new Set(["been", "want", "lived", "planned"]));
  const [selectedTripId, setSelectedTripId] = useState(initialState.trips[0]?.id || "");
  const [selectedVehicleId, setSelectedVehicleId] = useState(initialState.vehicles[0]?.id || "");
  const [modDraft, setModDraft] = useState("");
  const [modStatus, setModStatus] = useState<VehicleModificationStatus>("idea");
  const [vaultStatus, setVaultStatus] = useState<"loading" | "ready" | "locked" | "unconfigured">("loading");
  const [credentials, setCredentials] = useState<VaultObjectSnapshot[]>([]);
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const copy = VIEW_COPY[initialView];

  async function refreshVault() {
    setVaultStatus("loading");
    const status = await browserVault.status();
    if (!status.configured) {
      setVaultStatus("unconfigured");
      setCredentials([]);
      return;
    }
    if (!status.unlocked) {
      setVaultStatus("locked");
      setCredentials([]);
      return;
    }
    const objects = await browserVault.listObjects();
    setCredentials(objects.filter((item) => !item.tombstone && item.objectKind === "personal_ops" && item.fields.recordType === "credential"));
    setVaultStatus("ready");
  }

  useEffect(() => {
    if (initialView !== "passwords") return;
    void refreshVault().catch((cause: unknown) => {
      setVaultStatus("locked");
      setError(cause instanceof Error ? cause.message : "The Vault could not be opened.");
    });
  }, [initialView]);

  const sidebarCounts = countsFor(personalOpsState, state, credentials.length);
  const selectedList = state.lists.find((item) => item.id === selectedListId) || state.lists[0] || null;
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
      setCredentialDraft({ title: "", username: "", secret: "", website: "", notes: "" });
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
    if (editor.collection === "lists") values.items = (existing as PersonalList | undefined)?.items || [];
    if (editor.collection === "trips") {
      values.latitude = Number(editor.values.latitude);
      values.longitude = Number(editor.values.longitude);
    }
    if (editor.collection === "vehicles") values.modifications = (existing as PersonalVehicle | undefined)?.modifications || [];
    const saved = await saveObject(editor.collection, values, existing);
    if (!saved) return;
    if (editor.collection === "lists") setSelectedListId(saved.id);
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
      await browserVault.saveObject({
        ...(credentialDraft.id ? { objectId: credentialDraft.id } : {}),
        objectKind: "personal_ops",
        fields: {
          recordType: "credential",
          title: credentialDraft.title.trim(),
          username: credentialDraft.username.trim(),
          secret: credentialDraft.secret,
          website: credentialDraft.website.trim(),
          notes: credentialDraft.notes.trim()
        }
      });
      await refreshVault();
      setCredentialDraft(null);
      setNotice("Credential encrypted and saved to the Vault.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The credential could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCredential(item: VaultObjectSnapshot) {
    if (!window.confirm(`Delete “${stringField(item, "title") || "credential"}” from the encrypted Vault?`)) return;
    setBusy(true);
    try {
      await browserVault.saveObject({ objectId: item.objectId, objectKind: "personal_ops", fields: {}, tombstone: true });
      await refreshVault();
      setNotice("Credential deleted from the Vault.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The credential could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function patchListItems(list: PersonalList, items: PersonalListItem[]) {
    await saveObject("lists", { items }, list);
  }

  async function addModification(vehicle: PersonalVehicle) {
    if (!modDraft.trim()) return;
    const modification: VehicleModification = { id: crypto.randomUUID(), name: modDraft.trim(), category: "", status: modStatus, estimate: "", notes: "" };
    const saved = await saveObject("vehicles", { modifications: [...vehicle.modifications, modification] }, vehicle);
    if (saved) setModDraft("");
  }

  function mapClick(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const longitude = Math.round(((event.clientX - rect.left) / rect.width) * 360 - 180);
    const latitude = Math.round(90 - ((event.clientY - rect.top) / rect.height) * 180);
    openCreate({ latitude: String(latitude), longitude: String(longitude) });
  }

  function renderPasswords() {
    if (vaultStatus !== "ready") return (
      <section className={styles.vaultGate}>
        <span className={styles.vaultMark} aria-hidden="true">⌁</span>
        <h2>{vaultStatus === "loading" ? "Checking your Vault…" : vaultStatus === "locked" ? "Unlock your Vault" : "Set up your Vault"}</h2>
        <p>Passwords are never written to the Personal Ops server store. They are available here only while your encrypted local-first Vault is unlocked.</p>
        {vaultStatus !== "loading" && <Link href="/vault" className={styles.primaryButton}>{vaultStatus === "locked" ? "Unlock Vault" : "Set up Vault"}</Link>}
      </section>
    );
    return (
      <section className={styles.keyring} aria-label="Encrypted password keyring">
        <div className={styles.keyringRail}><span>Encrypted</span><strong>{credentials.length}</strong><small>Vault entries</small></div>
        <div className={styles.credentialList}>
          {credentials.length ? credentials.map((item) => {
            const secret = stringField(item, "secret");
            const isRevealed = revealed.has(item.objectId);
            return <article className={styles.credentialRow} key={item.objectId}>
              <span className={styles.keyIcon} aria-hidden="true">⌁</span>
              <div><strong>{stringField(item, "title") || "Untitled credential"}</strong><small>{stringField(item, "username") || stringField(item, "website") || "No account label"}</small></div>
              <code aria-label={isRevealed ? "Revealed password" : "Hidden password"}>{isRevealed ? secret : "••••••••••••"}</code>
              <div className={styles.rowActions}>
                <button type="button" onClick={() => setRevealed((current) => { const next = new Set(current); if (next.has(item.objectId)) next.delete(item.objectId); else next.add(item.objectId); return next; })}>{isRevealed ? "Hide" : "Reveal"}</button>
                <button type="button" onClick={() => void navigator.clipboard.writeText(secret).then(() => setNotice("Password copied."))}>Copy</button>
                <button type="button" onClick={() => setCredentialDraft({ id: item.objectId, title: stringField(item, "title"), username: stringField(item, "username"), secret, website: stringField(item, "website"), notes: stringField(item, "notes") })}>Edit</button>
                <button type="button" onClick={() => void deleteCredential(item)}>Delete</button>
              </div>
            </article>;
          }) : <div className={styles.empty}><strong>No passwords yet</strong><span>Add a credential when your Vault is unlocked.</span></div>}
        </div>
      </section>
    );
  }

  function renderLists() {
    return <div className={styles.notebook}>
      <aside className={styles.listIndex} aria-label="Lists">
        {state.lists.map((list) => <button type="button" data-active={selectedList?.id === list.id || undefined} onClick={() => setSelectedListId(list.id)} key={list.id}><span>{list.title}</span><small>{list.items.filter((item) => item.completed).length}/{list.items.length}</small></button>)}
        {!state.lists.length && <p>No lists yet.</p>}
      </aside>
      <section className={styles.listPage}>
        {selectedList ? <>
          <header><div><span>{selectedList.kind}</span><h2>{selectedList.title}</h2><p>{selectedList.description || "A flexible working list."}</p></div><div className={styles.rowActions}><button type="button" onClick={() => openEdit("lists", selectedList)}>Edit</button><button type="button" onClick={() => void removeObject("lists", selectedList)}>Delete</button></div></header>
          <ol className={styles.checklist}>
            {selectedList.items.map((item) => <li data-complete={item.completed || undefined} key={item.id}><button type="button" className={styles.checkmark} aria-label={item.completed ? `Reopen ${item.text}` : `Complete ${item.text}`} onClick={() => void patchListItems(selectedList, selectedList.items.map((candidate) => candidate.id === item.id ? { ...candidate, completed: !candidate.completed } : candidate))}>{item.completed ? "✓" : ""}</button><span><strong>{item.text}</strong>{item.note && <small>{item.note}</small>}</span><button type="button" className={styles.iconOnly} aria-label={`Delete ${item.text}`} onClick={() => void patchListItems(selectedList, selectedList.items.filter((candidate) => candidate.id !== item.id))}>×</button></li>)}
          </ol>
          <form className={styles.inlineComposer} onSubmit={(event) => { event.preventDefault(); if (!newListItem.trim()) return; const item = { id: crypto.randomUUID(), text: newListItem.trim(), note: "", completed: false }; void patchListItems(selectedList, [...selectedList.items, item]).then(() => setNewListItem("")); }}><input value={newListItem} onChange={(event) => setNewListItem(event.target.value)} placeholder="Add an item…" aria-label="New list item" /><button type="submit">Add</button></form>
        </> : <div className={styles.empty}><strong>Start a list</strong><span>Create a focused notebook for anything you want to track.</span></div>}
      </section>
    </div>;
  }

  function renderTravel() {
    const visibleTrips = state.trips.filter((trip) => tripFilters.has(trip.status));
    return <div className={styles.atlas}>
      <section className={styles.mapPanel}>
        <div className={styles.mapToolbar} aria-label="Travel map layers">{(Object.keys(TRIP_LABELS) as TripStatus[]).map((status) => <button type="button" data-status={status} data-active={tripFilters.has(status) || undefined} aria-pressed={tripFilters.has(status)} onClick={() => setTripFilters((current) => { const next = new Set(current); if (next.has(status)) next.delete(status); else next.add(status); return next; })} key={status}><span />{TRIP_LABELS[status]}</button>)}</div>
        <div className={styles.worldMap} onClick={mapClick} role="application" aria-label="Interactive travel map. Click the map to add a place at that coordinate.">
          <svg viewBox="0 0 1000 500" aria-hidden="true"><path d="M76 92 170 52l128 30 62 87-66 62-90-18-47 63-76-62Z M363 253l62-18 47 58-18 127-55 54-42-106Z M480 83l94-42 112 24 55 54-37 46-76-18-42 31-82-21Z M680 168l133-18 103 70-67 65-84-16-61 57-54-63Z M803 360l91-26 57 54-42 50-94-11Z" /></svg>
          {visibleTrips.map((trip) => <button type="button" className={styles.mapPin} data-status={trip.status} style={{ left: `${((trip.longitude + 180) / 360) * 100}%`, top: `${((90 - trip.latitude) / 180) * 100}%` }} aria-label={`${trip.name}, ${TRIP_LABELS[trip.status]}`} onClick={(event) => { event.stopPropagation(); setSelectedTripId(trip.id); }} key={trip.id}><span /></button>)}
          <span className={styles.mapHint}>Click anywhere to place a new trip</span>
        </div>
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

  return <div className={baseStyles.shell}>
    <PersonalOpsSidebar activeView={initialView} filter="" pathname={`/admin/personal/${initialView}`} counts={sidebarCounts} mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
    <main className={baseStyles.directory}>
      <div className={baseStyles.mobileToolbar}><button type="button" onClick={() => setMobileSidebarOpen(true)} aria-expanded={mobileSidebarOpen}>☰ Personal Ops</button><button type="button" onClick={() => openCreate()}>+ {copy.action}</button></div>
      <div className={styles.scroll}>
        <header className={styles.pageHeader}><div><span>Personal Ops / Command</span><h1>{copy.title}</h1><p>{copy.description}</p></div><button type="button" className={styles.primaryButton} onClick={() => openCreate()} disabled={initialView === "passwords" && vaultStatus !== "ready"}>+ {copy.action}</button></header>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <div className={styles.workspace} data-view={initialView}>
          {initialView === "passwords" && renderPasswords()}
          {initialView === "lists" && renderLists()}
          {initialView === "travel" && renderTravel()}
          {initialView === "personal-build" && renderBuild()}
          {initialView === "car" && renderCar()}
        </div>
      </div>
    </main>

    {credentialDraft && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCredentialDraft(null); }}><form className={styles.editor} onSubmit={saveCredential}><header><div><span>Encrypted Vault entry</span><h2>{credentialDraft.id ? "Edit password" : "Add password"}</h2></div><button type="button" aria-label="Close password editor" onClick={() => setCredentialDraft(null)}>×</button></header>{input("Account", "title", credentialDraft.title, (value) => setCredentialDraft((current) => current ? { ...current, title: value } : current), { required: true, placeholder: "Service or account" })}{input("Username or email", "username", credentialDraft.username, (value) => setCredentialDraft((current) => current ? { ...current, username: value } : current), { placeholder: "name@example.com" })}{input("Password", "secret", credentialDraft.secret, (value) => setCredentialDraft((current) => current ? { ...current, secret: value } : current), { type: "password", required: true })}{input("Website", "website", credentialDraft.website, (value) => setCredentialDraft((current) => current ? { ...current, website: value } : current), { type: "url", placeholder: "https://" })}<label className={styles.full}><span>Notes</span><textarea value={credentialDraft.notes} onChange={(event) => setCredentialDraft((current) => current ? { ...current, notes: event.target.value } : current)} rows={4} /></label><footer><button type="button" onClick={() => setCredentialDraft(null)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Encrypting…" : "Encrypt & save"}</button></footer></form></div>}

    {editor && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}><form className={styles.editor} onSubmit={submitEditor}><header><div><span>Personal Ops record</span><h2>{editor.id ? "Edit" : "Add"} {editor.collection === "buildItems" ? "personal build item" : editor.collection === "vehicles" ? "vehicle" : editor.collection.slice(0, -1)}</h2></div><button type="button" aria-label="Close editor" onClick={() => setEditor(null)}>×</button></header>
      {editor.collection === "lists" && <>{input("Title", "title", editorValue("title"), (value) => setEditorValue("title", value), { required: true })}<label><span>Type</span><select value={editorValue("kind")} onChange={(event) => setEditorValue("kind", event.target.value)}><option value="shopping">Things to buy</option><option value="watchlist">Watchlist</option><option value="favorites">Favorites</option><option value="packing">Packing</option><option value="custom">Custom</option></select></label><label className={styles.full}><span>Description</span><textarea value={editorValue("description")} onChange={(event) => setEditorValue("description", event.target.value)} rows={3} /></label></>}
      {editor.collection === "trips" && <>{input("Trip name", "name", editorValue("name"), (value) => setEditorValue("name", value), { required: true })}{input("Place", "place", editorValue("place"), (value) => setEditorValue("place", value), { required: true, placeholder: "City or country" })}{input("Region", "region", editorValue("region"), (value) => setEditorValue("region", value), { placeholder: "State, province, or region" })}<label><span>Map status</span><select value={editorValue("status")} onChange={(event) => setEditorValue("status", event.target.value)}>{Object.entries(TRIP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Travel mode</span><select value={editorValue("travelMode")} onChange={(event) => setEditorValue("travelMode", event.target.value)}>{["car", "plane", "train", "boat", "bus", "bike", "walk", "other"].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>{input("Latitude", "latitude", editorValue("latitude"), (value) => setEditorValue("latitude", value), { type: "number", required: true })}{input("Longitude", "longitude", editorValue("longitude"), (value) => setEditorValue("longitude", value), { type: "number", required: true })}{input("Start", "startDate", editorValue("startDate"), (value) => setEditorValue("startDate", value), { type: "date" })}{input("End", "endDate", editorValue("endDate"), (value) => setEditorValue("endDate", value), { type: "date" })}<label className={styles.full}><span>Notes</span><textarea value={editorValue("notes")} onChange={(event) => setEditorValue("notes", event.target.value)} rows={4} /></label></>}
      {editor.collection === "buildItems" && <>{input("Item", "name", editorValue("name"), (value) => setEditorValue("name", value), { required: true, placeholder: "Boots, jacket, vest…" })}{input("Category", "category", editorValue("category"), (value) => setEditorValue("category", value), { placeholder: "Footwear, outerwear, gear…" })}<label><span>Status</span><select value={editorValue("status")} onChange={(event) => setEditorValue("status", event.target.value)}>{Object.entries(BUILD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{input("Target", "targetDate", editorValue("targetDate"), (value) => setEditorValue("targetDate", value), { type: "date" })}{input("Budget", "budget", editorValue("budget"), (value) => setEditorValue("budget", value), { placeholder: "$ or range" })}<label className={styles.full}><span>Notes</span><textarea value={editorValue("notes")} onChange={(event) => setEditorValue("notes", event.target.value)} rows={4} /></label></>}
      {editor.collection === "vehicles" && <>{input("Build name", "name", editorValue("name"), (value) => setEditorValue("name", value), { required: true, placeholder: "Daily driver or future build" })}{input("Year", "year", editorValue("year"), (value) => setEditorValue("year", value))}{input("Make", "make", editorValue("make"), (value) => setEditorValue("make", value))}{input("Model", "model", editorValue("model"), (value) => setEditorValue("model", value))}{input("Trim", "trim", editorValue("trim"), (value) => setEditorValue("trim", value))}<label><span>Status</span><select value={editorValue("status")} onChange={(event) => setEditorValue("status", event.target.value)}><option value="current">Current</option><option value="future">Future</option><option value="previous">Previous</option></select></label>{input("Identification note", "vinNote", editorValue("vinNote"), (value) => setEditorValue("vinNote", value), { placeholder: "Optional partial reference—never a key" })}<label className={styles.full}><span>Build notes</span><textarea value={editorValue("notes")} onChange={(event) => setEditorValue("notes", event.target.value)} rows={4} /></label></>}
      <footer><button type="button" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Saving…" : "Save"}</button></footer></form></div>}
  </div>;
}
