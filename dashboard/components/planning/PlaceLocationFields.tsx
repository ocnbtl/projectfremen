"use client";
import { useEffect, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { ADDRESS_COUNTRIES, addressCountries, addressFields, addressFieldLabel, formatPlaceAddress, type AddressParts } from "../../lib/modules/planning/place-address";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./PlaceLocationFields.module.css";

export type PlaceLocation = { name?: string; address?: string; latitude?: number; longitude?: number; countryCode?: string; addressParts?: AddressParts };
const extraFlags = new Set(["AQ", "BV", "GS", "HM", "PN", "TF", "UM"]);
function CountryFlag({ code }: { code: string }) {
  return extraFlags.has(code) ? <img className={styles.flag} src={`/address-flags/${code}.svg`} alt="" /> : <svg className={styles.flag} viewBox="0 0 513 342" aria-hidden="true"><use href={`/country-flags.svg#flag-${code}`} /></svg>;
}
export default function PlaceLocationFields({ value, onChange }: { value: PlaceLocation; onChange: (patch: PlaceLocation) => void }) {
  const [matches, setMatches] = useState<PlaceLocation[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null), trigger = useRef<HTMLDivElement>(null), addressId = useId();
  const address = value.address || "", country = value.countryCode || "US";
  const parts: AddressParts = value.addressParts || { street: address, city: "", region: "", postalCode: "", district: "" };
  const localFields = [...new Set([...addressFields(country), ...(["city", "region", "postalCode", "district"] as const).filter(field => parts[field])])];
  useEffect(() => { request.current?.abort(); setMatches([]); setMessage(""); setBusy(false); return () => request.current?.abort(); }, [address, country]);
  function updatePart(field: keyof AddressParts, text: string) {
    if (field === "street" && !value.addressParts) { onChange({ address: text, countryCode: country }); return; }
    const next = { ...parts, [field]: text };
    onChange({ addressParts: next, countryCode: country, address: formatPlaceAddress(next, country) });
  }
  async function lookup() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(""); setMatches([]);
    try {
      const countryName = value.countryCode ? ADDRESS_COUNTRIES[country]?.name : "";
      const query = countryName && !address.toLowerCase().includes(countryName.toLowerCase()) ? `${address}, ${countryName}` : address;
      const response = await fetch("/api/map", { method: "POST", headers: buildJsonHeadersWithCsrf(), signal: controller.signal, body: JSON.stringify({ operation: "geocode", address: query }) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Address lookup is unavailable.");
      if (controller.signal.aborted) return;
      setMatches(body.data); setMessage(body.data.length ? "" : "No matches. Add a city or postal code, or enter coordinates.");
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Address lookup is unavailable."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className={styles.fields}>
    <div className={styles.addressHeading}><label htmlFor={addressId}><UnigentamosIcon role="location" size={16} />Address</label><SelectField searchable autoFocusSearch={false} className={styles.country} aria-label="Address country" value={country} triggerContent={<span className={styles.countryValue}><CountryFlag code={country} /><span>{country}</span><UnigentamosIcon role="chevron-down" size={14} /></span>} onChange={e => {
      const countryCode = e.target.value;
      onChange({ countryCode, ...(value.addressParts ? { address: formatPlaceAddress(parts, countryCode) } : {}) });
    }}>{addressCountries.map(([code, info]) => <option key={code} value={code}><span className={styles.countryOption}><CountryFlag code={code} />{info.name}</span></option>)}</SelectField></div>
    <input id={addressId} autoComplete="street-address" aria-label="Address" value={parts.street} maxLength={240} placeholder="Street number and street name" onChange={e => updatePart("street", e.target.value)} />
    <div className={styles.locality} style={{ gridTemplateColumns: `repeat(${Math.min(localFields.length, 3)}, minmax(0, 1fr))` }}>{localFields.map(field => <label key={field}>{addressFieldLabel(field, country)}<input value={parts[field]} maxLength={240} autoComplete={field === "postalCode" ? "postal-code" : field === "region" ? "address-level1" : field === "city" ? "address-level2" : "address-level3"} onChange={e => updatePart(field, e.target.value)} /></label>)}</div>
    <div className={styles.coordinates}>
      {(["latitude", "longitude"] as const).map(axis => <label key={axis}>{axis === "latitude" ? "Latitude" : "Longitude"}<input aria-label={axis === "latitude" ? "Latitude" : "Longitude"} type="number" step="any" min={axis === "latitude" ? -90 : -180} max={axis === "latitude" ? 90 : 180} value={value[axis] ?? ""} onChange={e => onChange({ [axis]: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>)}
      <div ref={trigger}><Popover.Root open={!!matches.length} onOpenChange={open => { if (!open) setMatches([]); }}><Popover.Anchor asChild><Button className={styles.autofill} aria-label="Autofill coordinates" icon="search" type="button" busy={busy} disabled={busy || address.trim().length < 3 || /^https?:\/\//i.test(address)} onClick={() => void lookup()}>Autofill<span className={styles.fullLabel}> coordinates</span></Button></Popover.Anchor>
      <Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}><Popover.Content className={styles.matches} align="end" sideOffset={8} collisionPadding={12} aria-label="Matching addresses" onFocusOutside={e => e.preventDefault()}><strong>Choose the matching place</strong>{matches.map((match, index) => <button key={index} type="button" onClick={() => { onChange({ latitude: match.latitude, longitude: match.longitude }); setMatches([]); setMessage("Coordinates filled."); }}><strong>{match.name}</strong><span>{match.address}</span><small>{match.latitude?.toFixed(5)}, {match.longitude?.toFixed(5)}</small></button>)}</Popover.Content></Popover.Portal></Popover.Root></div>
    </div>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </div>;
}
