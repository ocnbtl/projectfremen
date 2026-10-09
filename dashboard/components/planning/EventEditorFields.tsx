"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import RecordLinks from "./RecordLinks";
import EventLocationField from "./EventLocationField";
import EventDateSegments from "./EventDateSegments";
import EventRepeatField from "./EventRepeatField";
import type { EventFields } from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import { calendarGroups } from "../../lib/modules/planning/calendar-groups";
import { addDays } from "../../lib/modules/planning/calendar-model";
import { calendarDisplayColor } from "./calendar-presentation";
import { useCalendarMotion } from "./CalendarMotion";
import base from "./CalendarWorkspace.module.css";
import styles from "./EventEditorFields.module.css";

export default function EventEditorFields({ fields, update, snapshot }: {
  fields: EventFields;
  update: <K extends keyof EventFields>(key: K, value: EventFields[K]) => void;
  snapshot?: PlanningSnapshot;
}) {
  const [reminderDraft, setReminderDraft] = useState(fields.reminderMinutes ?? 15);
  const [reminderEmpty, setReminderEmpty] = useState(false);
  const [reminderUnit, setReminderUnit] = useState(fields.reminderMinutes && fields.reminderMinutes % 10080 === 0 ? 10080 : fields.reminderMinutes && fields.reminderMinutes % 1440 === 0 ? 1440 : fields.reminderMinutes && fields.reminderMinutes % 60 === 0 ? 60 : 1);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const groupArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!groupsOpen) return;
    const outside = (event: PointerEvent) => { if (!groupArea.current?.contains(event.target as Node)) setGroupsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setGroupsOpen(false); groupArea.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [groupsOpen]);
  const { reduced, layoutTransition } = useCalendarMotion();
  const calendar = snapshot?.state.calendars.find(c => c.id === fields.calendarId);
  const groups = calendarGroups(calendar), selectedGroup = groups.find(g => g.id === fields.groupId);
  function reminder(value: number) { setReminderDraft(value); if (fields.reminderMinutes !== null) update("reminderMinutes", value); }
  const placeRef = snapshot?.refs.find(r => r.module === "map" && r.objectType === "place" && r.objectId === fields.placeId);
  const linked = placeRef && !fields.linkedRefs.some(r => r.module === "map" && r.objectId === placeRef.objectId) ? [...fields.linkedRefs, placeRef] : fields.linkedRefs;
  return <div className={styles.editor}>
    <div className={styles.left}>
      <label className={styles.title}>Title<input required maxLength={240} value={fields.title} onChange={e => update("title",e.target.value)} /></label>
      <label className={styles.description}>Description<textarea rows={3} placeholder="What is this time for?" value={fields.description} onChange={e => update("description",e.target.value)} /></label>
      <section className={styles.schedule} aria-label="Event schedule">
        <div className={styles.scheduleHeader}>
          <EventCheckbox label="All day" checked={fields.allDay} onChange={checked => {
            const start=fields.start.slice(0,10), end=fields.end.slice(0,10);
            update("allDay",checked);
            update("start",checked ? start : `${start}T09:00`);
            update("end",checked ? (fields.end.endsWith("T00:00") && end > start ? end : addDays(end,1)) : `${addDays(end,-1)}T10:00`);
          }} />
          <EventCheckbox label="Task" checked={Boolean(fields.isTask)} onChange={checked => {
            update("isTask",checked);
            if (checked) { update("reminderMinutes",60); setReminderDraft(60); setReminderUnit(60); setReminderEmpty(false); }
            else update("completed",false);
          }} />
          <SelectField searchable autoFocusSearch={false} aria-label="Event time zone" value={fields.timeZone} onChange={e => update("timeZone",e.target.value)} triggerContent={<span className={styles.zone}><UnigentamosIcon role="clock" size={15} />{fields.timeZone.split("/").pop()?.replaceAll("_"," ")}<UnigentamosIcon role="chevron-down" size={12} /></span>}>
            {[...new Set([fields.timeZone,"UTC",...Intl.supportedValuesOf("timeZone")])].map(zone => <option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}
          </SelectField>
        </div>
        <div className={styles.optionRow} data-enabled={fields.reminderMinutes !== null}>
          <EventCheckbox label="Reminder" checked={fields.reminderMinutes !== null} onChange={checked => { setReminderEmpty(false); update("reminderMinutes",checked ? reminderDraft : null); }} />
          <input aria-label="Reminder amount" type="number" min={0} max={43200/reminderUnit} step="any" required={fields.reminderMinutes !== null} disabled={fields.reminderMinutes === null} value={reminderEmpty ? "" : Number((reminderDraft/reminderUnit).toFixed(5))} onChange={e => {
            const empty = e.target.value === "";
            setReminderEmpty(empty);
            // Keep deletion editable; an empty enabled reminder must be filled before saving.
            if (!empty) reminder(Math.round(Number(e.target.value)*reminderUnit));
          }} />
          <SelectField aria-label="Reminder unit" value={String(reminderUnit)} disabled={fields.reminderMinutes === null} onChange={e => { const next=Number(e.target.value); reminder(Math.min(43200,Math.round(reminderDraft/reminderUnit*next))); setReminderUnit(next); }}><option value="1">minutes before</option><option value="60">hours before</option><option value="1440">days before</option><option value="10080">weeks before</option></SelectField>
        </div>
        <EventRepeatField fields={fields} update={update} birthdays={snapshot?.birthdays} />
        <EventDateSegments label="Starts" allDay={fields.allDay} timeZone={fields.timeZone} value={fields.start} onChange={value => update("start",value)} />
        <EventDateSegments label="Ends" allDay={fields.allDay} timeZone={fields.timeZone} value={fields.allDay ? addDays(fields.end,-1) : fields.end} onChange={value => update("end",fields.allDay ? addDays(value,1) : value)} />
      </section>
    </div>
    <div className={styles.right}>
      <section className={styles.calendar} aria-label="Calendar and color groups">
        <label className={styles.calendarSelect}>Calendar<SelectField aria-label="Calendar" value={fields.calendarId} onChange={e => { update("calendarId",e.target.value); update("groupId",""); }} triggerContent={<span className={styles.calendarValue}><span style={{background:calendarDisplayColor(calendar?.color)}} />{calendar?.name || "Choose calendar"}<UnigentamosIcon role="chevron-down" size={14} /></span>}>
          {snapshot?.state.calendars.filter(c => !c.archivedAt).map(c => <option key={c.id} value={c.id}><span className={styles.calendarOption}><span style={{background:calendarDisplayColor(c.color)}} />{c.name}</span></option>)}
        </SelectField></label>
        <div ref={groupArea} className={styles.groupArea}><button className={styles.groupTrigger} type="button" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(!groupsOpen)}><UnigentamosIcon role={selectedGroup?.icon || "palette"} size={16} /><span>{selectedGroup?.name || "Color group"}</span><UnigentamosIcon role="chevron-right" size={13} /></button>
        <AnimatePresence initial={false}>{groupsOpen && <motion.div className={styles.groupPanel} initial={reduced ? false : {x:-8,opacity:0}} animate={{x:0,opacity:1}} exit={{x:-8,opacity:0}} transition={layoutTransition}><div className={styles.groups}>
          <button type="button" aria-pressed={!fields.groupId} onClick={() => {update("groupId","");setGroupsOpen(false);}}>None</button>{groups.map(g => <button type="button" key={g.id} title={g.name} aria-pressed={fields.groupId === g.id} style={{"--group-color":g.color} as CSSProperties} onClick={() => {update("groupId",g.id);setGroupsOpen(false);}}><UnigentamosIcon role={g.icon} size={16} /><span>{g.name}</span></button>)}
        </div></motion.div>}</AnimatePresence></div>
      </section>
      <div className={styles.locationSlot}><EventLocationField fields={fields} update={update} snapshot={snapshot} /></div>
      <section className={styles.links} aria-label="Linked objects"><RecordLinks objectPicker pickerLabel="Link an object" refs={linked} available={snapshot?.refs} onChange={refs => {
        update("linkedRefs",refs); const place=refs.find(r => r.module === "map" && r.objectType === "place"); update("placeId",place?.objectId || "");
        if (place && place.objectId !== fields.placeId) update("location",snapshot?.state.places.find(p => p.id === place.objectId)?.address || place.label);
      }} />{Boolean(fields.participants?.length) && <p className={styles.participants}>Imported participants: {fields.participants?.map(p => p.name || p.email).join(", ")}</p>}</section>
    </div>
  </div>;
}
export function EventCheckbox({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon?: string }) {
  return <label className={`${base.quietToggle} ${base.eventCheckbox} ${styles.checkbox}`}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className={base.checkboxMark} aria-hidden="true"><UnigentamosIcon role="check" size={13} /></span>{icon && <UnigentamosIcon role={icon} size={16} />}<span>{label}</span></label>;
}
