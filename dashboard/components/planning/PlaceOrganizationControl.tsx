"use client";
import { useState } from "react";
import Link from "next/link";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { PlaceOrganization } from "../../lib/modules/planning/place-presentation";
import styles from "./MapWorkspace.module.css";
export default function PlaceOrganizationControl({ name, organizations, busy, onCreate }: { name:string; organizations:PlaceOrganization[]; busy:boolean; onCreate:(name:string)=>Promise<boolean> }) {
  const [open,setOpen]=useState(false),[title,setTitle]=useState(name);
  if (organizations.length) return <div className={styles.organizationControl}>{organizations.map(org=><Link className="work-button" key={org.objectId} href={org.href}><UnigentamosIcon role="organization" size={16}/>{org.label}</Link>)}</div>;
  return <div className={styles.organizationControl}>{open ? <><label>Organization name<input aria-label="Organization name" value={title} maxLength={240} onChange={e=>setTitle(e.target.value)}/></label><div><Button icon="plus" busy={busy} disabled={!title.trim()} onClick={()=>void onCreate(title).then(ok=>{if(ok)setOpen(false);})}>Create &amp; link</Button><Button intent="quiet" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button></div><small>Saves your place changes and links its address to the new organization.</small></> : <Button icon="plus" onClick={()=>{setTitle(name);setOpen(true);}}>Create organization</Button>}</div>;
}
