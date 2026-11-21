"use client";
import Link from "next/link";
import styles from "./WorkspaceRecords.module.css";

export default function AccountSettings(){
  return <section className={styles.panel}><h2>Account and access</h2>
    <p>Manage signed-in devices, workspaces, members, and invitations from your account.</p>
    <Link prefetch={false} href="/account">Open account</Link>
  </section>;
}
