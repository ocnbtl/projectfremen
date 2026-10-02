"use client";
import { useState } from "react";
import type { CalendarObservanceSettings as Settings } from "../../lib/modules/planning/types";
import { holidayVisible, observanceAppearance, type HolidayCatalog } from "../../lib/modules/planning/observances";
import { normalizeObservances } from "../../lib/modules/planning/observance-settings";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import EventDateTimePicker from "./EventDateTimePicker";
import { calendarDateLabel as dateLabel } from "./CalendarMiniMonth";
import styles from "./CalendarWorkspace.module.css";

export function CalendarCountryFlag({ code }: { code: string }) {
  return <svg className={styles.countryFlag} width="24" height="16" viewBox="0 0 513 342" aria-hidden="true"><use href={`/country-flags.svg#flag-${code}`} /></svg>;
}
export default function CalendarObservanceSettings({ settings, catalog, loading, error, busy, year, date, zone, onSave }: {
  settings: Settings; catalog?: HolidayCatalog; loading: boolean; error: string; busy: boolean; year: string; date: string; zone: string; onSave: (settings: Settings) => Promise<boolean>;
}) {
  const [country, setCountry] = useState("");
  const [custom, setCustom] = useState<Settings["custom"][number]>();
  const [customError, setCustomError] = useState("");
  return <div className={styles.observanceSettings}>
    <section>
      <h3><UnigentamosIcon role="interaction-milestone" size={18} />Holiday calendars</h3>
      <p>Choose countries, then the dates you want to see.</p>
      <div className={styles.countryPicker}>
        <SelectField searchable aria-label="Holiday country" menuClassName={styles.calendarChoiceMenu} value={country} disabled={!catalog || busy} onChange={e => setCountry(e.target.value)}>
          <option value="">Add a country…</option>
          {catalog?.countries.filter(x => !settings.countries.includes(x.code)).map(x => <option value={x.code} key={x.code}><span className={styles.countryOption}><CalendarCountryFlag code={x.code} /><span>{x.name}</span></span></option>)}
        </SelectField>
        <Button icon="plus" disabled={!country || busy} onClick={async () => { if (await onSave({ ...settings, countries: [...settings.countries, country] })) setCountry(""); }}>Add</Button>
      </div>
      {loading && <p role="status">Loading holiday dates…</p>}
      {error && <p role="alert">{error}</p>}
      {settings.countries.map(code => {
        const name = catalog?.countries.find(x => x.code === code)?.name || code;
        const appearance = observanceAppearance(settings, `holidays:${code}`, name);
        const holidays = [...new Map((catalog?.holidays || []).filter(x => x.country === code && x.date.startsWith(year)).map(x => [x.key, x])).values()];
        return <details className={styles.holidayCountry} key={code}>
          <summary><CalendarCountryFlag code={code} /><strong>{appearance.name}</strong><span>{year}</span><UnigentamosIcon role="chevron-down" size={15} /></summary>
          <div className={styles.holidayList}>
            {holidays.map(holiday => <label className={styles.holidayChoice} key={holiday.key}>
              <input type="checkbox" checked={holidayVisible(holiday, settings)} disabled={busy || loading} aria-label={`${holiday.name} (${name})`} onChange={e => void onSave({ ...settings,
                hiddenHolidays: e.target.checked ? settings.hiddenHolidays.filter(x => x !== holiday.key) : [...new Set([...settings.hiddenHolidays, holiday.key])],
                extraHolidays: e.target.checked ? [...new Set([...settings.extraHolidays, holiday.key])] : settings.extraHolidays.filter(x => x !== holiday.key),
              })} />
              <time className={styles.holidayDate} dateTime={holiday.date}><span>{dateLabel(holiday.date, { month: "short" })}</span><strong>{Number(holiday.date.slice(-2))}</strong></time>
              <span className={styles.holidayName}><strong>{holiday.name}</strong><small>{holiday.type === "public" ? "Public holiday" : "Observance"}</small></span>
            </label>)}
            {!holidays.length && !loading && <p>No dates are available for this year. Add a custom date below.</p>}
          </div>
          <Button intent="quiet" icon="close" disabled={busy} onClick={() => void onSave({ ...settings, countries: settings.countries.filter(x => x !== code) })}>Remove {name}</Button>
        </details>;
      })}
      <p className={styles.holidaySource}>Regional holidays may vary. <a href="https://github.com/commenthol/date-holidays" target="_blank" rel="noreferrer">Holiday source</a></p>
    </section>
    <section>
      <div className={styles.observanceHeading}><h3><UnigentamosIcon role="star" size={18} />Custom dates</h3><Button icon="plus" disabled={busy} onClick={() => { setCustomError(""); setCustom({ id: crypto.randomUUID(), title: "", date, annual: true, visible: true }); }}>Add date</Button></div>
      <p>Annual dates or one-time events, such as an anniversary.</p>
      {settings.custom.map(item => <div className={styles.customDateRow} key={item.id}>
        <label><input type="checkbox" checked={item.visible} disabled={busy} aria-label={`Show ${item.title}`} onChange={e => void onSave({ ...settings, custom: settings.custom.map(x => x.id === item.id ? { ...x, visible: e.target.checked } : x) })} /><span><strong>{item.title}</strong><small>{dateLabel(item.date, { month: "short", day: "numeric" })} · {item.annual ? "Every year" : item.date.slice(0, 4)}{item.allDay === false ? ` · ${item.startTime}–${item.endTime}` : " · All day"}</small></span></label>
        <Button icon="edit" aria-label={`Edit ${item.title}`} disabled={busy} onClick={() => { setCustomError(""); setCustom(item); }} />
        <Button icon="close" aria-label={`Remove ${item.title}`} disabled={busy} onClick={() => void onSave({ ...settings, custom: settings.custom.filter(x => x.id !== item.id) })} />
      </div>)}
      {custom && <form className={`work-form ${styles.customDateForm}`} onSubmit={async e => {
        e.preventDefault(); setCustomError("");
        try {
          const next = settings.custom.some(x => x.id === custom.id) ? settings.custom.map(x => x.id === custom.id ? custom : x) : [...settings.custom, custom];
          if (await onSave(normalizeObservances({ ...settings, custom: next }))) setCustom(undefined);
        } catch (e) { setCustomError((e as Error).message); }
      }}>
        <label>Name<input required maxLength={240} value={custom.title} placeholder="Anniversary, personal milestone…" onChange={e => setCustom({ ...custom, title: e.target.value })} /></label>
        <div className={styles.customDateToggles}>
          <label className={styles.calendarToggle}><input type="checkbox" checked={custom.allDay !== false} onChange={e => setCustom({ ...custom, allDay: e.target.checked, startTime: custom.startTime || "09:00", endTime: custom.endTime || "10:00", endDate: custom.endDate || custom.date, timeZone: custom.timeZone || zone })} /><span>All day</span></label>
          <label className={styles.calendarToggle}><input type="checkbox" checked={custom.annual} onChange={e => setCustom({ ...custom, annual: e.target.checked })} /><span>Repeat every year</span></label>
        </div>
        <div className={styles.customDateSchedule}>
          <EventDateTimePicker label={custom.allDay === false ? "Custom start" : "Custom date"} value={custom.allDay === false ? `${custom.date}T${custom.startTime}` : custom.date} allDay={custom.allDay !== false} timeZone={custom.timeZone || zone} onChange={value => setCustom({ ...custom, date: value.slice(0, 10), startTime: value.slice(11, 16) || custom.startTime, endDate: !custom.endDate || custom.endDate === custom.date ? value.slice(0, 10) : custom.endDate })} />
          {custom.allDay === false && <EventDateTimePicker label="Custom end" value={`${custom.endDate || custom.date}T${custom.endTime}`} allDay={false} timeZone={custom.timeZone || zone} onChange={value => setCustom({ ...custom, endDate: value.slice(0, 10), endTime: value.slice(11, 16) })} />}
        </div>
        {custom.allDay === false && <label>Time zone<SelectField searchable aria-label="Custom date time zone" menuClassName={styles.calendarChoiceMenu} value={custom.timeZone || zone} onChange={e => setCustom({ ...custom, timeZone: e.target.value })}>{[...new Set([zone, custom.timeZone || zone, "UTC", ...Intl.supportedValuesOf("timeZone")])].map(z => <option key={z} value={z}>{z.replaceAll("_", " ").replaceAll("/", " / ")}</option>)}</SelectField></label>}
        {customError && <p role="alert">{customError}</p>}
        <div className="work-actions"><Button type="submit" intent="primary" busy={busy}>Save date</Button><Button onClick={() => setCustom(undefined)}>Cancel</Button></div>
      </form>}
    </section>
  </div>;
}
