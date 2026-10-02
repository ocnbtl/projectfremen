"use client";

import { useState } from "react";
import type { Calendar, EventGroup } from "../../lib/modules/planning/types";
import { calendarGroups, GROUP_ICONS } from "../../lib/modules/planning/calendar-groups";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import styles from "./CalendarWorkspace.module.css";

const iconNames: Record<string, string> = { briefcase: "Work", university: "School", person: "Personal", routine: "Wellness", travel: "Travel", star: "Star", goal: "Goal", users: "People" };
type Draft = { calendar: Calendar; groups: EventGroup[] };

export default function CalendarGroupSettings({ calendars, busy, onSave }: {
  calendars: Calendar[];
  busy: boolean;
  onSave: (calendar: Calendar, groups: EventGroup[]) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState(calendars[0]?.id || "");
  // Preserve edits when switching calendars, and keep the original revision for conflict checks.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const calendar = calendars.find(item => item.id === selectedId) || calendars[0];
  if (!calendar) return <p className="work-muted">Add a calendar to manage its color groups.</p>;
  const draft = drafts[calendar.id];
  const groups = draft?.groups || calendarGroups(calendar);
  const updateGroups = (update: (groups: EventGroup[]) => EventGroup[]) => setDrafts(current => {
    const base = current[calendar.id] || { calendar, groups: calendarGroups(calendar).map(group => ({ ...group })) };
    return { ...current, [calendar.id]: { ...base, groups: update(base.groups) } };
  });
  const discard = () => setDrafts(current => { const next = { ...current }; delete next[calendar.id]; return next; });
  return <form className={styles.groupSettings} aria-label="Manage color groups" onSubmit={async event => {
    event.preventDefault();
    if (draft && await onSave(draft.calendar, draft.groups)) discard();
  }}>
    <label>Calendar
      <SelectField aria-label="Group calendar" value={calendar.id} disabled={busy} menuClassName={styles.calendarChoiceMenu} onChange={event => setSelectedId(event.target.value)}>
        {calendars.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </SelectField>
    </label>
    <p className="work-muted">Update names, colors and icons here. Changes apply to events using these groups.</p>
    <div className={styles.groupSettingsRows}>
      {groups.map((group, index) => <div className={styles.groupSettingsRow} key={group.id}>
        <label>Name
          <input aria-label={`Group ${index + 1} name`} required maxLength={80} value={group.name} disabled={busy} placeholder="Group name" onChange={event => updateGroups(items => items.map(item => item.id === group.id ? { ...item, name: event.target.value } : item))} />
        </label>
        <label>Icon
          <SelectField aria-label={`Group ${index + 1} icon`} value={group.icon} disabled={busy} menuClassName={styles.calendarChoiceMenu} onChange={event => updateGroups(items => items.map(item => item.id === group.id ? { ...item, icon: event.target.value } : item))}>
            {[...new Set([...GROUP_ICONS, group.icon])].map(icon => <option key={icon} value={icon}><span className={styles.viewChoice}><UnigentamosIcon role={icon} size={16} />{iconNames[icon] || icon}</span></option>)}
          </SelectField>
        </label>
        <label>Color
          <input aria-label={`Group ${index + 1} color`} type="color" value={group.color} disabled={busy} onChange={event => updateGroups(items => items.map(item => item.id === group.id ? { ...item, color: event.target.value } : item))} />
        </label>
      </div>)}
    </div>
    <Button icon="plus" disabled={busy || groups.length >= 100} onClick={() => updateGroups(items => [...items, { id: crypto.randomUUID(), name: "", color: MODULE_COLOR_SYSTEM.calendar.tokens.action, icon: "star" }])}>Add group</Button>
    <div className={styles.groupColorActions}>
      <Button intent="quiet" disabled={busy || !draft} onClick={discard}>Discard changes</Button>
      <Button type="submit" intent="primary" disabled={!draft || busy || groups.some(group => !group.name.trim())} busy={busy}>Save groups</Button>
    </div>
  </form>;
}
