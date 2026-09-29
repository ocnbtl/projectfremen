"use client";
import { useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { CSSProperties, ReactNode } from "react";
import { ICON_REGISTRY_BY_ID } from "../../lib/icons/icon-registry";
import { PERSONAL_OPS_ICON_LIBRARY } from "../personal-ops/PersonalOpsIcon";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import type { ResourceGradient } from "../../lib/modules/resources/types";
import PersonalOpsIcon, { type PersonalOpsIconName } from "../personal-ops/PersonalOpsIcon";
import styles from "./ResourceExperience.module.css";

export function resourceGradientStyle(gradient: ResourceGradient): CSSProperties {
  const colors = gradient.colors.length >= 2 ? gradient.colors : ["#193B42", "#86AEB0"];
  const stops = colors.map((color, index) => `${color} ${Math.round((index / (colors.length - 1)) * 100)}%`).join(", ");
  const focal = `${gradient.focalX}% ${gradient.focalY}%`;
  const background = gradient.pattern === "radial"
    ? `radial-gradient(circle at ${focal}, ${stops})`
    : gradient.pattern === "conic"
      ? `conic-gradient(from ${gradient.angle}deg at ${focal}, ${stops})`
      : gradient.pattern === "aurora"
        ? `radial-gradient(circle at ${focal}, ${colors[0]} 0%, transparent 48%), radial-gradient(circle at ${100 - gradient.focalX}% ${Math.min(100, gradient.focalY + 28)}%, ${colors.at(-1)} 0%, transparent 54%), linear-gradient(${gradient.angle}deg, ${stops})`
        : `linear-gradient(${gradient.angle}deg, ${stops})`;
  return { background };
}

export function ResourceMark({ gradient, className = "", label, imageUrl, resource }: { resource?: ResourceRecord; gradient: ResourceGradient; className?: string; label?: string; imageUrl?: string }) {
  const [failed,setFailed]=useState(false);
  // The chosen gradient remains editable in Properties. Record identity uses its source image or a semantic fallback.
  void gradient;
  const role = resource?.provenance.subjects.find(t=>t.startsWith("Icon role:"))?.slice(10).trim();
  const icon = resource?.provenance.subjects.find(t=>t.startsWith("Icon:"))?.slice(5).trim();
  const selectedIcon = role && ICON_REGISTRY_BY_ID.has(role) ? <UnigentamosIcon role={role} size={24}/> : icon && PERSONAL_OPS_ICON_LIBRARY.some(i=>i.name===icon) ? <PersonalOpsIcon name={icon as PersonalOpsIconName}/> : null;
  let safe="";try{const u=new URL(imageUrl || "");if(u.protocol==="https:"&&!u.username&&!u.password)safe=u.href;}catch{}
  return <span className={[styles.resourceMark,className].filter(Boolean).join(" ")} aria-label={label} aria-hidden={label?undefined:true}>{selectedIcon || (safe&&!failed?<img src={safe} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<UnigentamosIcon role="resource" size={24}/>)}</span>;
}

export function ResourceIconButton({
  icon,
  label,
  active = false,
  destructive = false,
  disabled = false,
  onClick,
  children
}: {
  icon: PersonalOpsIconName;
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      data-active={active || undefined}
      data-destructive={destructive || undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <PersonalOpsIcon name={icon} />
      {children}
    </button>
  );
}
