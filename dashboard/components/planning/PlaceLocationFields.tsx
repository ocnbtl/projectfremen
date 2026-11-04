"use client";
import { formatPlaceCoordinates } from "../../lib/modules/planning/place-presentation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { ADDRESS_COUNTRIES, addressCountries, addressFields, addressFieldLabel, formatPlaceAddress, splitPastedAddress, type AddressParts } from "../../lib/modules/planning/place-address";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import styles from "./PlaceLocationFields.module.css";
import { placeFromSearch, type PlaceSearchResult } from "../../lib/modules/planning/place-search";

export type PlaceLocation = { name?: string; address?: string; latitude?: number; longitude?: number; countryCode?: string; addressParts?: AddressParts; lookup?: import("../../lib/modules/planning/types").Place["lookup"] };
const extraFlags = new Set(["AQ", "BV", "GS", "HM", "PN", "TF", "UM"]);
function CountryFlag({ code }: { code: string }) {
  return extraFlags.has(code) ? <img className={styles.flag} src={`/address-flags/${code}.svg`} alt="" /> : <svg className={styles.flag} viewBox="0 0 513 342" aria-hidden="true"><use href={`/country-flags.svg#flag-${code}`} /></svg>;
}
export default function PlaceLocationFields({ value, onChange, compact = false, leading }: { value: PlaceLocation; onChange: (patch: PlaceLocation) => void; compact?: boolean; leading?: ReactNode }) {
  const [matches, setMatches] = useState<PlaceSearchResult[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [lookupMode, setLookupMode] = useState<"place" | "coordinates">("place");
  const [pastedAddress, setPastedAddress] = useState<{ address: string; country: string }>();
  const request = useRef<AbortController | null>(null), trigger = useRef<HTMLDivElement>(null), placeTrigger = useRef<HTMLDivElement>(null), applying = useRef(false), addressId = useId();
  const address = value.address || "", country = value.countryCode || "";
  const pinAddress = useRef(address);
  const parts: AddressParts = value.addressParts || { street: address, city: "", region: "", postalCode: "", district: "" };
  const localFields = [...new Set([...addressFields(country), ...(["city", "region", "postalCode", "district"] as const).filter(field => parts[field])])];
  useEffect(() => { request.current?.abort(); setMatches([]); if (!applying.current) setMessage(""); applying.current = false; setBusy(false); return () => request.current?.abort(); }, [address, country, value.name]);
  useEffect(() => {
    const parsed = splitPastedAddress(value.addressParts?.street || address, country || "US");
    if (parsed) onChange({ addressParts: parsed, countryCode: country || "US", address: formatPlaceAddress(parsed, country || "US") });
  }, [address, country, value.addressParts, onChange]);
  useEffect(() => {
    if (!pastedAddress) return;
    if (pastedAddress.address !== address || pastedAddress.country !== country) { setPastedAddress(undefined); return; }
    // Wait for the split fields to settle, and cancel if the user edits again.
    const timer = window.setTimeout(() => { setPastedAddress(undefined); void lookup(); }, 250);
    return () => window.clearTimeout(timer);
  }, [pastedAddress, address, country, value.name]);
  function cancelLookup() {
    request.current?.abort(); setPastedAddress(undefined); setMatches([]); setMessage(""); setBusy(false);
  }
  function changeAddress(next: AddressParts, nextCountry = country) {
    cancelLookup();
    const changed = nextCountry !== country || formatPlaceAddress(next, nextCountry) !== formatPlaceAddress(parts, country);
    onChange({ addressParts: next, countryCode: nextCountry, address: formatPlaceAddress(next, nextCountry), lookup: undefined,
      // A pin chosen on an empty map form is intentional; an old address's pin is not.
      ...(changed && pinAddress.current.trim() ? { latitude: undefined, longitude: undefined } : {}) });
  }
  function updatePart(field: keyof AddressParts, text: string, pasted = false) {
    const parsed = field === "street" ? splitPastedAddress(text, country || "US") : undefined;
    const next = parsed || { ...parts, [field]: text };
    const nextCountry = parsed ? country || "US" : country;
    changeAddress(next, nextCountry);
    if (pasted && text.trim().length >= 3 && !/^https?:\/\//i.test(text.trim())) setPastedAddress({ address: formatPlaceAddress(next, nextCountry), country: nextCountry });
  }
  function selectMatch(match: PlaceSearchResult) {
    if (lookupMode === "place") {
      applying.current = true;
      pinAddress.current = match.address;
      onChange(placeFromSearch(match));
      setMessage(match.countryCode ? "Place filled. Review the details, then save." : "Place filled. The provider did not supply a country; review it before saving.");
    } else {
      pinAddress.current = address; onChange({ latitude: match.latitude, longitude: match.longitude }); setMessage("Coordinates filled.");
    }
    setMatches([]);
  }
  async function lookup(mode: "place" | "coordinates" = "coordinates") {
    setPastedAddress(undefined);
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLookupMode(mode); setBusy(true); setMessage(""); setMatches([]);
    try {
      const countryName = value.countryCode ? ADDRESS_COUNTRIES[country]?.name : "";
      const query = countryName && !address.toLowerCase().includes(countryName.toLowerCase()) ? `${address}, ${countryName}` : address;
      const input = mode === "place" ? { operation: "place_autofill", query: value.name?.trim() || address } : { operation: "geocode", address: query, name: value.name, countryCode: country || undefined, addressParts: parts };
      const response = await fetch("/api/map", { method: "POST", headers: buildJsonHeadersWithCsrf(), signal: controller.signal, body: JSON.stringify(input) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Address lookup is unavailable.");
      if (controller.signal.aborted) return;
      if (body.data.length === 1 && mode === "coordinates") { pinAddress.current = address; onChange({ latitude: body.data[0].latitude, longitude: body.data[0].longitude }); setMessage("Coordinates filled."); }
      else { setMatches(body.data); setMessage(body.data.length ? "" : "No matches. Add a city or postal code, or enter coordinates."); }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Address lookup is unavailable."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const choices = <Popover.Content className={styles.matches} align={lookupMode === "place" ? "start" : "end"} sideOffset={8} collisionPadding={12} collisionBoundary={(lookupMode === "place" ? placeTrigger : trigger).current?.closest<HTMLElement>('[role="dialog"]')} aria-label="Matching places" onFocusOutside={e => e.preventDefault()}>
    <strong>Choose the matching place</strong>{matches.map((match, index) => <button key={match.sourceUrl || index} type="button" onClick={() => selectMatch(match)}><strong>{match.name}</strong><span>{match.address}</span><small>{[match.kind && match.kind.replace(/^./, c => c.toUpperCase()), match.precision === "area" ? "Area center" : "", formatPlaceCoordinates(match.latitude, match.longitude)].filter(Boolean).join(" · ")}</small></button>)}
    <a className={styles.attribution} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
  </Popover.Content>;
  return <div className={`${styles.fields} ${compact ? styles.compact : ""}`}>
    {leading}
    <div className={styles.placeLookup} ref={placeTrigger}><Popover.Root open={lookupMode === "place" && !!matches.length} onOpenChange={open => { if (!open) setMatches([]); }}><Popover.Anchor asChild><Button type="button" icon="search" className={styles.autofill} aria-label="Autofill place" busy={busy && lookupMode === "place"} disabled={busy || (value.name?.trim() || address.trim()).length < 2} onClick={() => void lookup("place")}>Autofill place</Button></Popover.Anchor><Popover.Portal container={placeTrigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}>{choices}</Popover.Portal></Popover.Root><span>Worldwide</span></div>
    <div className={styles.addressHeading}><label htmlFor={addressId}><UnigentamosIcon role="location" size={16} />Address</label><SelectField searchable autoFocusSearch={false} className={styles.country} aria-label="Address country" value={country} triggerContent={<span className={styles.countryValue}>{country ? <CountryFlag code={country} /> : <UnigentamosIcon role="travel-kind-country" size={16} />}<span>{country || "Auto"}</span><UnigentamosIcon role="chevron-down" size={14} /></span>} onChange={e => {
      const countryCode = e.target.value;
      changeAddress(parts, countryCode);
    }}><option value="">Auto · worldwide</option>{addressCountries.map(([code, info]) => <option key={code} value={code}><span className={styles.countryOption}><CountryFlag code={code} />{info.name}</span></option>)}</SelectField></div>
    <input id={addressId} autoComplete="street-address" aria-label="Address" value={parts.street} maxLength={240} placeholder="Street address or paste a full address" onChange={e => updatePart("street", e.target.value)} onPaste={e => {
      const input = e.currentTarget;
      const text = (input.value.slice(0, input.selectionStart ?? 0) + e.clipboardData.getData("text") + input.value.slice(input.selectionEnd ?? input.value.length)).slice(0, input.maxLength);
      e.preventDefault(); updatePart("street", text, true);
    }} />
    <div className={styles.locality} style={{ gridTemplateColumns: `repeat(${Math.min(localFields.length, 3)}, minmax(0, 1fr))` }}>{localFields.map(field => <label key={field}>{addressFieldLabel(field, country)}<input value={parts[field]} maxLength={240} autoComplete={field === "postalCode" ? "postal-code" : field === "region" ? "address-level1" : field === "city" ? "address-level2" : "address-level3"} onChange={e => updatePart(field, e.target.value)} /></label>)}</div>
    <div className={styles.coordinates}>
      {(["latitude", "longitude"] as const).map(axis => <label key={axis}>{axis === "latitude" ? "Latitude" : "Longitude"}<input aria-label={axis === "latitude" ? "Latitude" : "Longitude"} type="number" step="any" min={axis === "latitude" ? -90 : -180} max={axis === "latitude" ? 90 : 180} value={value[axis] ?? ""} onChange={e => { cancelLookup(); pinAddress.current = address; onChange({ lookup: undefined, [axis]: e.target.value === "" ? undefined : Number(e.target.value) }); }} /></label>)}
      <div ref={trigger}><Popover.Root open={lookupMode === "coordinates" && !!matches.length} onOpenChange={open => { if (!open) setMatches([]); }}><Popover.Anchor asChild><Button className={styles.autofill} aria-label="Autofill coordinates" icon="search" type="button" busy={busy && lookupMode === "coordinates"} disabled={busy || address.trim().length < 3 || /^https?:\/\//i.test(address)} onClick={() => void lookup()}>Autofill<span className={styles.fullLabel}> coordinates</span></Button></Popover.Anchor>
      <Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}>{choices}</Popover.Portal></Popover.Root></div>
    </div>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </div>;
}
