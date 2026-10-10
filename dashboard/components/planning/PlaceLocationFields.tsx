"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { ADDRESS_COUNTRIES, addressCountries, addressFields, addressFieldLabel, formatPlaceAddress, splitPastedAddress, type AddressParts } from "../../lib/modules/planning/place-address";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./PlaceLocationFields.module.css";

export type PlaceLocation = { name?: string; address?: string; latitude?: number; longitude?: number; countryCode?: string; addressParts?: AddressParts };
const extraFlags = new Set(["AQ", "BV", "GS", "HM", "PN", "TF", "UM"]);
function CountryFlag({ code }: { code: string }) {
  return extraFlags.has(code) ? <img className={styles.flag} src={`/address-flags/${code}.svg`} alt="" /> : <svg className={styles.flag} viewBox="0 0 513 342" aria-hidden="true"><use href={`/country-flags.svg#flag-${code}`} /></svg>;
}
export default function PlaceLocationFields({ value, onChange, compact = false, leading }: { value: PlaceLocation; onChange: (patch: PlaceLocation) => void; compact?: boolean; leading?: ReactNode }) {
  const [matches, setMatches] = useState<PlaceLocation[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null), trigger = useRef<HTMLDivElement>(null), addressId = useId();
  const address = value.address || "", country = value.countryCode || "US";
  const pinAddress = useRef(address);
  const parts: AddressParts = value.addressParts || { street: address, city: "", region: "", postalCode: "", district: "" };
  const localFields = [...new Set([...addressFields(country), ...(["city", "region", "postalCode", "district"] as const).filter(field => parts[field])])];
  useEffect(() => { request.current?.abort(); setMatches([]); setMessage(""); setBusy(false); return () => request.current?.abort(); }, [address, country, value.name]);
  useEffect(() => {
    const parsed = splitPastedAddress(value.addressParts?.street || address, country);
    if (parsed) onChange({ addressParts: parsed, countryCode: country, address: formatPlaceAddress(parsed, country) });
  }, [address, country, value.addressParts, onChange]);
  function changeAddress(next: AddressParts, nextCountry = country) {
    const changed = nextCountry !== country || formatPlaceAddress(next, nextCountry) !== formatPlaceAddress(parts, country);
    onChange({ addressParts: next, countryCode: nextCountry, address: formatPlaceAddress(next, nextCountry),
      // A pin chosen on an empty map form is intentional; an old address's pin is not.
      ...(changed && pinAddress.current.trim() ? { latitude: undefined, longitude: undefined } : {}) });
  }
  function updatePart(field: keyof AddressParts, text: string) {
    const parsed = field === "street" ? splitPastedAddress(text, country) : undefined;
    if (parsed) { changeAddress(parsed); return; }
    const next = { ...parts, [field]: text };
    changeAddress(next);
  }
  async function lookup() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(""); setMatches([]);
    try {
      const countryName = value.countryCode ? ADDRESS_COUNTRIES[country]?.name : "";
      const query = countryName && !address.toLowerCase().includes(countryName.toLowerCase()) ? `${address}, ${countryName}` : address;
      const response = await fetch("/api/map", { method: "POST", headers: buildJsonHeadersWithCsrf(), signal: controller.signal, body: JSON.stringify({ operation: "geocode", address: query, name: value.name, countryCode: country, addressParts: parts }) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Address lookup is unavailable.");
      if (controller.signal.aborted) return;
      setMatches(body.data); setMessage(body.data.length ? "" : "No matches. Add a city or postal code, or enter coordinates.");
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Address lookup is unavailable."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className={`${styles.fields} ${compact ? styles.compact : ""}`}>
    {leading}
    <div className={styles.addressHeading}><label htmlFor={addressId}><UnigentamosIcon role="location" size={16} />Address</label><SelectField searchable autoFocusSearch={false} className={styles.country} aria-label="Address country" value={country} triggerContent={<span className={styles.countryValue}><CountryFlag code={country} /><span>{country}</span><UnigentamosIcon role="chevron-down" size={14} /></span>} onChange={e => {
      const countryCode = e.target.value;
      changeAddress(parts, countryCode);
    }}>{addressCountries.map(([code, info]) => <option key={code} value={code}><span className={styles.countryOption}><CountryFlag code={code} />{info.name}</span></option>)}</SelectField></div>
    <input id={addressId} autoComplete="street-address" aria-label="Address" value={parts.street} maxLength={240} placeholder="Street address or paste a full address" onChange={e => updatePart("street", e.target.value)} onPaste={e => {
      const input = e.currentTarget;
      const text = input.value.slice(0, input.selectionStart ?? 0) + e.clipboardData.getData("text") + input.value.slice(input.selectionEnd ?? input.value.length);
      if (splitPastedAddress(text, country)) { e.preventDefault(); updatePart("street", text); }
    }} />
    <div className={styles.locality} style={{ gridTemplateColumns: `repeat(${Math.min(localFields.length, 3)}, minmax(0, 1fr))` }}>{localFields.map(field => <label key={field}>{addressFieldLabel(field, country)}<input value={parts[field]} maxLength={240} autoComplete={field === "postalCode" ? "postal-code" : field === "region" ? "address-level1" : field === "city" ? "address-level2" : "address-level3"} onChange={e => updatePart(field, e.target.value)} /></label>)}</div>
    <div className={styles.coordinates}>
      {(["latitude", "longitude"] as const).map(axis => <label key={axis}>{axis === "latitude" ? "Latitude" : "Longitude"}<input aria-label={axis === "latitude" ? "Latitude" : "Longitude"} type="number" step="any" min={axis === "latitude" ? -90 : -180} max={axis === "latitude" ? 90 : 180} value={value[axis] ?? ""} onChange={e => { pinAddress.current = address; onChange({ [axis]: e.target.value === "" ? undefined : Number(e.target.value) }); }} /></label>)}
      <div ref={trigger}><Popover.Root open={!!matches.length} onOpenChange={open => { if (!open) setMatches([]); }}><Popover.Anchor asChild><Button className={styles.autofill} aria-label="Autofill coordinates" icon="search" type="button" busy={busy} disabled={busy || address.trim().length < 3 || /^https?:\/\//i.test(address)} onClick={() => void lookup()}>Autofill<span className={styles.fullLabel}> coordinates</span></Button></Popover.Anchor>
      <Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}><Popover.Content className={styles.matches} align="end" sideOffset={8} collisionPadding={12} aria-label="Matching addresses" onFocusOutside={e => e.preventDefault()}><strong>Choose the matching place</strong>{matches.map((match, index) => <button key={index} type="button" onClick={() => { pinAddress.current = address; onChange({ latitude: match.latitude, longitude: match.longitude }); setMatches([]); setMessage("Coordinates filled."); }}><strong>{match.name}</strong><span>{match.address}</span><small>{match.latitude?.toFixed(5)}, {match.longitude?.toFixed(5)}</small></button>)}</Popover.Content></Popover.Portal></Popover.Root></div>
    </div>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </div>;
}
