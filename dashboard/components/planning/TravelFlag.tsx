import type { TravelDestination } from "../../lib/modules/planning/travel";
const extras = new Set(["AQ","BV","GS","HM","PN","TF","UM"]);
export default function TravelFlag({ destination }: { destination: Pick<TravelDestination,"id"|"country"|"kind"> }) {
  const style = { width:28, height:20, objectFit:"contain" as const, flexShrink:0, borderRadius:2 };
  if (destination.kind === "state") return <img src={`/map-flags/${destination.id.slice(-2).toLowerCase()}.png`} style={style} alt=""/>;
  if (extras.has(destination.country)) return <img src={`/address-flags/${destination.country}.svg`} style={style} alt=""/>;
  return <svg viewBox="0 0 513 342" style={style} aria-hidden="true"><use href={`/country-flags.svg#flag-${destination.country}`}/></svg>;
}
