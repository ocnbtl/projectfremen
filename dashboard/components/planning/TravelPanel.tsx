"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { WorkspaceButton as Button, WorkspaceFeedback, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import type { PersonalTrip } from "../../lib/modules/personal-life/types";
import { countryDestinations, stateDestinations, travelCountries, travelStatusLabels, travelStatuses, type TravelDestination, type TravelKind, type TravelRecord, type TravelStatus, type TravelVisit } from "../../lib/modules/planning/travel";
import TravelFlag from "./TravelFlag";
import TravelSavedRow from "./TravelSavedRow";
import TravelFilters from "./TravelFilters";
import { travelKinds as kinds, filterTravelEntries } from "../../lib/modules/planning/travel-filters";
import TravelSheetBody from "./TravelSheetBody";
import TravelVisitEditor from "./TravelVisitEditor";
import { buildTravelEntries } from "../../lib/modules/planning/travel-sync";
import { travelKindIcons, travelStatusIcons } from "../../lib/modules/planning/travel-icons";
import styles from "./TravelPanel.module.css";
async function request<T>(url:string,init?:RequestInit):Promise<T>{const r=await fetch(url,{cache:"no-store",...init});const data=await r.json();if(!r.ok)throw new Error(data.error || "Travel could not be loaded");return data;}
export default function TravelPanel({open,onClose,trips,onPlan,onShow,onPlanDestination,selectedId}:{open:boolean;selectedId?:string;onPlanDestination:(destination:TravelDestination)=>void;onClose:()=>void;trips:PersonalTrip[];onPlan:(trip?:PersonalTrip)=>void;onShow:(destination:TravelDestination)=>void}){
  const [tab,setTab]=useState("record"),[kind,setKind]=useState<TravelKind>("country"),[country,setCountry]=useState("US"),[query,setQuery]=useState(""),[status,setStatus]=useState<TravelStatus>("visited"),[mode,setMode]=useState("mine");
  const [savedKinds,setSavedKinds]=useState<TravelKind[]>([]),[savedStatuses,setSavedStatuses]=useState<TravelStatus[]>([]);
  const [records,setRecords]=useState<TravelRecord[]>([]),[items,setItems]=useState<TravelDestination[]>([]),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(""),[catalogError,setCatalogError]=useState(""),[busy,setBusy]=useState(""),[retry,setRetry]=useState(0),[notice,setNotice]=useState(""),[custom,setCustom]=useState(false),[customName,setCustomName]=useState("");
  const [expanded,setExpanded]=useState(""), [loadedTrips,setLoadedTrips]=useState<PersonalTrip[]>(trips);
  const entries=useMemo(()=>buildTravelEntries(records,loadedTrips),[records,loadedTrips]);
  const reduced=useReducedMotion();
  useEffect(()=>{if(open&&selectedId){setTab("record");setExpanded(selectedId);setKind(selectedId.split(":")[0] as TravelKind);setSavedKinds([]);setSavedStatuses([]);setMode("mine");setQuery("");setStatus("visited");}},[open,selectedId]);
  useEffect(()=>{if(!open)return;let active=true;setMode("mine");setQuery("");setStatus("visited");setReady(false);setError("");setNotice("");request<{records:TravelRecord[];trips:PersonalTrip[]}>("/api/map/travel").then(d=>{if(active){setRecords(d.records);setLoadedTrips(d.trips);setReady(true);}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[open,retry]);
  useEffect(()=>{setPage(0);setItems([]);setCustom(false);},[kind,country,query]);
  useEffect(()=>{
    if(!open || tab!=="record" || mode!=="browse" || kind==="country"||kind==="state"){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);setCatalogError("");
    const timer=setTimeout(()=>{request<{items:TravelDestination[];hasMore:boolean}>(`/api/map/travel/catalog?kind=${kind}&country=${country}&q=${encodeURIComponent(query)}&page=${page}`,{signal:controller.signal}).then(d=>{setItems(old=>page?[...new Map([...old,...d.items].map(x=>[x.id,x])).values()]:d.items);setHasMore(d.hasMore);}).catch(e=>{if(!controller.signal.aborted)setCatalogError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});},query?350:0);
    return()=>{clearTimeout(timer);controller.abort()};
  },[open,kind,country,query,page,retry,tab,mode]);
  const matchingRecords=entries.filter(r=>r.kind===kind&&(kind==="country"||kind==="state"||r.country===country));
  const destinations=useMemo(()=>{
    if(mode==="mine")return filterTravelEntries(entries,savedKinds,savedStatuses,query);
    const base=kind==="country"?countryDestinations:kind==="state"?stateDestinations:[...items,...matchingRecords];
    return [...new Map(base.map(x=>[x.id,x])).values()].filter(d=>d.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
  },[mode,kind,items,entries,country,query,savedKinds,savedStatuses]);
  const [visible,setVisible]=useState(36);
  const quickStatus=mode==="browse"?status:null;
  const hasSavedFilters=!!(savedKinds.length||savedStatuses.length);
  function chooseStatus(value:TravelStatus){setStatus(value);setExpanded("");}
  function browse(){setMode("browse");setKind(savedKinds.length===1?savedKinds[0]:kind);setStatus(savedStatuses.length===1&&!(savedStatuses[0]==="lived"&&["park","landmark"].includes(savedKinds[0]||kind))?savedStatuses[0]:"visited");setExpanded("");setQuery("");}
  function showSaved(){setMode("mine");setExpanded("");setQuery("");setCustom(false);}
  useEffect(()=>setVisible(36),[mode,kind,country,query,status,savedKinds,savedStatuses]);
  async function toggle(destination:TravelDestination,value:TravelStatus){
    if(busy || !ready)return;
    setBusy(destination.id);setError("");setNotice("");
    const previous=records.find(r=>r.id===destination.id), selected=previous?.statuses || [];
    const statuses=selected.includes(value)?selected.filter(s=>s!==value):[...selected,value];
    try {const data=await request<{record:TravelRecord}>("/api/map/travel",{method:"PUT",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({record:{...destination,visits:previous?.visits||[],statuses},expectedUpdatedAt:previous?.updatedAt || null})});setRecords(old=>[...old.filter(r=>r.id!==destination.id),data.record]);setNotice(`${destination.name} updated`);}
    catch(e){setError(e instanceof Error?e.message:"Could not save travel status");}finally{setBusy("")}
  }
  async function saveVisits(destination:TravelDestination,visits:TravelVisit[]) {
    if(busy||!ready)return false;
    const previous=records.find(r=>r.id===destination.id);
    setBusy(destination.id);setError("");
    try {
      const statuses=visits.length?[...new Set([...(previous?.statuses||[]),"visited" as const])]:previous?.statuses||[];
      const data=await request<{record:TravelRecord}>("/api/map/travel",{method:"PUT",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({record:{...destination,statuses,visits},expectedUpdatedAt:previous?.updatedAt||null})});
      setRecords(old=>[...old.filter(r=>r.id!==destination.id),data.record]);setNotice("Visit saved. Calendar is up to date.");return true;
    }catch(e){setError(e instanceof Error?e.message:"Could not save visit");return false;}finally{setBusy("")}
  }
  return <WorkspaceSheet open={open} onClose={onClose} title="Travel" presentation="center" className={styles.sheet}>
    <TravelSheetBody>
      <div className={styles.tabs} role="tablist" aria-label="Travel sections">{[{id:"record",label:"Been & going",icon:"travel" as const},{id:"trips",label:"Plan a trip",icon:"location" as const}].map(t=><button type="button" role="tab" aria-selected={tab===t.id} key={t.id} onClick={()=>setTab(t.id)}>{tab===t.id&&<motion.span className={styles.tabIndicator} layoutId="travel-section" transition={{duration:reduced?0:.28,ease:[.22,1,.36,1]}}/>}<span><UnigentamosIcon role={t.icon} size={18}/>{t.label}</span></button>)}</div>
      <WorkspaceFeedback error={error}/>{error&&<Button intent="quiet" onClick={()=>setRetry(x=>x+1)}>Reload travel</Button>}
      <span className={styles.srOnly} role="status">{notice}</span>
      <motion.div key={`${tab}-${mode}`} initial={{opacity:0,y:reduced?0:3}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}}>
      {tab==="trips"?<div className={styles.tripSection}><div className={styles.sectionHeading}><div><h2>Your itineraries</h2><p>Build a route, add stops, and keep the details together.</p></div><Button intent="primary" icon="plus" onClick={()=>onPlan()}>Plan a trip</Button></div><div className={styles.cards}>{loadedTrips.map(t=><button type="button" className={styles.tripCard} key={t.id} onClick={()=>onPlan(t)}><UnigentamosIcon role="travel" size={20}/><span><strong>{t.name}</strong><small>{t.stops?.length || 1} stops · {t.startDate || "Dates to decide"}</small></span><UnigentamosIcon role="chevron-right" size={16}/></button>)}</div>{!loadedTrips.length&&<p className={styles.empty}>Your next adventure starts here. Create an itinerary with the places you want to visit.</p>}</div>:<>
      <div className={styles.sectionHeading}><div><h2>{mode==="mine"?<>Saved places <span className={styles.headingCount} aria-label={`${destinations.length} places`}>{destinations.length}</span></>:"Add places"}</h2><p>{mode==="mine"?"Your travel history and plans.":"Choose a status, then check places to save."}</p></div><div className={styles.saveControls}>{mode==="mine"?<Button intent="primary" icon="plus" onClick={browse}>Add places</Button>:<Button icon="back" onClick={showSaved}>Back to saved</Button>}<div className={styles.saveState} role="status" aria-live="polite">{busy?"Saving…":error?"Not saved":notice?<><UnigentamosIcon role="check" size={14}/>Saved</>:null}</div></div></div>
      {mode==="browse"&&<div className={styles.markStatus}><span>Mark as</span><div className={styles.statusPicker} role="radiogroup" aria-label="Status to save">
        {travelStatuses.filter(s=>s!=="lived"||!["park","landmark"].includes(kind)).map(s=><label key={s} data-selected={status===s}><input type="radio" name="travel-status" value={s} checked={status===s} onChange={()=>chooseStatus(s)}/><span><UnigentamosIcon role={travelStatusIcons[s]} size={16}/><span>{travelStatusLabels[s]}</span></span></label>)}
      </div></div>}
      <div className={`${styles.filters} ${styles.travelFilters}`}><label className={styles.search} data-field-shell><UnigentamosIcon role="search" size={16}/><input type="search" aria-label="Search travel destinations" placeholder="Search" value={query} onChange={e=>setQuery(e.target.value)}/></label>{mode==="mine"?<TravelFilters kinds={savedKinds} statuses={savedStatuses} onKinds={setSavedKinds} onStatuses={setSavedStatuses}/>:(<SelectField contained className={styles.kindFilter} optionIcons={travelKindIcons} aria-label="Destination type" value={kind} onChange={e=>{const next=e.target.value as TravelKind;setKind(next);setQuery("");if(status==="lived"&&["park","landmark"].includes(next))setStatus("visited")}} triggerContent={<span className={styles.filterLabel}><UnigentamosIcon role={travelKindIcons[kind]} size={16}/><span>{kinds.find(k=>k.value===kind)?.label}</span><UnigentamosIcon role="chevron-down" size={14}/></span>}>{kinds.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}</SelectField>)}{mode==="browse"&&kind!=="country"&&kind!=="state"&&<SelectField contained className={styles.countryFilter} searchable aria-label="Destination country" value={country} onChange={e=>setCountry(e.target.value)}>{travelCountries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</SelectField>}</div>
      {mode==="mine"&&hasSavedFilters&&<button type="button" className={styles.clearSavedFilters} onClick={()=>{setSavedKinds([]);setSavedStatuses([]);}}>Clear filters</button>}
      {mode==="browse"&&kind!=="country"&&kind!=="state"&&<div className={styles.resultHeading}><button type="button" onClick={()=>{setCustom(!custom);setCustomName(query)}}>Add by name</button></div>}
      {custom&&<form className={styles.custom} onSubmit={e=>{e.preventDefault();const name=customName.trim();if(!name)return;const value=quickStatus||"want";const existing=records.find(r=>r.kind===kind&&r.country===country&&r.name.toLowerCase()===name.toLowerCase());if(!existing?.statuses.includes(value))void toggle(existing || {id:`${kind}:custom:${crypto.randomUUID()}`,kind,country,name},value);setCustom(false);setSavedKinds([kind]);setSavedStatuses([value]);showSaved()}}><label>Destination name<input required maxLength={240} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="A place missing from the catalogue"/></label><Button type="submit" disabled={!!busy||!ready} intent="primary">Add to {travelStatusLabels[quickStatus||"want"].toLowerCase()}</Button></form>}
      {catalogError&&mode==="browse"&&kind!=="country"&&kind!=="state"&&<div className={styles.catalogError} role="status">{catalogError}<Button intent="quiet" onClick={()=>setRetry(x=>x+1)}>Try again</Button></div>}
      <div className={mode==="mine"?styles.placeList:styles.cards} aria-busy={loading||!ready}>{destinations.slice(0,visible).map(d=>{
        const saved=entries.find(r=>r.id===d.id);
        const entry=saved||{...d,statuses:[],visits:[],updatedAt:"",tripVisits:[]};
        const expandedHere=expanded===d.id;
        const sourceLocked=quickStatus&&(entry.tripVisits.some(v=>v.status===quickStatus)||(quickStatus==="visited"&&!!entry.visits?.length));
        const catalogueHint=sourceLocked?"From visits or trips · edit in Details":d.kind==="country"?"":d.description||travelCountries.find(c=>c.code===d.country)?.name;
        return <article key={d.id} className={styles.card} data-expanded={expandedHere} data-quick={!!quickStatus} data-marked={quickStatus?entry.statuses.includes(quickStatus):!!saved?.statuses.length}>
          {quickStatus&&<label className={styles.quickChoice} title={sourceLocked?"Managed by visit dates or a linked trip. Open Details to edit.":undefined}><input type="checkbox" aria-label={`${travelStatusLabels[quickStatus]}: ${d.name}`} checked={entry.statuses.includes(quickStatus)} disabled={!ready||!!busy||!!sourceLocked} onChange={()=>void toggle(d,quickStatus)}/><span aria-hidden="true"><UnigentamosIcon role="check" size={14}/></span></label>}
          {mode==="mine"?<TravelSavedRow entry={entry} expanded={expandedHere} onExpand={()=>setExpanded(expandedHere?"":d.id)}/>:<header><TravelFlag destination={d}/><button type="button" className={styles.placeIdentity} aria-expanded={expandedHere} onClick={()=>setExpanded(expandedHere?"":d.id)}><h3>{d.name}</h3><small>{catalogueHint}</small></button><button type="button" data-icon-button="compact" aria-label={`Details for ${d.name}`} aria-expanded={expandedHere} onClick={()=>setExpanded(expandedHere?"":d.id)}><UnigentamosIcon role={expandedHere?"chevron-down":"chevron-right"} size={16}/></button></header>}
          <AnimatePresence initial={false}>{expandedHere&&<motion.div key="details" initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.28,ease:[.22,1,.36,1]}} className={styles.details}>
          <div className={styles.statuses}>{travelStatuses.filter(s=>s!=="lived"||!["park","landmark"].includes(d.kind)).map(s=><button type="button" key={s} disabled={!ready||!!busy||entry.tripVisits.some(v=>v.status===s)||(s==="visited"&&!!entry.visits?.length)} title={entry.tripVisits.some(v=>v.status===s)?"Managed by a linked trip":s==="visited"&&entry.visits?.length?"Recorded by your visit dates":undefined} aria-label={`${travelStatusLabels[s]}: ${d.name}`} aria-pressed={entry.statuses.includes(s)} onClick={()=>void toggle(d,s)}><UnigentamosIcon role={travelStatusIcons[s]} size={16}/><span>{travelStatusLabels[s]}</span></button>)}</div>
            {(!!entry.tripVisits.length||!!entry.visits?.length)&&<p className={styles.hint}>Dated visits and linked trips update your selections automatically. Edit them below.</p>}
            <TravelVisitEditor entry={entry} busy={!!busy} onSave={visits=>saveVisits(d,visits)} onTrip={id=>{const trip=loadedTrips.find(t=>t.id===id);if(trip)onPlan(trip)}} onPlan={()=>onPlanDestination(d)}/>
            {d.latitude!==undefined&&<button type="button" className={styles.textAction} onClick={()=>onShow(d)}><UnigentamosIcon role="location" size={16}/>Show on map</button>}
          </motion.div>}</AnimatePresence>
        </article>;
      })}</div>
      {loading&&<p className={styles.empty} role="status">Finding destinations…</p>}{!loading&&!destinations.length&&<p className={styles.empty}>{mode==="mine"?hasSavedFilters||query?"No saved places match these filters. Clear filters or change your search.":"No saved places yet. Choose Add places to start your travel record.":kind==="city"&&query.length<3?"Search for a city or town to add it to your travel record.":"No destinations match. Try another search or add a place by name."}</p>}
      {destinations.length>visible?<Button onClick={()=>setVisible(n=>n+36)}>Show more</Button>:hasMore&&mode==="browse"&&kind!=="country"&&kind!=="state"&&<Button disabled={loading} onClick={()=>{setPage(p=>p+1);setVisible(n=>n+100)}}>Load more destinations</Button>}
      {mode==="browse"&&kind!=="country"&&kind!=="state"&&<p className={styles.source}>Catalogue: <a href={kind==="city"?"https://www.openstreetmap.org/copyright":kind==="landmark"?"https://data.unesco.org/explore/dataset/whc001/":country==="US"?"https://www.nps.gov/aboutus/national-park-system.htm":"https://www.wikidata.org"} target="_blank" rel="noreferrer">{kind==="city"?"OpenStreetMap via Photon":kind==="landmark"?"UNESCO World Heritage":country==="US"?"National Park Service":"Wikidata"}</a>{kind==="landmark"&&<> · Search: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></>}. Coverage varies by country; add missing places by name. Your travel record is private.</p>}
      </>}
      </motion.div>
    </TravelSheetBody>
  </WorkspaceSheet>;
}
