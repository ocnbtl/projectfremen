"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { WorkspaceButton as Button, WorkspaceFeedback, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { PersonalTrip } from "../../lib/modules/personal-life/types";
import { countryDestinations, stateDestinations, travelCountries, travelStatusLabels, travelStatuses, type TravelDestination, type TravelKind, type TravelRecord, type TravelStatus } from "../../lib/modules/planning/travel";
import styles from "./TravelPanel.module.css";
const kinds: {value:TravelKind;label:string}[]=[{value:"country",label:"Countries"},{value:"state",label:"U.S. states"},{value:"city",label:"Cities"},{value:"landmark",label:"Landmarks"},{value:"park",label:"National parks"}];
async function request<T>(url:string,init?:RequestInit):Promise<T>{const r=await fetch(url,{cache:"no-store",...init});const data=await r.json();if(!r.ok)throw new Error(data.error || "Travel could not be loaded");return data;}
export default function TravelPanel({open,onClose,trips,onPlan,onShow}:{open:boolean;onClose:()=>void;trips:PersonalTrip[];onPlan:(trip?:PersonalTrip)=>void;onShow:(destination:TravelDestination)=>void}){
  const [tab,setTab]=useState("record"),[kind,setKind]=useState<TravelKind>("country"),[country,setCountry]=useState("US"),[query,setQuery]=useState(""),[status,setStatus]=useState("all"),[mode,setMode]=useState("browse");
  const [records,setRecords]=useState<TravelRecord[]>([]),[items,setItems]=useState<TravelDestination[]>([]),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(""),[catalogError,setCatalogError]=useState(""),[busy,setBusy]=useState(""),[retry,setRetry]=useState(0),[notice,setNotice]=useState(""),[custom,setCustom]=useState(false),[customName,setCustomName]=useState("");
  const reduced=useReducedMotion();
  useEffect(()=>{if(!open)return;let active=true;setReady(false);setError("");request<{records:TravelRecord[]}>("/api/map/travel").then(d=>{if(active){setRecords(d.records);setReady(true);}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[open,retry]);
  useEffect(()=>{setPage(0);setItems([]);setCustom(false);},[kind,country,query]);
  useEffect(()=>{
    if(!open || tab!=="record" || mode!=="browse" || kind==="country"||kind==="state")return;
    const controller=new AbortController();setLoading(true);setCatalogError("");
    const timer=setTimeout(()=>{request<{items:TravelDestination[];hasMore:boolean}>(`/api/map/travel/catalog?kind=${kind}&country=${country}&q=${encodeURIComponent(query)}&page=${page}`,{signal:controller.signal}).then(d=>{setItems(old=>page?[...new Map([...old,...d.items].map(x=>[x.id,x])).values()]:d.items);setHasMore(d.hasMore);}).catch(e=>{if(!controller.signal.aborted)setCatalogError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});},query?350:0);
    return()=>{clearTimeout(timer);controller.abort()};
  },[open,kind,country,query,page,retry,tab,mode]);
  const matchingRecords=records.filter(r=>r.kind===kind&&r.statuses.length&&(kind==="country"||kind==="state"||r.country===country));
  const destinations=useMemo(()=>{
    const base=mode==="mine"?matchingRecords:kind==="country"?countryDestinations:kind==="state"?stateDestinations:[...items,...matchingRecords];
    return [...new Map(base.map(x=>[x.id,x])).values()].filter(d=>d.name.toLowerCase().includes(query.toLowerCase())&&(status==="all"||records.find(r=>r.id===d.id)?.statuses.includes(status as TravelStatus))).sort((a,b)=>a.name.localeCompare(b.name));
  },[mode,kind,items,records,country,query,status]);
  const [visible,setVisible]=useState(36);
  useEffect(()=>setVisible(36),[mode,kind,country,query,status]);
  async function toggle(destination:TravelDestination,value:TravelStatus){
    if(busy || !ready)return;
    setBusy(destination.id);setError("");setNotice("");
    const previous=records.find(r=>r.id===destination.id), selected=previous?.statuses || [];
    const statuses=selected.includes(value)?selected.filter(s=>s!==value):[...selected,value];
    try {const data=await request<{record:TravelRecord}>("/api/map/travel",{method:"PUT",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({record:{...destination,statuses},expectedUpdatedAt:previous?.updatedAt || null})});setRecords(old=>[...old.filter(r=>r.id!==destination.id),data.record]);setNotice(`${destination.name} updated`);}
    catch(e){setError(e instanceof Error?e.message:"Could not save travel status");}finally{setBusy("")}
  }
  return <WorkspaceSheet open={open} onClose={onClose} title="Travel" presentation="center" className={styles.sheet}>
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Travel sections">{[{id:"record",label:"Been & going",icon:"travel" as const},{id:"trips",label:"Plan a trip",icon:"location" as const}].map(t=><button type="button" role="tab" aria-selected={tab===t.id} key={t.id} onClick={()=>setTab(t.id)}>{tab===t.id&&<motion.span className={styles.tabIndicator} layoutId="travel-section" transition={{duration:reduced?0:.2}}/>}<span><UnigentamosIcon role={t.icon} size={18}/>{t.label}</span></button>)}</div>
      <WorkspaceFeedback error={error}/>{error&&<Button intent="quiet" onClick={()=>setRetry(x=>x+1)}>Reload travel</Button>}
      <span className={styles.srOnly} role="status">{notice}</span>
      <AnimatePresence mode="wait" initial={false}><motion.div key={tab} initial={{opacity:0,y:reduced?0:3}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduced?0:.12}}>
      {tab==="trips"?<div className={styles.tripSection}><div className={styles.sectionHeading}><div><h2>Your itineraries</h2><p>Build a route, add stops, and keep the details together.</p></div><Button intent="primary" icon="plus" onClick={()=>onPlan()}>Plan a trip</Button></div><div className={styles.cards}>{trips.map(t=><button type="button" className={styles.tripCard} key={t.id} onClick={()=>onPlan(t)}><UnigentamosIcon role="travel" size={20}/><span><strong>{t.name}</strong><small>{t.stops?.length || 1} stops · {t.startDate || "Dates to decide"}</small></span><UnigentamosIcon role="chevron-right" size={16}/></button>)}</div>{!trips.length&&<p className={styles.empty}>Your next adventure starts here. Create an itinerary with the places you want to visit.</p>}</div>:<>
      <div className={styles.summary}>{travelStatuses.map(s=><button type="button" key={s} aria-pressed={status===s} onClick={()=>setStatus(status===s?"all":s)}><strong>{matchingRecords.filter(r=>r.statuses.includes(s)).length}</strong><span>{travelStatusLabels[s]}</span></button>)}</div>
      <div className={styles.categories} role="tablist" aria-label="Destination types">{kinds.map(k=><button type="button" role="tab" key={k.value} aria-selected={kind===k.value} onClick={()=>{setKind(k.value);setQuery("");setStatus("all")}}>{k.label}</button>)}</div>
      <div className={styles.filters}><label className={styles.search} data-field-shell><UnigentamosIcon role="search" size={16}/><input type="search" aria-label="Search travel destinations" placeholder={`Search ${kinds.find(k=>k.value===kind)?.label.toLowerCase()}`} value={query} onChange={e=>setQuery(e.target.value)}/></label>{kind!=="country"&&kind!=="state"&&<SelectField searchable aria-label="Destination country" value={country} onChange={e=>setCountry(e.target.value)}>{travelCountries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</SelectField>}<SelectField aria-label="Show destinations" value={mode} onChange={e=>setMode(e.target.value)}><option value="browse">Browse all</option><option value="mine">My places</option></SelectField></div>
      <div className={styles.resultHeading}><span>{status!=="all"?travelStatusLabels[status as TravelStatus]:mode==="mine"?"Your travel record":"Choose a place, then mark your experience"}</span>{status!=="all"&&<button type="button" onClick={()=>setStatus("all")}>Clear filter</button>}{kind!=="country"&&kind!=="state"&&<button type="button" onClick={()=>{setCustom(!custom);setCustomName(query)}}>Add by name</button>}</div>
      {custom&&<form className={styles.custom} onSubmit={e=>{e.preventDefault();const name=customName.trim();if(!name)return;const existing=records.find(r=>r.kind===kind&&r.country===country&&r.name.toLowerCase()===name.toLowerCase());if(!existing?.statuses.includes("want"))void toggle(existing || {id:`${kind}:custom:${crypto.randomUUID()}`,kind,country,name},"want");setCustom(false);setMode("mine");setQuery("")}}><label>Destination name<input required maxLength={240} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="A place missing from the catalogue"/></label><Button type="submit" disabled={!!busy||!ready} intent="primary">Add to wishlist</Button></form>}
      {catalogError&&mode==="browse"&&kind!=="country"&&kind!=="state"&&<div className={styles.catalogError} role="status">{catalogError}<Button intent="quiet" onClick={()=>setRetry(x=>x+1)}>Try again</Button></div>}
      <div className={styles.cards} aria-busy={loading||!ready}>{destinations.slice(0,visible).map(d=>{const saved=records.find(r=>r.id===d.id);return <article key={d.id} className={styles.card} data-marked={!!saved?.statuses.length}><header><div><h3>{d.name}</h3>{d.description&&<small>{d.description}</small>}</div>{d.latitude!==undefined&&<button type="button" data-icon-button="compact" aria-label={`Show ${d.name} on map`} onClick={()=>onShow(d)}><UnigentamosIcon role="location" size={16}/></button>}</header><div className={styles.statuses}>{travelStatuses.filter(s=>s!=="lived"||!["park","landmark"].includes(kind)).map(s=><button type="button" key={s} disabled={!ready||!!busy} aria-label={`${travelStatusLabels[s]}: ${d.name}`} aria-pressed={saved?.statuses.includes(s)||false} onClick={()=>void toggle(d,s)}>{saved?.statuses.includes(s)&&<UnigentamosIcon role="check" size={12}/>}<span>{travelStatusLabels[s]}</span></button>)}</div></article>})}</div>
      {loading&&<p className={styles.empty} role="status">Finding destinations…</p>}{!loading&&!destinations.length&&<p className={styles.empty}>{mode==="mine"?"Nothing marked here yet. Browse destinations to start your travel record.":kind==="city"&&query.length<3?"Search for a city or town to add it to your travel record.":"No destinations match. Try another search or add a place by name."}</p>}
      {destinations.length>visible?<Button onClick={()=>setVisible(n=>n+36)}>Show more</Button>:hasMore&&mode==="browse"&&kind!=="country"&&kind!=="state"&&<Button disabled={loading} onClick={()=>{setPage(p=>p+1);setVisible(n=>n+100)}}>Load more destinations</Button>}
      {kind!=="country"&&kind!=="state"&&<p className={styles.source}>Catalogue: <a href={kind==="city"?"https://www.openstreetmap.org/copyright":kind==="landmark"?"https://data.unesco.org/explore/dataset/whc001/":country==="US"?"https://www.nps.gov/aboutus/national-park-system.htm":"https://www.wikidata.org"} target="_blank" rel="noreferrer">{kind==="city"?"OpenStreetMap via Photon":kind==="landmark"?"UNESCO World Heritage":country==="US"?"National Park Service":"Wikidata"}</a>{kind==="landmark"&&<> · Search: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></>}. Coverage varies by country; add missing places by name. Your travel record is private.</p>}
      </>}
      </motion.div></AnimatePresence>
    </div>
  </WorkspaceSheet>;
}
