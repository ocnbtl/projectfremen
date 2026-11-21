"use client";

import Link from "next/link";
import PersonalOpsSidebar from "../personal-ops/PersonalOpsSidebar";
import layout from "../personal-ops/PersonalOpsWorkspace.module.css";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useMotionPreference, useStrongFocus } from "../admin-shell/ExperienceProvider";
import { useCalendarDisplayPreferences, useMapPinPreference } from "../planning/CalendarDisplayPreferences";
import WritingSettings from "./WritingSettings";
import SettingsSwitch from "./SettingsSwitch";
import styles from "./WritingSettings.module.css";

const base = "/admin/personal/settings";
import { settingsPages as pages } from "../../lib/settings/sections";
import DailySettings, { ReadingSettings } from "../settings/DailySettings";
import DeviceDataSettings from "../settings/DeviceDataSettings";

function Accessibility() {
  const motion = useMotionPreference();
  const [focus, setFocus] = useStrongFocus();
  return <section className={styles.panel} aria-label="Accessibility preferences">
    <SettingsSwitch label="Reduce motion" detail="Limit workspace animations. When off, your device’s motion preference applies." checked={motion.preference === "reduce"} onChange={value => motion.setPreference(value ? "reduce" : "system")}/>
    <SettingsSwitch label="Stronger keyboard focus" detail="Show a thicker outline around the control you reach with Tab." checked={focus} onChange={setFocus}/>
  </section>;
}

function CalendarAndMap() {
  const [details, setDetails] = useCalendarDisplayPreferences();
  const [pins, setPins] = useMapPinPreference();
  const labels = { time:"Event times", address:"Addresses", people:"People", objects:"Linked objects" };
  return <>
    <section className={styles.panel}><h2>Calendar event details</h2>
      <p>Choose what appears on event cards. You can also change these in Calendar.</p>
      {(Object.keys(labels) as (keyof typeof labels)[]).map(key => <SettingsSwitch key={key} label={labels[key]} checked={details[key]} onChange={value => setDetails(current => ({...current, [key]:value}))}/>)}
    </section>
    <section className={styles.panel}><h2>Map pins</h2>
      <SettingsSwitch label="Use images for pins" detail="Show available pictures on the map. Turn this off to use icons." checked={pins === "images"} onChange={value => setPins(value ? "images" : "icons")}/>
    </section>
  </>;
}

export default function SettingsWorkspace({section,accountUrl}: {section: "home" | keyof typeof pages;accountUrl?:string}) {
  const current = section === "home" ? null : pages[section];
  return <div className={layout.shell} data-personal-pages>
    <PersonalOpsSidebar activeView="settings" filter="" pathname={base} mobileOpen={false} onClose={() => {}}/>
    <main className={layout.directory} aria-label="Personal settings" data-writing-settings>
      <div className={layout.mainScroll}><div className={styles.content}>
        <header className={styles.heading}>
          {current && <Link prefetch={false} className={styles.back} href={base}><UnigentamosIcon role="chevron-left" size={16}/>Settings</Link>}
          <h1><UnigentamosIcon role={current?.icon ?? "sliders"} size={24}/>{current?.title ?? "Settings"}</h1>
          <p>{current?.description ?? "Manage preferences for this browser and your connected services."}</p>
        </header>
        {section === "home" && <nav className={styles.directoryList} aria-label="Settings sections">
          {Object.entries(pages).filter(([key])=>accountUrl||!["account","sharing"].includes(key)).map(([key, page]) => <Link key={key} href={base + "/" + key} prefetch={false}>
            <span className={styles.skillIcon}><UnigentamosIcon role={page.icon} size={18}/></span>
            <span><strong>{page.title}</strong><small>{page.description}</small></span>
            <UnigentamosIcon role="chevron-right" size={16}/>
          </Link>)}
        </nav>}
        {section === "writing" && <WritingSettings/>}
        {section === "appearance" && <><ReadingSettings/><Accessibility/></>}
        {(section === "account" || section === "sharing") && <section className={styles.panel}><h2>Individual accounts</h2>{accountUrl?<a href={accountUrl}>Open your account and workspaces</a>:<p>Individual accounts are available on the workspace host when your administrator connects it.</p>}</section>}
        {section === "backup" && <section className={styles.panel}><h2>Device Vault</h2><p>Unlock Vault on this device to export an encrypted backup or check a recovery file.</p><Link href="/vault" prefetch={false}>Open Vault</Link>{accountUrl&&<a href={accountUrl}>Open workspace record exports</a>}</section>}
        {section === "device-data" && <DeviceDataSettings/>}
        {(["regional","notifications","planning","navigation","search"] as const).map(group=>section === group && <DailySettings key={group} section={group}/>)}
        {section === "calendar-map" && <CalendarAndMap/>}
      </div></div>
    </main>
  </div>;
}
