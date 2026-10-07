"use client";

import useCalendarAutosave from "./useCalendarAutosave";
import { useState } from "react";
import type { Calendar, EventGroup } from "../../lib/modules/planning/types";
import { calendarGroups, GROUP_ICONS } from "../../lib/modules/planning/calendar-groups";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import { getIconEntry } from "../../lib/icons/icon-registry";
import styles from "./CalendarWorkspace.module.css";



export default function CalendarGroupSettings({ calendars, busy, onSave }: {
  calendars: Calendar[];
  busy: boolean;
  onSave: (calendar: Calendar, groups: EventGroup[]) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState(calendars[0]?.id || "");
  const calendar = calendars.find(item => item.id === selectedId) || calendars[0];
  if (!calendar) return <p className="work-muted">Add a calendar to manage its color groups.</p>;
  return <div className={styles.groupSettings}>
    {calendars.length > 1 && <label>Calendar
      <SelectField aria-label="Group calendar" value={calendar.id}  menuClassName={styles.calendarChoiceMenu} onChange={event => setSelectedId(event.target.value)}>
        {calendars.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </SelectField>
    </label>}
    <GroupEditor key={calendar.id} calendar={calendar} onSave={onSave} />
  </div>;
}

function GroupEditor({ calendar, onSave }: { calendar: Calendar; onSave: (calendar: Calendar, groups: EventGroup[]) => Promise<boolean> }) {
  const [groups, setGroups] = useState(() => calendarGroups(calendar).map(group => ({ ...group })));
  const autosave = useCalendarAutosave<EventGroup[]>(value => onSave(calendar, value), value => value.every(group => Boolean(group.name.trim())));
  const updateGroups = (update: (groups: EventGroup[]) => EventGroup[]) => { const next = update(groups); setGroups(next); autosave.schedule(next); };
  return <form className={styles.groupSettings} aria-label="Manage color groups" onSubmit={event => { event.preventDefault(); void autosave.flush(); }}>
    <div className={styles.groupSettingsRows}>
      {groups.map((group, index) => <div className={styles.groupSettingsRow} key={group.id}>
        <label aria-label="Group icon">
          <SelectField aria-label={`Group ${index + 1} icon`} searchable autoFocusSearch={false} contained columns={6} triggerContent={<UnigentamosIcon role={group.icon} size={18} />} value={group.icon} menuClassName={`${styles.calendarChoiceMenu} ${styles.groupIconMenu}`} onChange={event => updateGroups(items => items.map(item => item.id === group.id ? { ...item, icon: event.target.value } : item))}>
            {[...new Set([...GROUP_ICONS, group.icon])].map(icon => <option key={icon} value={icon}><span className={styles.viewChoice}><UnigentamosIcon role={icon} size={16} /><span className="sr-only">{getIconEntry(icon).label}</span></span></option>)}
          </SelectField>
        </label>
        <label aria-label="Group name">
          <input aria-label={`Group ${index + 1} name`} required maxLength={80} value={group.name}  placeholder="Group name" onChange={event => updateGroups(items => items.map(item => item.id === group.id ? { ...item, name: event.target.value } : item))} />
        </label>
        <label aria-label="Group color">
          <input aria-label={`Group ${index + 1} color`} type="color" value={group.color}  onChange={event => updateGroups(items => items.map(item => item.id === group.id ? { ...item, color: event.target.value } : item))} />
        </label>
        <Button icon="delete" aria-label={`Remove ${group.name} group`} onClick={() => updateGroups(items => items.filter(item => item.id !== group.id))} />
      </div>)}
    </div>
    <Button icon="plus" disabled={groups.length >= 100} onClick={() => updateGroups(items => [...items, { id: crypto.randomUUID(), name: "New group", color: MODULE_COLOR_SYSTEM.calendar.tokens.action, icon: "star" }])}>Add group</Button>
<div className={styles.groupColorActions}><span className={styles.autosaveStatus} role="status">{autosave.status}</span>{autosave.status === "Not saved" && <Button onClick={() => void autosave.flush()}>Retry</Button>}</div>
  </form>;
}
