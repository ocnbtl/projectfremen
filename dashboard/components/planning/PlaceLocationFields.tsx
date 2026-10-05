"use client";
import { useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import styles from "./PlaceLocationFields.module.css";

export type PlaceLocation = { name?: string; address?: string; latitude?: number; longitude?: number };
export default function PlaceLocationFields({ value, onChange }: { value: PlaceLocation; onChange: (patch: PlaceLocation) => void }) {
  const [matches, setMatches] = useState<PlaceLocation[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null), address = value.address || "";
  useEffect(() => { request.current?.abort(); setMatches([]); setMessage(""); setBusy(false); return () => request.current?.abort(); }, [address]);
  async function lookup() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(""); setMatches([]);
    try {
      const response = await fetch("/api/map", { method: "POST", headers: buildJsonHeadersWithCsrf(), signal: controller.signal, body: JSON.stringify({ operation: "geocode", address }) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Address lookup is unavailable.");
      if (controller.signal.aborted) return;
      setMatches(body.data); setMessage(body.data.length ? "Choose the matching address to fill its coordinates." : "No matches found. Add a city or postal code, or enter coordinates manually.");
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Address lookup is unavailable."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className={styles.fields}>
    <label>Address<input value={address} maxLength={200} onChange={e => onChange({ address: e.target.value, latitude: undefined, longitude: undefined })} /></label>
    <div className={styles.lookup}><Button icon="search" type="button" busy={busy} disabled={busy || address.trim().length < 3 || /^https?:\/\//i.test(address)} onClick={() => void lookup()}>Autofill coordinates</Button><small>Address lookup · OpenStreetMap / Photon</small></div>
    {message && <p role="status" className={styles.message}>{message}</p>}
    {!!matches.length && <div className={styles.matches} aria-label="Matching addresses">{matches.map((match, index) => <button key={index} type="button" onClick={() => { onChange({ ...match, name: value.name?.trim() ? value.name : match.name }); setMatches([]); setMessage("Coordinates filled. You can adjust them below."); }}><strong>{match.name}</strong><span>{match.address}</span><small>{match.latitude?.toFixed(5)}, {match.longitude?.toFixed(5)}</small></button>)}</div>}
    <div className={styles.coordinates}>{(["latitude", "longitude"] as const).map(axis => <label key={axis}>{axis === "latitude" ? "Latitude" : "Longitude"}<input aria-label={axis === "latitude" ? "Latitude" : "Longitude"} type="number" step="any" min={axis === "latitude" ? -90 : -180} max={axis === "latitude" ? 90 : 180} value={value[axis] ?? ""} onChange={e => onChange({ [axis]: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>)}</div>
  </div>;
}
