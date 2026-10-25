"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import { mapAnalysis, MAP_METRICS, type MapAnalysisSettings, type MapData } from "../../lib/modules/planning/map-analysis";
import { MAP_CATALOG, MAP_PALETTES } from "../../lib/modules/planning/map-catalog";
import styles from "./MapWorkspace.module.css";
import countryCatalog from "../../data/map/world-regions-catalog.json";
import { STATE_FLAGS } from "../../lib/modules/planning/map-flags";
export type AnalysisResult = NonNullable<ReturnType<typeof mapAnalysis>> & { label: string; data: MapData[]; scale: string; metrics: MapAnalysisSettings["metrics"] };
const usLevels = ["country", "state", "county", "place", "tract"];
const categoryIcons: Record<string,string> = {People:"module-people",Economy:"module-finance",Infrastructure:"organization",Environment:"module-map"};
const format = (value: number) => new Intl.NumberFormat(undefined, {notation:value >= 10000 ? "compact" : "standard", maximumFractionDigits:1}).format(value);
function DataHelp({label,children}:{label:string;children:ReactNode}) {
 return <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.dataInfoButton} aria-label={label}><UnigentamosIcon role="information" size={16}/></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.dataHelp} style={moduleThemeVariables("map") as CSSProperties} sideOffset={6} collisionPadding={12} aria-label={label}><header><strong>{label}</strong><Popover.Close asChild><button type="button" className={styles.dataInfoButton} aria-label={`Close ${label}`}><UnigentamosIcon role="close" size={16}/></button></Popover.Close></header>{children}</Popover.Content></Popover.Portal></Popover.Root>;
}
export default function MapDataExplorer({level,state,states,settings,onLevel,onState,onSettings,onResult,loadKey=0}:{
 level:string;state:string;states:string[][];settings:MapAnalysisSettings;onLevel:(v:string)=>void;onState:(v:string)=>void;onSettings:(v:MapAnalysisSettings)=>void;onResult:(v:AnalysisResult|undefined)=>void;loadKey?:number;
}) {
 const [data,setData]=useState<Record<string,MapData>>({}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [sort,setSort]=useState("value"),[onlyMatches,setOnlyMatches]=useState(false),[page,setPage]=useState(0),[regionQuery,setRegionQuery]=useState("");
 const [compact,setCompact]=useState(false);
 useEffect(()=>{const media=window.matchMedia("(max-width:760px)");const update=()=>{setCompact(media.matches);setPage(0);};update();media.addEventListener("change",update);return ()=>media.removeEventListener("change",update);},[]);
 const [category,setCategory]=useState("People"),[tab,setTab]=useState<"layers"|"regions">("layers");
 const countryCode=settings.countryCode || "USA", international=countryCode!=="USA",country=level==="country";
 const levels=international?usLevels.slice(0,3):usLevels;
 const labels=international?["Country","Province / state","District / county"]:["Country","State","County","City / town","Tract"];
 const territory=countryCatalog.find(c=>c.code===countryCode),coverage=territory?.levels[level==="state"?"1":"2"];
 const geographyKey=JSON.stringify([level,state,countryCode]);
 const key=JSON.stringify([geographyKey,settings.metrics.map(m=>m.metric)]),currentKey=useRef(key),request=useRef(0);
 currentKey.current=key;
 const [loadedKey,setLoadedKey]=useState("");
 const available=country?Object.keys(MAP_CATALOG).filter(k=>k.startsWith("world-")):international?["regional-population","regional-density"]:["population","age","income"];
 const categories=[...new Set(available.map(m=>MAP_CATALOG[m].category))],activeCategory=categories.includes(category)?category:categories[0];
 const invalidRange=settings.metrics.some(m=>m.min!==undefined&&m.max!==undefined&&m.min>m.max);
 const result=useMemo(()=>{
  if(loadedKey!==geographyKey || !settings.metrics.length || settings.metrics.some(m=>!data[m.metric]))return undefined;
  try { const selected=settings.metrics.map(m=>data[m.metric]),value=mapAnalysis(selected,settings);return value?{...value,label:MAP_METRICS[settings.metrics[0].metric],data:selected,scale:settings.scale,metrics:settings.metrics}:undefined; }catch{return undefined;}
 },[data,loadedKey,geographyKey,settings]);
 useEffect(()=>{onResult(invalidRange?undefined:result);setPage(0);},[result,onResult,invalidRange]);
 function changeLevel(next:string){onLevel(next);if((next==="country")!==country)onSettings({...settings,metrics:[{metric:next==="country"?"world-population":international?"regional-population":"population"}]});setError("");}
 async function load(){
  const token=++request.current,queryKey=key;setBusy(true);setError("");
  try{
   const loaded=await Promise.all(settings.metrics.map(async({metric})=>{const response=await fetch(`/api/map?${new URLSearchParams({operation:"demographics",metric,level,state,country:countryCode})}`);const body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||"Map data unavailable");return body.data as MapData;}));
   mapAnalysis(loaded,settings);
   if(token===request.current&&queryKey===currentKey.current){setData(Object.fromEntries(settings.metrics.map((m,i)=>[m.metric,loaded[i]])));setLoadedKey(geographyKey);setTab("regions");}
  }catch(e){if(token===request.current)setError((e as Error).message);}finally{if(token===request.current)setBusy(false);}
 }
 useEffect(()=>{if(loadKey&&settings.metrics.length)void load();
 // Saved views explicitly request a load; editing controls does not.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[loadKey]);
 const shown=(result?.rows||[]).filter(r=>r.name.toLowerCase().includes(regionQuery.trim().toLowerCase())).filter(r=>!onlyMatches||(r.matches&&r.value!==null)).sort((a,b)=>sort==="name"?a.name.localeCompare(b.name):a.value===null?(b.value===null?0:1):b.value===null?-1:b.value-a.value);
 const pageSize=compact?(settings.metrics.length>1?4:6):(settings.metrics.length>1?6:12),currentPage=Math.min(page,Math.max(0,Math.ceil(shown.length/pageSize)-1));
 const activeFilters=settings.metrics.filter(m=>m.min!==undefined||m.max!==undefined).length;
 const sources=<DataHelp label="Data sources">{result?result.data.map((d,i)=><section key={result.metrics[i].metric}><a href={d.sourceUrl} target="_blank" rel="noreferrer">{MAP_METRICS[result.metrics[i].metric]} · {d.source}</a><p>{d.geography} · {d.period} · {d.unit}</p><small>{d.rows.filter(r=>r.value!==null&&Number.isFinite(r.value)).length} of {d.rows.length} regions have data.{d.geometryNote && ` ${d.geometryNote}`}</small></section>):<><p>{country?"World Bank indicators for countries and territories. Each indicator uses its latest available observation.":international?`${territory?.name}: WorldPop population estimates, 2020. ${coverage?.available||0} of ${coverage?.regions||0} regions have estimates. Administrative levels vary by country; city and tract data are U.S. only.`:"U.S. Census American Community Survey, five-year estimates. Coverage and release details appear here after loading."}</p>{(!international||country)&&<a href={country?"https://data.worldbank.org":"https://www.census.gov/programs-surveys/acs"} target="_blank" rel="noreferrer">View source</a>}</>}</DataHelp>;
 const filterControl=(results=false)=><Popover.Root><Popover.Trigger asChild><Button icon="filter" aria-label={results?"Filter results":"Filter regions"} aria-pressed={!!activeFilters||results&&onlyMatches} title="Filter" /></Popover.Trigger><Popover.Portal><Popover.Content className={styles.dataFilterMenu} style={moduleThemeVariables("map") as CSSProperties} sideOffset={6} collisionPadding={12} aria-label="Region filters" onOpenAutoFocus={e=>e.preventDefault()}>
  <header><strong>Filter regions</strong><DataHelp label="How region filters work"><p>Set a minimum or maximum for a selected layer to highlight regions within that range. Empty limits include every value.</p><p>Match all requires every range; Match any requires at least one. Dimmed regions are outside your ranges. Gray regions have no data.</p></DataHelp></header>
  {settings.metrics.map((filter,i)=><div className={styles.dataRange} key={filter.metric}><span>{MAP_METRICS[filter.metric]} <small>{MAP_CATALOG[filter.metric].unit}</small></span>{(["min","max"] as const).map(bound=><input key={bound} type="number" min={0} step="any" aria-label={`${MAP_METRICS[filter.metric]} ${bound}`} placeholder={bound==="min"?"Min":"Max"} value={filter[bound]??""} onChange={e=>onSettings({...settings,metrics:settings.metrics.map((m,j)=>j===i?{...m,[bound]:e.target.value===""?undefined:Number(e.target.value)}:m)})}/>)}</div>)}
  <SelectField aria-label="Combine filters" value={settings.match} onChange={e=>onSettings({...settings,match:e.target.value as "all"|"any"})}><option value="all">Match all ranges</option><option value="any">Match any range</option></SelectField>
  {invalidRange&&<p role="alert" className={styles.dataError}>Minimum must be at or below maximum.</p>}
  {results&&<><label className={styles.dataMatchToggle}><input type="checkbox" checked={onlyMatches} onChange={e=>{setOnlyMatches(e.target.checked);setPage(0);}}/>Only matching regions</label><SelectField aria-label="Sort regions" value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="value">Highest value</option><option value="name">Name</option></SelectField></>}
  <button type="button" className={styles.dataTextButton} onClick={()=>{onSettings({...settings,metrics:settings.metrics.map(({metric})=>({metric}))});setOnlyMatches(false);}}>Reset filters</button>
 </Popover.Content></Popover.Portal></Popover.Root>;
 const showingResults=tab==="regions"&&!!result;
 return <section className={styles.layers} aria-label="Map data explorer">
  <div className={styles.dataTabs} role="group" aria-label="Explore data view"><span style={{transform:`translateX(${showingResults?100:0}%)`}} aria-hidden="true"/>{(["layers","regions"] as const).map(t=><button type="button" key={t} aria-pressed={(showingResults?"regions":"layers")===t} disabled={t==="regions"&&!result} onClick={()=>setTab(t)}><UnigentamosIcon role={t==="layers"?"build":"list"} size={16}/>{t==="layers"?"Layers":`Regions${result?` · ${result.rows.length}`:""}`}</button>)}</div>
  {!showingResults?<div className={styles.dataSetup}>
   <div className={styles.dataGeography}>
    <SelectField aria-label="Data country" searchable autoFocusSearch={false} value={country?"WORLD":countryCode} onChange={e=>{const next=e.target.value;onLevel(next==="WORLD"?"country":"state");onState("");onSettings({...settings,countryCode:next==="WORLD"?countryCode:next,metrics:[{metric:next==="WORLD"?"world-population":next==="USA"?"population":"regional-population"}]});setError("");}}>
     <option value="WORLD">All countries</option>{countryCatalog.map(c=><option key={c.code} value={c.code}><span className={styles.flagOption}>{/^[A-Z]{2}$/.test(c.iso2||"")&&<svg width="24" height="16" viewBox="0 0 513 342" aria-hidden="true"><use href={`/country-flags.svg#flag-${c.iso2}`}/></svg>}<span>{c.name}</span></span></option>)}
    </SelectField>
    <SelectField aria-label="Geographic detail" value={level} onChange={e=>changeLevel(e.target.value)}>{levels.map((v,i)=><option key={v} value={v}>{labels[i]}</option>)}</SelectField>{sources}
   </div>
   {!country&&!international&&level!=="state"&&<SelectField aria-label="Data state" searchable autoFocusSearch={false} value={state} onChange={e=>onState(e.target.value)}><option value="">Choose a state</option>{states.map(([value,label])=><option key={value} value={value}><span className={styles.flagOption}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/map-flags/${STATE_FLAGS[value]}.${value==="11"?"svg":"png"}`} width="24" height="16" alt=""/><span>{label}</span></span></option>)}</SelectField>}
   <div className={styles.dataSectionHeading}><strong>Data layers</strong><small>{settings.metrics.length} of 3 selected</small></div>
   <div className={styles.dataCategories} role="group" aria-label="Layer categories">{categories.map(c=><button key={c} type="button" aria-pressed={activeCategory===c} onClick={()=>setCategory(c)}><UnigentamosIcon role={categoryIcons[c]} size={18}/><span>{c}</span></button>)}</div>
   <div className={styles.dataLayerChoices} aria-label={`${activeCategory} layers`}>{available.filter(m=>MAP_CATALOG[m].category===activeCategory).map(metric=>{const item=MAP_CATALOG[metric],selected=settings.metrics.some(m=>m.metric===metric);return <button type="button" key={metric} title={item.description} aria-pressed={selected} disabled={!selected&&settings.metrics.length>=3} onClick={()=>onSettings({...settings,metrics:selected?settings.metrics.filter(m=>m.metric!==metric):[...settings.metrics,{metric}]})}><span>{item.name}</span><UnigentamosIcon role="check" size={14} style={{opacity:selected?1:0}}/></button>;})}</div>
   {!!settings.metrics.length&&<><div className={styles.dataSelectedLayers}>{settings.metrics.map(m=><button type="button" key={m.metric} aria-label={`Deselect ${MAP_METRICS[m.metric]}`} onClick={()=>onSettings({...settings,metrics:settings.metrics.filter(f=>f.metric!==m.metric)})}>{MAP_METRICS[m.metric]}<UnigentamosIcon role="close" size={13}/></button>)}</div>
   <div className={styles.dataSectionHeading}><strong>Map colors</strong>{filterControl()}</div>
   <div className={styles.dataColorControls}>
    <label>Color by<SelectField aria-label="Color by" value={settings.metrics[0].metric} onChange={e=>onSettings({...settings,metrics:[settings.metrics.find(m=>m.metric===e.target.value)!,...settings.metrics.filter(m=>m.metric!==e.target.value)]})}>{settings.metrics.map(m=><option key={m.metric} value={m.metric}>{MAP_METRICS[m.metric]}</option>)}</SelectField></label>
    <label>Scale<SelectField aria-label="Color scale" value={settings.scale} onChange={e=>onSettings({...settings,scale:e.target.value as "quantile"|"linear"})}><option value="quantile">Balanced bands</option><option value="linear">Equal ranges</option></SelectField></label>
    <fieldset className={styles.palettePicker}><legend>Palette</legend><div>{Object.entries(MAP_PALETTES).map(([key,palette])=><button type="button" key={key} aria-label={palette.name} title={palette.name} aria-pressed={(settings.palette||"terrain")===key} onClick={()=>onSettings({...settings,palette:key})}>{palette.colors.map(color=><i key={color} style={{background:color}}/>)}</button>)}</div></fieldset>
   </div></>}
   {error&&<p role="alert" className={styles.dataError}>{error}</p>}
   {invalidRange&&<p role="alert" className={styles.dataError}>Check your filter ranges: minimum must not exceed maximum.</p>}
   <div className={styles.applyDataBar}><Button icon="build" busy={busy} intent="primary" disabled={invalidRange||!settings.metrics.length||(!country&&!international&&level!=="state"&&!state)} onClick={()=>result?setTab("regions"):void load()}>{result?"View regions":`Apply ${settings.metrics.length||""} ${settings.metrics.length===1?"layer":"layers"}`}</Button></div>
  </div>:<div className={styles.dataResults}>
   <div className={styles.dataSectionHeading}><strong>{result.matched.toLocaleString()} matching <small>/ {result.rows.length.toLocaleString()}</small></strong><span className={styles.dataResultInfo}>{sources}<Button aria-label="Refresh data" busy={busy} disabled={invalidRange} onClick={()=>void load()}>Refresh</Button></span></div>
   {error&&<p role="alert" className={styles.dataError}>{error}</p>}
   <div className={styles.dataResultsTools}><label className={styles.dataSearch} data-field-shell><UnigentamosIcon role="search" size={16}/><input type="search" aria-label="Search data regions" placeholder="Search" value={regionQuery} onChange={e=>{setRegionQuery(e.target.value);setPage(0);}}/></label>{filterControl(true)}</div>
   {!shown.length&&<p className="work-muted">No regions match. Try another search or reset your filters.</p>}
   {invalidRange&&<p role="alert" className={styles.dataError}>Minimum must be at or below maximum. Adjust your filters to show regions.</p>}<div className={styles.dataRegionGrid}>{(invalidRange?[]:shown).slice(currentPage*pageSize,(currentPage+1)*pageSize).map(r=><article key={r.id} data-match={r.value===null?"missing":r.matches?"yes":"no"}><strong title={r.name}>{r.name}</strong>{r.comparisons.map((c,i)=><div key={i}><span>{c.label}</span><b title={c.value===null?"No data":`${c.value.toLocaleString()} ${c.unit}`}>{c.value===null?"No data":format(c.value)} <small>{c.unit}</small></b><small>{c.year||"Year unavailable"}{c.uncertainty!=null?` · ±${c.uncertainty.toLocaleString()}`:""}</small></div>)}{(r.value===null||!r.matches)&&<small>{r.value===null?"No data":"Outside filters"}</small>}</article>)}</div>
   {shown.length>pageSize&&<div className={styles.dataPagination}><Button icon="back" aria-label="Previous regions" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</Button><span>{currentPage*pageSize+1}–{Math.min((currentPage+1)*pageSize,shown.length)} of {shown.length}</span><Button icon="chevron-right" aria-label="Next regions" disabled={(currentPage+1)*pageSize>=shown.length} onClick={()=>setPage(currentPage+1)}>Next</Button></div>}
  </div>}
 </section>;
}
export function MapDataLegend({ result }: { result: AnalysisResult }) {
  const breaks = [result.min, ...result.thresholds, result.max];
  return (
    <aside className={styles.onMapLegend} aria-label="Map data scale">
      <strong>{result.label}</strong>
      <span>
        {result.data[0].geography} · {result.unit}
      </span>
      <span>{result.data[0].period}</span>
      <div>
        {result.colors.map((color, i) => (
          <i
            key={color}
            style={{ background: color }}
            title={`${format(breaks[i])} – ${format(breaks[i + 1])}`}
          />
        ))}
      </div>
      <div className={styles.scaleNumbers}>
        {breaks.map((v, i) => (
          <span key={i}>{format(v)}</span>
        ))}
      </div>
      <small>
        {result.scale === "quantile" ? "Balanced bands" : "Equal ranges"} ·{" "}
        {result.matched} matching regions · Gray: no data
      </small>
    </aside>
  );
}
