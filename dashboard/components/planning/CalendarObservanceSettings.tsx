"use client";
import { useState } from "react";
import type { CalendarObservanceSettings as Settings } from "../../lib/modules/planning/types";
import { holidayVisible, type HolidayCatalog } from "../../lib/modules/planning/observances";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import EventDateTimePicker from "./EventDateTimePicker";
import styles from "./CalendarWorkspace.module.css";

export default function CalendarObservanceSettings({ settings, catalog, loading, error, busy, year, date, zone, onSave }: {
  settings: Settings; catalog?: HolidayCatalog; loading: boolean; error: string; busy: boolean; year: string; date: string; zone: string; onSave: (settings: Settings) => Promise<boolean>;
}) {
  const [country, setCountry] = useState("");
  const [custom, setCustom] = useState<Settings["custom"][number]>();
  const [customError, setCustomError] = useState("");
  return <div className={styles.observanceSettings}>
    <section>
      <h3><UnigentamosIcon role="website" size={18} /> Holiday calendars</h3>
      <p>Choose countries, then choose the holidays you want to see.</p>
      <div className={styles.countryPicker}>
        <SelectField searchable aria-label="Holiday country" value={country} disabled={!catalog || busy} onChange={e => setCountry(e.target.value)}>
          <option value="">Add a country…</option>
          {catalog?.countries.filter(x => !settings.countries.includes(x.code)).map(x => <option value={x.code} key={x.code}>{x.name}</option>)}
        </SelectField>
        <Button icon="plus" disabled={!country || busy} onClick={async () => { if (await onSave({ ...settings, countries: [...settings.countries, country] })) setCountry(""); }}>Add</Button>
      </div>
      {loading && <p role="status">Loading holiday dates…</p>}
      {error && <p role="alert">{error}</p>}
      {settings.countries.map(code => {
        const name = catalog?.countries.find(x => x.code === code)?.name || code;
        const holidays = [...new Map((catalog?.holidays || []).filter(x => x.country === code && x.date.startsWith(year)).map(x => [x.key, x])).values()];
        return <details className={styles.holidayCountry} key={code}>
          <summary><UnigentamosIcon role="chevron-right" size={15} /><strong>{name}</strong><span>{year}</span></summary>
          <div className={styles.holidayList}>
            {holidays.map(holiday => <label className={styles.holidayChoice} key={holiday.key}>
              <input type="checkbox" checked={holidayVisible(holiday, settings)} disabled={busy || loading} aria-label={`${holiday.name} (${name})`} onChange={e => void onSave({ ...settings,
                hiddenHolidays: e.target.checked ? settings.hiddenHolidays.filter(x => x !== holiday.key) : [...new Set([...settings.hiddenHolidays, holiday.key])],
                extraHolidays: e.target.checked ? [...new Set([...settings.extraHolidays, holiday.key])] : settings.extraHolidays.filter(x => x !== holiday.key),
              })} />
              <span>{holiday.name}<small>{new Date(`${holiday.date}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {holiday.type === "public" ? "Public holiday" : "Observance"}</small></span>
            </label>)}
            {!holidays.length && !loading && <p>No national dates are available for this year. You can add custom dates below.</p>}
          </div>
          <Button intent="quiet" disabled={busy} onClick={() => void onSave({ ...settings, countries: settings.countries.filter(x => x !== code) })}>Remove {name}</Button>
        </details>;
      })}
      {catalog && <p className={styles.holidaySource}>National calendars for {catalog.countries.length} countries and territories. Regional holidays vary. <a href="https://github.com/commenthol/date-holidays" target="_blank" rel="noreferrer">Holiday source</a></p>}
    </section>
    <section>
      <div className={styles.observanceHeading}><h3><UnigentamosIcon role="star" size={18} /> Custom dates</h3><Button icon="plus" disabled={busy} onClick={() => { setCustomError(""); setCustom({ id: crypto.randomUUID(), title: "", date, annual: true, visible: true }); }}>Add date</Button></div>
      <p>Annual dates or one-time reminders, such as Tax Day or an anniversary.</p>
      {settings.custom.map(item => <div className={styles.customDateRow} key={item.id}>
        <label><input type="checkbox" checked={item.visible} disabled={busy} aria-label={`Show ${item.title}`} onChange={e => void onSave({ ...settings, custom: settings.custom.map(x => x.id === item.id ? { ...x, visible: e.target.checked } : x) })} /><span>{item.title}<small>{item.date.slice(5)} · {item.annual ? "Every year" : item.date.slice(0, 4)}</small></span></label>
        <Button icon="edit" aria-label={`Edit ${item.title}`} disabled={busy} onClick={() => { setCustomError(""); setCustom(item); }} />
        <Button icon="close" aria-label={`Remove ${item.title}`} disabled={busy} onClick={() => void onSave({ ...settings, custom: settings.custom.filter(x => x.id !== item.id) })} />
      </div>)}
      {custom && <form className={`work-form ${styles.customDateForm}`} onSubmit={async e => { e.preventDefault(); setCustomError(""); if (!custom.title.trim()) { setCustomError("Give this date a name."); return; } const next = settings.custom.some(x => x.id === custom.id) ? settings.custom.map(x => x.id === custom.id ? custom : x) : [...settings.custom, custom]; if (await onSave({ ...settings, custom: next })) setCustom(undefined); }}>
        <label>Name<input required maxLength={240} value={custom.title} placeholder="Tax Day, anniversary…" onChange={e => setCustom({ ...custom, title: e.target.value })} /></label>
        <EventDateTimePicker label="Custom date" value={custom.date} allDay timeZone={zone} onChange={value => setCustom({ ...custom, date: value })} />
        <label className={styles.holidayChoice}><input type="checkbox" checked={custom.annual} onChange={e => setCustom({ ...custom, annual: e.target.checked })} />Repeat every year</label>
        {customError && <p role="alert">{customError}</p>}
        <div className="work-actions"><Button type="submit" busy={busy}>Save date</Button><Button onClick={() => setCustom(undefined)}>Cancel</Button></div>
      </form>}
    </section>
  </div>;
}
