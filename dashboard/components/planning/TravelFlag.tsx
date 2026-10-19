"use client";
import { useState } from "react";
import type { TravelDestination } from "../../lib/modules/planning/travel";
import { travelFlagUrl, knownCityFlag } from "../../lib/modules/planning/area-flags";
import UnigentamosIcon from "../icons/UnigentamosIcon";
const extras = new Set(["AQ","BV","GS","HM","PN","TF","UM"]);
export default function TravelFlag({ destination }: { destination: TravelDestination }) {
  const [failed,setFailed]=useState(""),[loaded,setLoaded]=useState("");
  const url=destination.kind==="city"?travelFlagUrl(destination):undefined;
  const known=knownCityFlag(destination.name,destination.country,destination.latitude,destination.longitude,destination.kind);
  const caption=known?`${known.name}: ${known.note || "city flag"}${known.credit?` · ${known.credit}`:""}`:`${destination.name} flag`;
  const style = { width:28, height:20, objectFit:"contain" as const, flexShrink:0, borderRadius:2 };
  if(destination.kind==="city")return <span style={{...style,position:"relative",display:"inline-grid",placeItems:"center"}} title={loaded===url?caption:destination.name}><UnigentamosIcon role="location" size={16}/>{url&&failed!==url&&<img src={url} style={{...style,position:"absolute",inset:0,background:"white",opacity:loaded===url?1:0}} alt="" loading="lazy" onLoad={()=>setLoaded(url)} onError={()=>setFailed(url)}/>}</span>;
  if (destination.kind === "state") return <img src={`/map-flags/${destination.id.slice(-2).toLowerCase()}.png`} style={style} alt=""/>;
  if (extras.has(destination.country)) return <img src={`/address-flags/${destination.country}.svg`} style={style} alt=""/>;
  return <svg viewBox="0 0 513 342" style={style} aria-hidden="true"><use href={`/country-flags.svg#flag-${destination.country}`}/></svg>;
}
