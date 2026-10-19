import DateField from "../people/DateField";
import SelectField from "../ui/SelectField";
import type { VisitPrecision } from "../../lib/modules/planning/travel";
import styles from "./TravelPanel.module.css";

const months=Array.from({length:12},(_,i)=>({value:String(i+1).padStart(2,"0"),label:new Date(2020,i,1).toLocaleDateString("en-US",{month:"long"})}));
export default function TravelVisitDateField({label,value,precision,onChange}:{label:string;value:string;precision:VisitPrecision;onChange:(value:string)=>void}) {
  if(precision==="day")return <DateField compact label={`${label} date`} value={value} onChange={onChange}/>;
  const [year="",month=""]=value.split("-");
  return <div className={styles.approximateDate} data-precision={precision}><span>{label}{precision==="year"?" year":""}</span><div>
    {precision==="month"&&<SelectField contained aria-label={`${label} month`} value={month} onChange={e=>onChange(`${year}-${e.target.value}`)}><option value="" disabled>Month</option>{months.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</SelectField>}
    <input required aria-label={`${label} year`} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="YYYY" value={year} onChange={e=>{const next=e.target.value.replace(/\D/g,"").slice(0,4);onChange(precision==="month"?`${next}-${month}`:next);}}/>
  </div></div>;
}
