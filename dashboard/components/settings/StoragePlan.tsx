import type {StorageOffer} from "../../lib/settings/storage-offer";
import styles from "./WorkspaceRecords.module.css";

function bytes(value:number){
  if(value<1024) return value+" B";
  const power=Math.min(4,Math.floor(Math.log(value)/Math.log(1024)));
  return new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value/1024**power)+" "+["B","KiB","MiB","GiB","TiB"][power];
}
export default function StoragePlan({row,offer}:{row:{used_bytes:number;reserved_bytes:number;included_bytes:number;pooled_addon_bytes:number};offer:StorageOffer|null}){
  const money=offer&&new Intl.NumberFormat(undefined,{style:"currency",currency:offer.currency});
  const unit=10**(money?.resolvedOptions().maximumFractionDigits??2);
  const available=Math.max(0,row.included_bytes+row.pooled_addon_bytes-row.used_bytes-row.reserved_bytes);
  return <details className={styles.usage}><summary>{bytes(available)} available in this workspace</summary>
    <dl>{[["Saved originals",row.used_bytes],["Reserved for uploads",row.reserved_bytes],["Included storage",row.included_bytes],["Pooled add-ons",row.pooled_addon_bytes]].map(([title,value])=><div key={title}><dt>{title}</dt><dd>{bytes(Number(value))}</dd></div>)}</dl>
    {offer&&money&&<p>Proposed monthly pricing · {money.format(offer.flatMonthlyMinor/unit)} per workspace · {money.format(offer.addonMonthlyMinor/unit)} per additional {bytes(offer.addonBytes)}.</p>}
  </details>;
}
