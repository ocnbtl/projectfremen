"use client";
import SelectField from "../ui/SelectField";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { TRAVEL_MODES } from "../../lib/modules/personal-life/travel-modes";
import type { TravelMode } from "../../lib/modules/personal-life/types";
import styles from "./TripPlanner.module.css";

export default function TravelModeField({value,onChange}:{value:string;onChange:(value:TravelMode)=>void}) {
  return <SelectField aria-label="Travel mode" value={value} onChange={event=>onChange(event.target.value as TravelMode)}>
    {TRAVEL_MODES.map(mode=><option value={mode.value} key={mode.value}><span className={styles.modeLabel}><UnigentamosIcon role={mode.icon} size={18}/>{mode.label}</span></option>)}
  </SelectField>;
}
