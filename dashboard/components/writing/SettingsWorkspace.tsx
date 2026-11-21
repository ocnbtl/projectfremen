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
const pages = {
  writing: {title:"Writing", icon:"edit", description:"Link objects, use shortcuts, and manage your writing skills."},
  appearance: {title:"Accessibility", icon:"sliders", description:"Adjust motion and keyboard focus across the workspace."},
  "calendar-map": {title:"Calendar and Map", icon:"calendar", description:"Choose which event details and map pins you see."}
} as const;

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

export default function SettingsWorkspace({section}: {section: "home" | keyof typeof pages}) {
  const current = section === "home" ? null : pages[section];
  return <div className={layout.shell} data-personal-pages>
    <PersonalOpsSidebar activeView="settings" filter="" pathname={base} mobileOpen={false} onClose={() => {}}/>
    <main className={layout.directory} aria-label="Personal settings" data-writing-settings>
      <div className={layout.mainScroll}><div className={styles.content}>
        <header className={styles.heading}>
          {current && <Link prefetch={false} className={styles.back} href={base}><UnigentamosIcon role="chevron-left" size={16}/>Settings</Link>}
          <h1><UnigentamosIcon role={current?.icon ?? "sliders"} size={24}/>{current?.title ?? "Settings"}</h1>
          <p>{current?.description ?? "These preferences apply to this browser profile."}</p>
        </header>
        {section === "home" && <nav className={styles.directoryList} aria-label="Settings sections">
          {Object.entries(pages).map(([key, page]) => <Link key={key} href={base + "/" + key} prefetch={false}>
            <span className={styles.skillIcon}><UnigentamosIcon role={page.icon} size={18}/></span>
            <span><strong>{page.title}</strong><small>{page.description}</small></span>
            <UnigentamosIcon role="chevron-right" size={16}/>
          </Link>)}
        </nav>}
        {section === "writing" && <WritingSettings/>}
        {section === "appearance" && <Accessibility/>}
        {section === "calendar-map" && <CalendarAndMap/>}
      </div></div>
    </main>
  </div>;
}
