"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { PeopleProfileAvatar } from "../people/PeopleProfilePhoto";
import type { PersonalRecord } from "../../lib/personal-records-store";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import styles from "./ProjectLinkedItems.module.css";

export function ProjectLinkedItem({ source, record, description, status, actions, unavailable = false }: {
  source: NativeObjectRef; record?: PersonalRecord; description?: string; status?: ReactNode; actions?: ReactNode; unavailable?: boolean;
}) {
  const people = source.module === "people";
  const name = record?.profile?.fullName || record?.title || source.label;
  const icon = source.module === "notes" ? "notes" : source.module === "resources" ? "module-resources" : source.module === "reviews" ? "module-reviews" : people ? "module-people" : source.module === "personal_ops" ? (source.objectType === "decision" ? "decision" : "module-personal") : "module-media";
  const picture = people ? <PeopleProfileAvatar compact label={name} initials={name.split(/\s+/).map(s=>s[0]).slice(0,2).join("")}
    photoUrl={record?.profile?.photoUrl} photoUpdatedAt={record?.profile?.photoUpdatedAt} organization={source.objectType === "organization"} /> : <UnigentamosIcon role={icon} size={20} />;
  const identity = <><span className={styles.picture}>{picture}</span><span className={styles.text}><strong>{name}</strong>{description && <span>{description}</span>}</span></>;
  return <li className={styles.row} data-unavailable={unavailable || undefined}>
    {unavailable ? <div className={styles.identity}>{identity}</div> : <Link prefetch={false} href={source.route} className={styles.identity}>{identity}</Link>}
    {(status || actions) && <div className={styles.controls}>{status}{actions}</div>}
  </li>;
}

export default function ProjectLinkedItems({children}: {children: ReactNode}) {
  return <ul className={styles.list}>{children}</ul>;
}
