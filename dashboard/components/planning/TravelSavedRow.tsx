import type { TravelEntry } from "../../lib/modules/planning/travel-sync";
import { travelStatusLabels } from "../../lib/modules/planning/travel";
import { travelHistory } from "../../lib/modules/planning/travel-history";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import TravelFlag from "./TravelFlag";
import { visitDates } from "./TravelVisitEditor";
import styles from "./TravelPanel.module.css";

const types={country:{label:"Country",icon:"travel"},state:{label:"U.S. state",icon:"location"},city:{label:"City",icon:"location"},landmark:{label:"Landmark",icon:"place-tag-organization"},park:{label:"National park",icon:"place-tag-area"}};
const statusIcons={visited:"check",lived:"place-tag-house",want:"star",going:"travel-plane"};
const shortTypes={country:"Country",state:"State",city:"City",landmark:"Landmark",park:"Park"};
export default function TravelSavedRow({entry,expanded,onExpand}:{entry:TravelEntry;expanded:boolean;onExpand:()=>void}) {
  const history=travelHistory(entry),latest=history.find(v=>v.start),type=types[entry.kind];
  const dates=latest?visitDates(latest.start,latest.end):"Add dates";
  return <header className={styles.savedRow}>
    <button type="button" className={styles.savedName} onClick={onExpand} aria-expanded={expanded} title={entry.name}><TravelFlag destination={entry}/><h3>{entry.name}</h3></button>
    <span className={styles.typeTag} title={type.label} aria-label={type.label}><UnigentamosIcon role={type.icon} size={14}/><span>{type.label}</span><small>{shortTypes[entry.kind]}</small></span>
    <span className={styles.savedStatuses} data-multiple={entry.statuses.length>1||undefined} aria-label={entry.statuses.map(s=>travelStatusLabels[s]).join(", ")}>{entry.statuses.map(status=><span key={status} data-status={status} title={travelStatusLabels[status]}><UnigentamosIcon role={statusIcons[status]} size={13}/><span>{travelStatusLabels[status]}</span></span>)}</span>
    <button type="button" className={styles.savedDates} onClick={onExpand} aria-expanded={expanded} aria-label={`Visits and dates for ${entry.name}${history.length?`: ${history.length} records`:""}`} title={history.length?history.map(v=>`${v.title}: ${visitDates(v.start,v.end)}`).join("\n"):"Add visit dates"}><UnigentamosIcon role="calendar" size={14}/><span className={styles.fullDate}>{dates}</span><span className={styles.shortDate}>{latest?latest.start.slice(0,4):"Dates"}</span>{history.length>1&&<span className={styles.visitCount}>+{history.length-1}</span>}</button>
    <button type="button" data-icon-button="compact" aria-label={`Details for ${entry.name}`} aria-expanded={expanded} onClick={onExpand}><UnigentamosIcon role={expanded?"chevron-down":"chevron-right"} size={16}/></button>
  </header>;
}
