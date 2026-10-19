import type { TravelEntry } from "../../lib/modules/planning/travel-sync";
import { travelStatusLabels, travelStatuses, type TravelStatus } from "../../lib/modules/planning/travel";
import { travelHistory } from "../../lib/modules/planning/travel-history";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import TravelFlag from "./TravelFlag";
import { visitDates } from "./TravelVisitEditor";
import { travelKindIcons, travelStatusIcons } from "../../lib/modules/planning/travel-icons";
import styles from "./TravelPanel.module.css";

const typeLabels={country:"Country",state:"U.S. state",city:"City",landmark:"Landmark",park:"National park"};
export default function TravelSavedRow({entry,expanded,onExpand,onDates,onStatus,disabled}:{entry:TravelEntry;expanded:boolean;onExpand:()=>void;onDates:()=>void;onStatus:(status:TravelStatus)=>void;disabled:boolean}) {
  const history=travelHistory(entry),latest=history.find(v=>v.start),type=typeLabels[entry.kind];
  const dates=latest?visitDates(latest.start,latest.end):"Add dates";
  return <header className={styles.savedRow}>
    <button type="button" className={styles.savedName} onClick={onExpand} aria-expanded={expanded} title={entry.name}><TravelFlag destination={entry}/><h3>{entry.name}</h3></button>
    <span className={styles.typeTag} title={type} aria-label={type}><UnigentamosIcon role={travelKindIcons[entry.kind]} size={14}/><span>{type}</span></span>
    <span className={styles.savedStatuses} role="group" aria-label={`Travel status for ${entry.name}`}>{travelStatuses.map(status=>{
      const reason=status==="lived"&&["park","landmark"].includes(entry.kind)?"Not available for this place type":entry.tripVisits.some(v=>v.status===status)?"Managed by a linked trip — edit in Details":status==="visited"&&entry.visits?.length?"Recorded by visit dates — edit in Details":"";
      return <button type="button" key={status} data-status={status} aria-pressed={entry.statuses.includes(status)} disabled={disabled||!!reason} title={reason||travelStatusLabels[status]} aria-label={`${travelStatusLabels[status]}: ${entry.name}`} onClick={()=>onStatus(status)}><UnigentamosIcon role={travelStatusIcons[status]} size={16}/></button>;
    })}</span>
    <button type="button" className={styles.savedDates} data-empty={!history.length} onClick={onDates} aria-expanded={expanded} aria-label={`Visits and dates for ${entry.name}${history.length?`: ${history.length} records`:""}`} title={history.length?history.map(v=>`${v.title}: ${visitDates(v.start,v.end)}`).join("\n"):"Add visit dates"}><UnigentamosIcon role="calendar" size={14}/><span className={styles.fullDate}>{dates}</span><span className={styles.shortDate}>{latest?latest.start.slice(0,4):"Dates"}</span>{history.length>1&&<span className={styles.visitCount}>+{history.length-1}</span>}</button>
    <button type="button" data-icon-button="compact" aria-label={`Details for ${entry.name}`} aria-expanded={expanded} onClick={onExpand}><UnigentamosIcon role={expanded?"chevron-down":"chevron-right"} size={16}/></button>
  </header>;
}
