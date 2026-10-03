"use client";
import { calendarDisplayColor } from "./calendar-presentation";
import { useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import RecordLinks from "./RecordLinks";
import EventDateTimePicker from "./EventDateTimePicker";
import type {
  EventFields,
} from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import {
  calendarGroups,
} from "../../lib/modules/planning/calendar-groups";
import { addDays } from "../../lib/modules/planning/calendar-model";
import styles from "./CalendarWorkspace.module.css";

export default function EventEditorFields({
  fields,
  update,
  snapshot,
}: {
  fields: EventFields;
  update: <K extends keyof EventFields>(key: K, value: EventFields[K]) => void;
  snapshot?: PlanningSnapshot;
}) {
  const [recurrenceDraft, setRecurrenceDraft] = useState(fields.recurrence || "FREQ=WEEKLY;INTERVAL=1");
  const [reminderDraft, setReminderDraft] = useState(fields.reminderMinutes ?? 15);
  const [reminderUnit, setReminderUnit] = useState(() =>
    fields.reminderMinutes && fields.reminderMinutes % 1440 === 0
      ? 1440
      : fields.reminderMinutes && fields.reminderMinutes % 60 === 0
        ? 60
        : 1,
  );
  const calendar = snapshot?.state.calendars.find(
    (c) => c.id === fields.calendarId,
  );
  const rule = Object.fromEntries(
    recurrenceDraft
      .split(";")
      .filter(Boolean)
      .map((x) => x.split("=")),
  );
  const simpleRule = Object.keys(rule).every((k) =>
    ["FREQ", "INTERVAL"].includes(k),
  );
  function changeRecurrence(value: string) {
    setRecurrenceDraft(value);
    if (fields.recurrence) update("recurrence", value);
  }
  function changeReminder(value: number) {
    setReminderDraft(value);
    if (fields.reminderMinutes !== null) update("reminderMinutes", value);
  }
  const placeRef = snapshot?.refs.find(
    (r) =>
      r.module === "map" &&
      r.objectType === "place" &&
      r.objectId === fields.placeId,
  );
  const linked =
    placeRef &&
    !fields.linkedRefs.some(
      (r) => r.module === "map" && r.objectId === placeRef.objectId,
    )
      ? [...fields.linkedRefs, placeRef]
      : fields.linkedRefs;
  return (
    <>
      <label className={styles.eventDescription}>
        Description
        <textarea
          rows={2}
          placeholder="What is this time for?"
          value={fields.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </label>
      <section className={styles.groupField} aria-label="Color groups">
        <UnigentamosIcon role="palette" size={18} />
        <div className={styles.groupChoices}>
          <button
            type="button"
            aria-pressed={!fields.groupId}
            onClick={() => update("groupId", "")}
          >
            None
          </button>
          {calendarGroups(calendar).map((g) => (
            <button
              type="button"
              key={g.id}
              aria-pressed={g.id === fields.groupId}
              style={{ "--group-color": g.color } as React.CSSProperties}
              onClick={() => update("groupId", g.id)}
            >
              <UnigentamosIcon role={g.icon} size={16} />
              {g.name}
            </button>
          ))}
        </div>
      </section>
      <label className={styles.locationField}>
        <UnigentamosIcon role="location" size={18} />
        <input
          aria-label="Address or meeting link"
          placeholder="Address or meeting link"
          value={fields.location}
          onChange={(e) => update("location", e.target.value)}
        />
      </label>
      <section className={styles.editorSection} aria-label="Event schedule">
        <div className={styles.editorSectionTitle}>
          <UnigentamosIcon role="clock" size={18} />
          <strong>Date & time</strong>
          <EventCheckbox label="All day" checked={fields.allDay} onChange={(checked) => {
                update("allDay", checked);
                update(
                  "start",
                  checked
                    ? fields.start.slice(0, 10)
                    : `${fields.start.slice(0, 10)}T09:00`,
                );
                update(
                  "end",
                  checked
                    ? addDays(fields.start.slice(0, 10), 1)
                    : `${fields.start.slice(0, 10)}T10:00`,
                );
              }} />
        </div>
        <div className="work-form-pair">
          {(["start", "end"] as const).map((key) => (
            <EventDateTimePicker
              key={`${key}:${fields.allDay}`}
              label={key === "start" ? "Start" : "End"}
              allDay={fields.allDay}
              timeZone={fields.timeZone}
              value={
                fields.allDay
                  ? key === "end"
                    ? addDays(fields.end, -1)
                    : fields.start
                  : fields[key].slice(0, 16)
              }
              onChange={(value) => update(
                key,
                fields.allDay && key === "end" ? addDays(value, 1) : value,
              )}
            />
          ))}
        </div>
        <div className="work-form-pair">
          <label className={styles.editorCalendar} style={{ "--selected-calendar": calendarDisplayColor(calendar?.color) } as React.CSSProperties}>
            Calendar
            <SelectField
              value={fields.calendarId}
              onChange={(e) => {
                update("calendarId", e.target.value);
                update("groupId", "");
              }}
            >
              {snapshot?.state.calendars
                .filter((c) => !c.archivedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </SelectField>
          </label>
          <label>
            Time zone
            <input
              required
              value={fields.timeZone}
              list="event-time-zones"
              onChange={(e) => update("timeZone", e.target.value)}
            />
          </label>
        </div>
        <datalist id="event-time-zones">
          {Intl.supportedValuesOf("timeZone").map((z) => (
            <option key={z}>{z}</option>
          ))}
        </datalist>
      </section>
      <section
        className={styles.editorSection}
        aria-label="Repeat and reminder"
      >
        <div className={styles.scheduleOption} data-enabled={Boolean(fields.recurrence)}>
          <EventCheckbox icon="routine" label="Repeat" checked={Boolean(fields.recurrence)} onChange={(checked) => update("recurrence", checked ? recurrenceDraft : "")} />
          {simpleRule ? (
            <div className={styles.scheduleOptionFields}>
              <input
                aria-label="Repeat interval"
                type="number"
                min={fields.recurrence ? 1 : undefined}
                max={fields.recurrence ? 365 : undefined}
                required={Boolean(fields.recurrence)}
                value={rule.INTERVAL ?? 1}
                onChange={(e) =>
                  changeRecurrence(
                    `FREQ=${rule.FREQ || "WEEKLY"};INTERVAL=${e.target.value}`,
                  )
                }
              />
              <SelectField
                aria-label="Repeat unit"
                value={rule.FREQ}
                onChange={(e) =>
                  changeRecurrence(
                    `FREQ=${e.target.value};INTERVAL=${rule.INTERVAL || 1}`,
                  )
                }
              >
                {[
                  ["DAILY", "days"],
                  ["WEEKLY", "weeks"],
                  ["MONTHLY", "months"],
                  ["YEARLY", "years"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : (
          <label className={styles.customRecurrence}>
            Custom recurrence
            <input
              value={recurrenceDraft}
              onChange={(e) => changeRecurrence(e.target.value)}
            />
            <small>
              Imported recurrence is preserved, including its end date and
              exceptions.
            </small>
          </label>)}
        </div>
        <div className={styles.scheduleOption} data-enabled={fields.reminderMinutes !== null}>
          <EventCheckbox icon="clock" label="Reminder" checked={fields.reminderMinutes !== null} onChange={(checked) => update("reminderMinutes", checked ? reminderDraft : null)} />
          <div className={styles.scheduleOptionFields}>
              <input
                aria-label="Reminder amount"
                type="number"
                min={fields.reminderMinutes !== null ? 0 : undefined}
                max={fields.reminderMinutes !== null ? 43200 / reminderUnit : undefined}
                step="any"
                value={Number(
                  (reminderDraft / reminderUnit).toFixed(5),
                )}
                onChange={(e) =>
                  changeReminder(
                    Math.round(Number(e.target.value) * reminderUnit),
                  )
                }
              />
              <SelectField
                aria-label="Reminder unit"
                value={String(reminderUnit)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  changeReminder(
                    Math.min(
                      43200,
                      Math.round(
                        (reminderDraft / reminderUnit) * next,
                      ),
                    ),
                  );
                  setReminderUnit(next);
                }}
              >
                <option value="1">minutes before</option>
                <option value="60">hours before</option>
                <option value="1440">days before</option>
              </SelectField>
          </div>
        </div>
      </section>
      <section className={styles.editorSection} aria-label="Linked objects">
        <RecordLinks
          objectPicker
          refs={linked}
          available={snapshot?.refs}
          onChange={(refs) => {
            update("linkedRefs", refs);
            const place = refs.find(
              (r) => r.module === "map" && r.objectType === "place",
            );
            update("placeId", place?.objectId || "");
            if (place && place.objectId !== fields.placeId)
              update(
                "location",
                snapshot?.state.places.find((p) => p.id === place.objectId)
                  ?.address || place.label,
              );
          }}
        />
        {!!fields.participants?.length && (
          <div>
            <small className="work-muted">Imported participants</small>
            <p>
              {fields.participants.map((p) => p.name || p.email).join(", ")}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function EventCheckbox({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon?: string }) {
  return <label className={`${styles.quietToggle} ${styles.eventCheckbox}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className={styles.checkboxMark} aria-hidden="true"><UnigentamosIcon role="check" size={13} /></span>
    {icon && <UnigentamosIcon role={icon} size={16} />}
    <span>{label}</span>
  </label>;
}
