"use client";
import { useEffect, useState } from "react";
import { countryDestinations, stateDestinations, travelCountries, type TravelDestination, type TravelKind } from "../../lib/modules/planning/travel";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import TravelFlag from "./TravelFlag";
import { travelKindIcons } from "../../lib/modules/planning/travel-icons";
import styles from "./TravelPanel.module.css";

export default function TravelDestinationPicker({value,onChange}:{value:TravelDestination[];onChange:(next:TravelDestination[])=>void}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[kind,setKind]=useState<TravelKind>("country"),[country,setCountry]=useState("US"),[items,setItems]=useState<TravelDestination[]>([]),[message,setMessage]=useState("");
  useEffect(()=>{
    if(!open)return;
    if(kind==="country"||kind==="state"){setItems((kind==="country"?countryDestinations:stateDestinations).filter(d=>d.name.toLowerCase().includes(query.toLowerCase())));setMessage("");return;}
    setItems([]);
    if(query.trim().length<3){setMessage("Type at least 3 letters to find a destination.");return;}
    const controller=new AbortController();setMessage("Finding places…");
    const timer=setTimeout(async()=>{try{
      const response=await fetch(`/api/map/travel/catalog?kind=${kind}&country=${country}&q=${encodeURIComponent(query)}`,{signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Search unavailable");
      setItems(data.items);setMessage(data.items.length?"":"No matching destinations. Try a nearby city or country.");
    }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:"Search unavailable");}},300);
    return()=>{clearTimeout(timer);controller.abort()};
  },[open,query,kind,country]);
  return <div className={styles.destinationPicker}>
    <div className={styles.linkedDestinations}>{value.map(d=><span key={d.id}><TravelFlag destination={d}/>{d.name}<button type="button" aria-label={`Unlink ${d.name}`} onClick={()=>onChange(value.filter(x=>x.id!==d.id))}><UnigentamosIcon role="close" size={14}/></button></span>)}<button type="button" className={styles.textAction} aria-expanded={open} onClick={()=>setOpen(!open)}><UnigentamosIcon role={open?"close":"plus"} size={16}/>{open?"Done":"Link destination"}</button></div>
    {open&&<div className={styles.pickerSearch}>
      <div className={styles.filters}><label className={styles.search}><UnigentamosIcon role="search" size={16}/><input aria-label="Find a trip destination" placeholder="Search" value={query} onChange={e=>setQuery(e.target.value)}/></label><SelectField optionIcons={travelKindIcons} aria-label="Trip destination type" value={kind} onChange={e=>{setKind(e.target.value as TravelKind);setQuery("")}}><option value="country">Countries</option><option value="state">U.S. states</option><option value="city">Cities</option><option value="landmark">Landmarks</option><option value="park">National parks</option></SelectField></div>
      {kind!=="country"&&kind!=="state"&&<SelectField searchable aria-label="Trip destination country" value={country} onChange={e=>setCountry(e.target.value)}>{travelCountries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</SelectField>}
      <div className={styles.pickerResults}>{items.filter(d=>!value.some(v=>v.id===d.id)).slice(0,8).map(d=><button type="button" key={d.id} onClick={()=>onChange([...value,d])}><TravelFlag destination={d}/><span>{d.name}<small>{d.description}</small></span><UnigentamosIcon role="plus" size={16}/></button>)}</div>
      {message&&<p role="status">{message}</p>}
    </div>}
  </div>;
}
