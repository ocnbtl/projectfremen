"use client";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import type { PersonalTrip } from "../../lib/modules/personal-life/types";
import { hasPlaceCoordinates } from "../../lib/modules/planning/place-identity";
import type { Place } from "../../lib/modules/planning/types";
import { supportsTripRouting } from "../../lib/modules/personal-life/travel-modes";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceButton as Button, WorkspaceFeedback } from "../admin-shell/WorkspaceKit";
import DateField from "../people/DateField";
import SelectField from "../ui/SelectField";
import TravelModeField from "./TravelModeField";
import styles from "./TripPlanner.module.css";

type Draft = Partial<PersonalTrip>;
function Heading({icon,title,children}:{icon:string;title:string;children?:ReactNode}) {
  return <header className={styles.sectionHeading}><UnigentamosIcon role={icon} size={20}/><div><h3>{title}</h3>{children && <p>{children}</p>}</div></header>;
}
export default function TripPlanner({trip,places,busy,error,notice,onChange,onSave,onCalculate}:{trip:Draft;places:Place[];busy:boolean;error?:string;notice?:string;onChange:(trip:Draft)=>void;onSave:(event:FormEvent)=>void;onCalculate:()=>void}) {
  const stops=trip.stops||[], mode=trip.travelMode||"car";
  const updateStops=(next:NonNullable<PersonalTrip["stops"]>)=>onChange({...trip,stops:next,route:undefined});
  const move=(index:number,delta:number)=>{const next=[...stops];[next[index],next[index+delta]]=[next[index+delta],next[index]];updateStops(next);};
  return <form className={`work-form ${styles.planner}`} onSubmit={onSave}>
    <WorkspaceFeedback error={error} message={notice}/>
    <section className={styles.section}>
      <Heading icon="travel" title="The trip">Choose your dates, then build your itinerary stop by stop.</Heading>
      <label>Trip name<input required value={trip.name||""} placeholder="A weekend by the lake" onChange={e=>onChange({...trip,name:e.target.value})}/></label>
      <div className={styles.pair}><label>Destination<input value={trip.place||""} placeholder="City or region" onChange={e=>onChange({...trip,place:e.target.value})}/></label><label>Status<SelectField value={trip.status||"planned"} onChange={e=>onChange({...trip,status:e.target.value as PersonalTrip["status"]})}><option value="want">Considering</option><option value="planned">Planned</option><option value="been">Completed</option><option value="lived">Lived here</option></SelectField></label></div>
      <div className={styles.pair}><DateField label="Departure" required={false} value={trip.startDate?.slice(0,10)||""} onChange={startDate=>onChange({...trip,startDate})}/><DateField label="Return" required={false} value={trip.endDate?.slice(0,10)||""} onChange={endDate=>onChange({...trip,endDate})}/></div>
      <label>Travel mode<TravelModeField value={mode} onChange={travelMode=>onChange({...trip,travelMode,route:undefined})}/></label>
    </section>
    <section className={styles.section}>
      <Heading icon="location" title="Your itinerary">Arrange stops in travel order. Arrival times and notes are optional.</Heading>
      {!stops.length && <p className={styles.empty}>Start with a saved place below. You can also save the trip with just a destination and add stops later.</p>}
      <ol className={styles.stops}>{stops.map((stop,index)=><li className={styles.stop} key={stop.id}>
        <header className={styles.stopHeading}><span className={styles.stopNumber}>{index+1}</span><strong>{stop.name}</strong><div className={styles.stopActions}>
          <Button icon="chevron-down" className={styles.moveEarlier} disabled={busy||index===0} aria-label={`Move ${stop.name} earlier`} onClick={()=>move(index,-1)}/>
          <Button icon="chevron-down" disabled={busy||index===stops.length-1} aria-label={`Move ${stop.name} later`} onClick={()=>move(index,1)}/>
          <Button icon="delete" disabled={busy} aria-label={`Remove ${stop.name}`} onClick={()=>updateStops(stops.filter(s=>s.id!==stop.id))}/>
        </div></header>
        {index>0&&trip.route?.legs?.[index-1]&&<p className={styles.leg}><UnigentamosIcon role="clock" size={15}/>{(trip.route.legs[index-1].distance/1000).toFixed(1)} km · about {Math.ceil(trip.route.legs[index-1].duration/60)} min from previous stop</p>}
        <div className={styles.stopFields}><label>Arrival<input type="datetime-local" value={stop.arrival||""} onChange={e=>onChange({...trip,stops:stops.map(s=>s.id===stop.id?{...s,arrival:e.target.value}:s)})}/></label><label>Stop notes<input value={stop.notes||""} placeholder="Check-in, booking, or something to see" onChange={e=>onChange({...trip,stops:stops.map(s=>s.id===stop.id?{...s,notes:e.target.value}:s)})}/></label></div>
      </li>)}</ol>
      <label>Add a saved place<SelectField value="" searchable autoFocusSearch={false} onChange={e=>{const place=places.find(p=>p.id===e.target.value);if(hasPlaceCoordinates(place))updateStops([...stops,{id:crypto.randomUUID(),placeId:place.id,name:place.name,latitude:place.latitude,longitude:place.longitude}]);}}><option value="">Choose a place…</option>{places.filter(p=>!p.archivedAt).filter(hasPlaceCoordinates).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SelectField></label>
      <div className={styles.route}><Button icon="location" disabled={busy||stops.length<2||!supportsTripRouting(mode)} onClick={onCalculate}>Calculate route</Button>{trip.route&&<strong>{(trip.route.distance/1000).toFixed(1)} km <span>· about {Math.round(trip.route.duration/60)} min</span></strong>}
      <p>{!supportsTripRouting(mode)?"Keep stops and arrival times here; route estimates are available for car, van, bike, and walking trips.":mode==="van"?"Standard driving estimate. Vehicle height, weight, and live traffic are not included.":stops.length<2?"Add at least two stops to estimate distance and travel time.":"Estimates exclude live traffic. Save the trip to keep your route."}</p></div>
    </section>
    <section className={styles.section}><Heading icon="notes" title="Trip notes"/><label><span className={styles.secondary}>Bookings, packing, and details to remember</span><textarea aria-label="Trip notes" rows={3} value={trip.notes||""} onChange={e=>onChange({...trip,notes:e.target.value})}/></label></section>
    <footer className={styles.footer}><Button type="submit" icon="check" intent="primary" busy={busy} disabled={!stops.length&&!trip.place?.trim()}>Save trip</Button>{trip.id?<Link href={`/admin/personal/travel?selected=${trip.id}`}>Open in Personal<UnigentamosIcon role="chevron-right" size={16}/></Link>:<span>Dates appear in Calendar after saving.</span>}</footer>
  </form>;
}
